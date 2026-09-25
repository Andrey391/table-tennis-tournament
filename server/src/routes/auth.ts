import { Response } from "express";
import { Router } from "../shared/router";
import { publicError } from "../shared/errors";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware, generateToken } from "../middleware/auth";
import { LoginSchema, SelfRegisterSchema, ClaimDemoSchema, DemoJoinSchema, DeleteAccountSchema, ForgotPasswordSchema, ResetPasswordSchema } from "../shared/schemas";
import { CONSENT_VERSION, anonymiseAccount } from "../shared/privacy";
import { createDemoAccount, sweepExpiredDemos, joinDemoSeat, DemoJoinError, DEMO_TTL_HOURS } from "../shared/demo";
import { sendMail } from "../shared/mail";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

export const authRouter = Router();

// The session user, as /auth/me, /auth/demo and /auth/claim all return it. The
// client keeps this object for the whole page load, so anything a screen has to
// know about the account — `isDemo` above all, which decides whether the demo
// banner and the tour show up — belongs here and nowhere else.
const meSelect = {
  id: true, email: true, firstName: true, lastName: true, role: true, city: true,
  rating: true, dateOfBirth: true, phone: true, isDemo: true, demoExpiresAt: true,
  publicProfile: true, consentAt: true, deletedAt: true,
};

authRouter.post("/login", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = generateToken(user.id, user.role);
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, rating: user.rating },
    });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Open self-signup, same as the Vercel copy: the client ships a Register screen,
// so requiring an already-signed-in ADMIN here left a brand-new user staring at a
// 401 on the very first thing they try. The role is never read from the body —
// everyone signs up as an ORGANIZER, which only means they can run their own
// events (per-tournament ownership is what actually gates anything).
authRouter.post("/register", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { acceptTerms: _accepted, ...data } = SelfRegisterSchema.parse(req.body);
    const hashed = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({ data: { ...data, password: hashed, role: "ORGANIZER", consentAt: new Date(), consentVersion: CONSENT_VERSION } });
    const token = generateToken(user.id, user.role);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, rating: user.rating },
    });
  } catch (err: any) {
    if (err.code === "P2002") { res.status(400).json({ error: "An account with this email already exists" }); return; }
    res.status(400).json({ error: publicError(err) });
  }
});

// Hands a visitor a throwaway account with a club night already on the roster,
// no credentials asked. Everything it owns is hidden from the rating list and
// the feed and is deleted after DEMO_TTL_HOURS — see shared/demo.ts.
authRouter.post("/demo", async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // Neither host runs a scheduler, so the sweep rides along with the only
    // request that can add to the pile. Its failure must not cost the visitor
    // their demo, hence the catch.
    await sweepExpiredDemos().catch(() => {});
    const demo = await createDemoAccount();
    const user = await prisma.user.findUnique({ where: { id: demo.userId }, select: meSelect });
    res.status(201).json({ token: generateToken(demo.userId, demo.role, { demo: true }), user, tournamentId: demo.tournamentId });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// The invitation link: a second visitor takes the sparring partner's seat in a
// demo event as a guest account of their own, and lands in the same match the
// manager sees. No credentials asked, like /demo — the link itself is the ticket.
authRouter.post("/demo/join", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tournamentId } = DemoJoinSchema.parse(req.body);
    const joined = await joinDemoSeat(tournamentId);
    const user = await prisma.user.findUnique({ where: { id: joined.userId }, select: meSelect });
    res.status(201).json({ token: generateToken(joined.userId, joined.role, { demo: true }), user, tournamentId, matchId: joined.matchId });
  } catch (err: any) {
    if (err instanceof DemoJoinError) { res.status(err.status).json({ error: err.message }); return; }
    res.status(400).json({ error: publicError(err) });
  }
});

// Turns the demo account the caller is signed in as into a real one: same row,
// so the evening they just ran stays theirs. The sparring partners keep
// `isDemo` (they are not people, and have no business in the rating list) but
// lose their expiry, or the sweep would delete the matches out from under it.
authRouter.post("/claim", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { acceptTerms: _accepted, ...data } = ClaimDemoSchema.parse(req.body);
    const current = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, isDemo: true } });
    if (!current) { res.status(401).json({ error: "Account no longer exists" }); return; }
    if (!current.isDemo) { res.status(400).json({ error: "This account is already a real one" }); return; }

    const hashed = await bcrypt.hash(data.password, 10);
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: current.id },
        data: { ...data, password: hashed, isDemo: false, demoExpiresAt: null, consentAt: new Date(), consentVersion: CONSENT_VERSION },
        select: meSelect,
      }),
      prisma.user.updateMany({ where: { demoOwnerId: current.id }, data: { demoExpiresAt: null } }),
    ]);
    // A fresh token: the demo one does not count as a signed-in account.
    res.json({ user, token: generateToken(user.id, user.role) });
  } catch (err: any) {
    if (err.code === "P2002") { res.status(400).json({ error: "An account with this email already exists" }); return; }
    res.status(400).json({ error: publicError(err) });
  }
});

// --- Forgot password -------------------------------------------------------
// Two steps: /forgot mails a 6-digit code, /reset trades it for a new password
// and signs the user in. Only a hash of the code is kept (PasswordReset).
const RESET_TTL_MIN = 15;
const RESET_MAX_ATTEMPTS = 5;
const RESET_RESEND_SEC = 60;

// Addresses are stored as typed, so look them up case-insensitively. Demo and
// seed accounts have addresses nobody can receive mail at, and a deleted
// account has no login to restore.
const findResettableUser = (email: string) => prisma.user.findFirst({
  where: { email: { equals: email, mode: "insensitive" }, isDemo: false, deletedAt: null, NOT: [{ email: { endsWith: "@demo.local" } }, { email: { endsWith: "@localhost" } }] },
  select: { id: true, email: true, firstName: true },
});

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Always answers the same 200, whether or not the address has an account: the
// form must not be a way to find out who is registered.
authRouter.post("/forgot", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email } = ForgotPasswordSchema.parse(req.body);
    const user = await findResettableUser(email);
    if (user) {
      const recent = await prisma.passwordReset.findFirst({
        where: { userId: user.id, createdAt: { gt: new Date(Date.now() - RESET_RESEND_SEC * 1000) } },
        select: { id: true },
      });
      if (!recent) {
        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const codeHash = await bcrypt.hash(code, 10);
        await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
        await prisma.passwordReset.create({ data: { userId: user.id, codeHash, expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000) } });
        try {
          await sendMail({
            to: user.email,
            subject: `Код для смены пароля: ${code}`,
            text: `${user.firstName}, ваш код для смены пароля: ${code}

Код действует ${RESET_TTL_MIN} минут. Если вы не запрашивали смену пароля, просто проигнорируйте это письмо.`,
            html: `<p>${escapeHtml(user.firstName)}, ваш код для смены пароля:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>Код действует ${RESET_TTL_MIN} минут. Если вы не запрашивали смену пароля, просто проигнорируйте это письмо.</p>`,
          });
        } catch (err) {
          // A code nobody received is useless; drop it so the next request is not throttled.
          console.error("password reset mail failed", err);
          await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
          res.status(503).json({ error: "Could not send the email, try again later" });
          return;
        }
      }
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

authRouter.post("/reset", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, code, newPassword } = ResetPasswordSchema.parse(req.body);
    const invalid = () => res.status(400).json({ error: "Invalid or expired code" });
    const user = await findResettableUser(email);
    if (!user) { invalid(); return; }
    const reset = await prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: RESET_MAX_ATTEMPTS } },
      orderBy: { createdAt: "desc" },
    });
    if (!reset) { invalid(); return; }
    // The try is spent before the code is compared, by a write that only succeeds
    // while tries are left: counting after the compare let a burst of parallel
    // guesses all see "0 tries used" and get far more than five.
    const { count } = await prisma.passwordReset.updateMany({
      where: { id: reset.id, attempts: { lt: RESET_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (!count || !(await bcrypt.compare(code, reset.codeHash))) { invalid(); return; }
    const password = await bcrypt.hash(newPassword, 10);
    const updated = await prisma.user.update({ where: { id: user.id }, data: { password }, select: meSelect });
    await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
    res.json({ token: generateToken(updated.id, updated.role), user: updated });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

authRouter.get("/me", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: meSelect,
  });
  // The JWT is self-contained, so a token outlives the account it was issued for
  // (e.g. after the database is reset). Answering 200 with a null body would leave
  // the client "signed in" as nobody until some later write blew up on a foreign
  // key — 401 makes it drop the token and send the user back to the login screen.
  if (!user || user.deletedAt) { res.status(401).json({ error: "Account no longer exists" }); return; }
  const { deletedAt: _deleted, ...me } = user;
  res.json(me);
});

// The owner deletes their account (152-FZ: withdrawing consent means the data
// goes). See anonymiseAccount for what is kept and why. A demo account has no
// password its visitor knows and deletes itself within a day anyway.
authRouter.delete("/me", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { password } = DeleteAccountSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, password: true, isDemo: true, deletedAt: true } });
    if (!user || user.deletedAt) { res.status(401).json({ error: "Account no longer exists" }); return; }
    if (user.isDemo) { res.status(400).json({ error: "A demo account is deleted automatically" }); return; }
    if (!(await bcrypt.compare(password, user.password))) { res.status(400).json({ error: "Wrong password" }); return; }
    await anonymiseAccount(user.id);
    res.json({ deleted: true });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});
