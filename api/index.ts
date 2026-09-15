import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { prisma } from "../server/src/config/db.js";
import { authRouter } from "../server/src/routes/auth.js";
import { tournamentRouter } from "../server/src/routes/tournaments.js";
import { matchRouter } from "../server/src/routes/matches.js";

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

app.use("/api/auth", authRouter);
app.use("/api/tournaments", tournamentRouter);
app.use("/api/matches", matchRouter);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
