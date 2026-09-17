import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { prisma } from "./config/db.js";
import { initSocket } from "./socket.js";
import { authRouter } from "./routes/auth.js";
import { tournamentRouter } from "./routes/tournaments.js";
import { matchRouter } from "./routes/matches.js";
import { bookingRouter } from "./routes/bookings.js";
import { subscriptionRouter } from "./routes/subscriptions.js";
import { profileRouter } from "./routes/profile.js";
import { clubRouter } from "./routes/clubs.js";
import { gameRouter } from "./routes/games.js";
import { playerRouter, ratingRouter } from "./routes/players.js";
import { liveRouter, publicRouter } from "./routes/public.js";

const app = express();
const server = http.createServer(app);

app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map(s => s.trim());
app.use(cors({ origin: (origin, cb) => { if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) cb(null, true); else cb(new Error("Not allowed")); }, credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

app.use("/api/auth", authRouter);
app.use("/api/tournaments", tournamentRouter);
app.use("/api/matches", matchRouter);
app.use("/api/bookings", bookingRouter);
app.use("/api/subscriptions", subscriptionRouter);
app.use("/api/profile", profileRouter);
app.use("/api/clubs", clubRouter);
app.use("/api/games", gameRouter);
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

  initSocket(server);

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

export { app, server };
