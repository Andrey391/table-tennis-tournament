import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { authNetworkLimit, demoLimit, generalLimit, joinLimit, loginLimit, resetLimit } from "./middleware/rateLimits";
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
import { maskHiddenPlayers } from "./shared/privacy";
import { publicError } from "./shared/errors";

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
  // An event page is every match with its sets and is polled every few seconds;
  // gzip shrinks that JSON several times over on a phone's connection.
  app.use(compression());
  app.use(express.json({ limit: "100kb" }));
  // Keyed on the account when there is one, not the IP: a whole club shares one
  // Wi-Fi address. See middleware/rateLimits.ts.
  app.use(generalLimit);
  app.use(["/api/auth/login", "/api/auth/register"], authNetworkLimit);
  app.use("/api/auth/login", loginLimit);
  app.use(["/api/auth/forgot", "/api/auth/reset"], resetLimit);
  app.use("/api/auth/demo", demoLimit);
  app.use("/api/tournaments/:id/join", joinLimit);

  // A player who has not agreed to their name being public is masked in every
  // response to a visitor who is not signed in (152-FZ art. 10.1).
  app.use("/api", maskHiddenPlayers);

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

  // Everything a handler throws ends up here (shared/router.ts passes async
  // rejections on), never as an unhandled rejection that would end the process.
  // A request Prisma or Zod refuses is the caller's mistake, not ours.
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) { next(err); return; }
    console.error("[ERROR]", err?.message);
    if (err?.name === "ZodError" || err?.name === "PrismaClientValidationError" || err?.type === "entity.parse.failed") {
      res.status(400).json({ error: publicError(err) });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
