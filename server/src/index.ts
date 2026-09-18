import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { prisma } from "./config/db.js";
import { authRouter } from "./routes/auth.js";
import { tournamentRouter } from "./routes/tournaments.js";
import { matchRouter } from "./routes/matches.js";
import { bookingRouter } from "./routes/bookings.js";
import { subscriptionRouter } from "./routes/subscriptions.js";
import { profileRouter } from "./routes/profile.js";
import { clubRouter } from "./routes/clubs.js";
import { playerRouter, ratingRouter } from "./routes/players.js";
import { liveRouter, publicRouter } from "./routes/public.js";

const app = express();
const server = http.createServer(app);

// Render sits behind a proxy; the rate limit keys on the real client IP.
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map(s => s.trim());
app.use(cors({ origin: (origin, cb) => { if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) cb(null, true); else cb(new Error("Not allowed")); }, credentials: true }));
app.use(express.json({ limit: "100kb" }));
// The scoring screen polls every 2s (~450 requests per 15 min), so the general
// limit has to sit above that; sign-in and sign-up get their own strict one
// against password guessing.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1500 }));
app.use(["/api/auth/login", "/api/auth/register"], rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many attempts, try again later" } }));

app.use("/api/auth", authRouter);
app.use("/api/tournaments", tournamentRouter);
app.use("/api/matches", matchRouter);
app.use("/api/bookings", bookingRouter);
app.use("/api/subscriptions", subscriptionRouter);
app.use("/api/profile", profileRouter);
app.use("/api/clubs", clubRouter);
app.use("/api/players", playerRouter);
app.use("/api/rating", ratingRouter);
app.use("/api/live", liveRouter);
app.use("/api/public", publicRouter);

app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3000;

async function main() {
  await prisma.$connect();
  console.log("Connected to database");


  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

export { app, server };
