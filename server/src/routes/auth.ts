import { Router, Response } from "express";
import { publicError } from "../shared/errors";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware, generateToken } from "../middleware/auth";
import { LoginSchema, SelfRegisterSchema, ClaimDemoSchema } from "../shared/schemas";
import { createDemoAccount, sweepExpiredDemos, DEMO_TTL_HOURS } from "../shared/demo";
import bcrypt from "bcryptjs";

export const authRouter = Router();

// The session user, as /auth/me, /auth/demo and /auth/claim all return it. The
// client keeps this object for the whole page load, so anything a screen has to
// know about the account — `isDemo` above all, which decides whether the demo
// banner and the tour show up — belongs here and nowhere else.
const meSelect = {
  id: true, email: true, firstName: true, lastName: true, role: true, club: true, city: true,
  rating: true, dateOfBirth: true, phone: true, isDemo: true, demoExpiresAt: true,
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
      user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, rating: user.rating, club: user.club },
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
    const data = SelfRegisterSchema.parse(req.body);
    const hashed = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({ data: { ...data, password: hashed, role: "ORGANIZER" } });
    const token = generateToken(user.id, user.role);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, rating: user.rating, club: user.club },
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
    res.status(201).json({ token: generateToken(demo.userId, demo.role), user, tournamentId: demo.tournamentId });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Turns the demo account the caller is signed in as into a real one: same row,
// so the evening they just ran stays theirs. The sparring partners keep
// `isDemo` (they are not people, and have no business in the rating list) but
// lose their expiry, or the sweep would delete the matches out from under it.
authRouter.post("/claim", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = ClaimDemoSchema.parse(req.body);
    const current = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, isDemo: true } });
    if (!current) { res.status(401).json({ error: "Account no longer exists" }); return; }
    if (!current.isDemo) { res.status(400).json({ error: "This account is already a real one" }); return; }

    const hashed = await bcrypt.hash(data.password, 10);
    const [user] = await prisma.$transaction([
      prisma.user.update({
        where: { id: current.id },
        data: { ...data, password: hashed, isDemo: false, demoExpiresAt: null },
        select: meSelect,
      }),
      prisma.user.updateMany({ where: { demoOwnerId: current.id }, data: { demoExpiresAt: null } }),
    ]);
    res.json({ user });
  } catch (err: any) {
    if (err.code === "P2002") { res.status(400).json({ error: "An account with this email already exists" }); return; }
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
  if (!user) { res.status(401).json({ error: "Account no longer exists" }); return; }
  res.json(user);
});
