import { Request } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { jwtSecret } from "./auth";

// Rate limits, keyed on who is asking rather than only on where from.
//
// Everything used to be keyed on the client IP, and a club night is exactly the
// case that breaks: every phone in the hall sits on the same Wi-Fi (and a mobile
// carrier's CGNAT shares addresses too), so a handful of scoring screens polling
// every 2s used up one "IP"'s allowance, and the twenty people signing in at the
// start of the evening locked the twenty-first out. So:
//   - a request with a valid token counts against its account, not its address;
//   - an anonymous one (a spectator's live board) against its IP, with room for a
//     hall full of them;
//   - sign-in and password reset against IP + the address being tried, so guessing
//     one account's password stays slow while a room of people can all log in.
// Limits live in memory, so on serverless each instance counts on its own: a
// floor, not a guarantee.

const WINDOW = 15 * 60 * 1000;
const tooMany = (error: string) => ({ error });

function tokenUser(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return (jwt.verify(header.slice(7), jwtSecret()) as { userId?: string }).userId ?? null;
  } catch {
    return null;
  }
}

const ip = (req: Request) => req.ip ?? "unknown";
const email = (req: Request) => (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "");
const who = (req: Request) => { const id = tokenUser(req); return id ? `u:${id}` : `ip:${ip(req)}`; };

// Everything. One scoring screen is ~450 requests per 15 min (2s poll) plus the
// bell; an account gets room for two screens and change. Anonymous traffic from
// one address is a whole hall of spectators on the live board.
export const generalLimit = rateLimit({
  windowMs: WINDOW,
  keyGenerator: who,
  limit: (req) => (tokenUser(req) ? 3000 : 10000),
});

// Password guessing: a few tries per address being tried, from one network.
export const loginLimit = rateLimit({
  windowMs: WINDOW, limit: 10,
  keyGenerator: (req) => `${ip(req)}|${email(req)}`,
  message: tooMany("Too many attempts, try again later"),
});

// Sign-up and sign-in together, per network: loose enough for a club's first
// evening, tight enough that one address cannot mass-create accounts.
export const authNetworkLimit = rateLimit({
  windowMs: WINDOW, limit: 200, keyGenerator: ip,
  message: tooMany("Too many attempts, try again later"),
});

// A reset code is 6 digits with 5 tries per code; this caps the letters and the
// guesses per address being reset.
export const resetLimit = rateLimit({
  windowMs: WINDOW, limit: 10,
  keyGenerator: (req) => `${ip(req)}|${email(req)}`,
  message: tooMany("Too many attempts, try again later"),
});

// A demo writes a guest, a sparring partner and an event with no credentials at
// all. Per network per hour: enough to show it to a room, not enough to fill the
// database (unclaimed demos are swept after a day).
export const demoLimit = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: ip,
  message: tooMany("Too many demo sessions, try again later"),
});

// Self-join requests are unmoderated until the manager approves them; this keeps
// one account from flooding a pending list. Per account, since the route needs
// one and the whole room joins the same event from the same Wi-Fi.
export const joinLimit = rateLimit({
  windowMs: WINDOW, limit: 10, keyGenerator: who,
  message: tooMany("Too many join requests, try again later"),
});
