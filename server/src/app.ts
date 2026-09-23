import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authRouter } from "./routes/auth";
import { tournamentRouter } from "./routes/tournaments";
import { matchRouter } from "./routes/matches";
import { bookingRouter } from "./routes/bookings";
import { subscriptionRouter } from "./routes/subscriptions";
import { profileRouter } from "./routes/profile";
import { clubRouter } from "./routes/clubs";
import { playerRouter, ratingRouter } from "./routes/players";
import { liveRouter, publicRouter } from "./routes/public";
import { statsRouter } from "./routes/stats";
import { setupRouter } from "./routes/setup";
import { notificationRouter } from "./routes/notifications";

// The whole HTTP API, built once and shared by both deployments: server/src/index.ts
// listens on a port with it (Render, local), api/index.ts exports it as the Vercel
// serverless handler. There used to be a second, hand-copied implementation of every
// route in api/index.ts; keep it that way only if you enjoy fixing a bug twice.
//
// `defaultClientUrl` is the origin allowed by CORS when CLIENT_URL is not set. The
// standalone server passes its Vite dev origin; on Vercel the client is served from
// the same origin, which needs no CORS at all, so it passes nothing.
export function createApp(options: { defaultClientUrl?: string } = {}) {
  const app = express();

  // Both hosts sit behind a proxy; the rate limit keys on the real client IP.
  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  const allowedOrigins = (process.env.CLIENT_URL || options.defaultClientUrl || "").split(",").map(s => s.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins.includes("*") ? true : allowedOrigins.length ? allowedOrigins : false, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  // The scoring screen polls every 2s (~450 requests per 15 min), so the general
  // limit has to sit above that; sign-in and sign-up get their own strict one
  // against password guessing. (Per instance on serverless: a floor, not a guarantee.)
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1500 }));
  app.use(["/api/auth/login", "/api/auth/register"], rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many attempts, try again later" } }));
  // Starting a demo writes a guest, seven sparring partners and an event, and
  // needs no credentials at all — so it gets a limit of its own, tighter than the
  // overall one and looser than sign-in (one visitor may legitimately restart it).
  app.use("/api/auth/demo", rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { error: "Too many demo sessions, try again later" } }));
  // Self-join requests are unmoderated until the manager approves them, so a
  // narrower limit than the general one keeps a single account from flooding a
  // tournament's pending list.
  app.use("/api/tournaments/:id/join", rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: "Too many join requests, try again later" } }));

  app.use("/api/auth", authRouter);
  app.use("/api/tournaments", tournamentRouter);
  app.use("/api/matches", matchRouter);
  app.use("/api/bookings", bookingRouter);
  app.use("/api/subscriptions", subscriptionRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/clubs", clubRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api", statsRouter);
  app.use("/api/players", playerRouter);
  app.use("/api/rating", ratingRouter);
  app.use("/api/live", liveRouter);
  app.use("/api/public", publicRouter);
  app.use("/api/setup", setupRouter);

  app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[ERROR]", err.message);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
