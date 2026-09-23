import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../config/db";

// Personal data under 152-FZ: what a signup consents to, who may see a name, and
// what deleting an account leaves behind.

// The privacy policy version a signup consents to. Bump it together with the text
// of client/src/lib/legal.ts whenever the policy changes, so `User.consentVersion`
// says which text each person actually agreed to.
export const CONSENT_VERSION = "2026-09-23";

// Who may appear in a public list of players (the rating list, the leaderboards):
// real, not deleted, and consented to their name being shown to anyone.
export const listed = { isDemo: false, deletedAt: null, publicProfile: true };

// A visitor who is not signed in is "anyone at all" — the audience 152-FZ art. 10.1
// needs a separate consent for. Signed-in users see each other's names under the
// terms of use (they play together); guests see a player's name only if that player
// agreed to it. Masking is done on the way out, over the whole response, rather
// than in every select: names reach a guest through standings, podiums, match
// rows, head-to-heads and more, and one missed select would be a leak.
function isSignedIn(req: Request): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return false;
    jwt.verify(header.split(" ")[1], secret);
    return true;
  } catch { return false; }
}

type Person = Record<string, any>;

// Every object that carries a name, keyed by the user id it belongs to (`id` on a
// user row, `userId` on a standings row).
function collectPeople(value: unknown, out: Map<string, Person[]>, depth = 0) {
  if (!value || typeof value !== "object" || depth > 12) return;
  if (Array.isArray(value)) { for (const v of value) collectPeople(v, out, depth + 1); return; }
  const obj = value as Person;
  if (typeof obj.firstName === "string") {
    const id = typeof obj.userId === "string" ? obj.userId : typeof obj.id === "string" ? obj.id : null;
    if (id) out.set(id, [...(out.get(id) ?? []), obj]);
  }
  for (const key of Object.keys(obj)) collectPeople(obj[key], out, depth + 1);
}

function hiddenLabel(req: Request) {
  return req.headers["x-lang"] === "en" ? "Hidden player" : "Скрытый игрок";
}

function mask(obj: Person, label: string) {
  obj.firstName = label;
  obj.lastName = "";
  if ("club" in obj) obj.club = null;
  if ("city" in obj) obj.city = null;
}

export function maskHiddenPlayers(req: Request, res: Response, next: NextFunction) {
  if (isSignedIn(req)) { next(); return; }
  const send = res.json.bind(res);
  res.json = ((body: unknown) => {
    const people = new Map<string, Person[]>();
    collectPeople(body, people);
    if (!people.size) return send(body);
    const label = hiddenLabel(req);
    prisma.user.findMany({ where: { id: { in: [...people.keys()] }, OR: [{ publicProfile: false }, { deletedAt: { not: null } }] }, select: { id: true } })
      .then(hidden => { for (const h of hidden) for (const p of people.get(h.id) ?? []) mask(p, label); })
      // Fail closed: with no answer on who agreed to be shown, show nobody.
      .catch(() => { for (const list of people.values()) for (const p of list) mask(p, label); })
      .finally(() => send(body));
    return res;
  }) as Response["json"];
  next();
}

// Deleting an account (152-FZ arts. 14, 21: the data goes once consent is
// withdrawn). The row itself stays — the matches it played are part of other
// players' standings and moved their ratings — but everything that identifies the
// person is overwritten, the login is made unusable, and what was theirs alone
// (inbox, chat messages, follows, pending requests, audit trail) is deleted.
// Bookings stay with the anonymised row: they are the club's record of its tables.
export async function anonymiseAccount(userId: string) {
  const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
  // A batch, not an interactive transaction: the pooler in front of Postgres
  // drops sessions held open across round trips (see shared/demo.ts).
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.chatMessage.deleteMany({ where: { userId } }),
    prisma.subscription.deleteMany({ where: { userId } }),
    prisma.auditLog.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    // A roster row with no match behind it is just a sign-up; one with matches
    // has to stay, or those matches drop out of the event's standings.
    prisma.tournamentUser.deleteMany({
      where: { userId, OR: [{ status: "PENDING" }, { tournament: { matches: { none: { OR: [{ player1Id: userId }, { player2Id: userId }] } } } }] },
    }),
    prisma.club.updateMany({ where: { createdById: userId }, data: { createdById: null } }),
    // User.club is no longer mapped, but old rows still hold whatever was typed
    // into it, and that is personal data too.
    prisma.$executeRaw`UPDATE "User" SET "club" = NULL WHERE "id" = ${userId}`,
    prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.invalid`, password: unusablePassword,
        firstName: "Удалённый игрок", lastName: "", city: null, phone: null, dateOfBirth: null,
        publicProfile: false, deletedAt: new Date(),
      },
    }),
  ]);
}
