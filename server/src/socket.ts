import { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import { prisma } from "./config/db.js";

let io: Server | null = null;

export function initSocket(server: HTTPServer): Server {
  io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL || "http://localhost:5173", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[WS] Connected: ${socket.id}`);

    socket.on("join-tournament", (tournamentId: string) => {
      socket.join(`tournament:${tournamentId}`);
      console.log(`[WS] ${socket.id} joined tournament:${tournamentId}`);
    });

    socket.on("join-match", (matchId: string) => {
      socket.join(`match:${matchId}`);
    });

    socket.on("leave-match", (matchId: string) => {
      socket.leave(`match:${matchId}`);
    });

    socket.on("score-update", async (data: { matchId: string; score1: number; score2: number; gamesWon1: number; gamesWon2: number }) => {
      try {
        const match = await prisma.match.update({
          where: { id: data.matchId },
          data: {
            score1: data.score1,
            score2: data.score2,
            gamesWon1: data.gamesWon1,
            gamesWon2: data.gamesWon2,
            status: "IN_PROGRESS",
            startedAt: new Date(),
          },
        });
        io?.to(`match:${data.matchId}`).emit("score-changed", match);
        io?.to(`tournament:${match.tournamentId}`).emit("match-updated", match);
      } catch (err: any) {
        console.error("[WS] Score update error:", err.message);
        socket.emit("error", { message: "Failed to update score" });
      }
    });

    socket.on("match-end", async (matchId: string) => {
      try {
        const match = await prisma.match.update({
          where: { id: matchId },
          data: { status: "COMPLETED", endedAt: new Date() },
        });
        io?.to(`match:${matchId}`).emit("match-ended", match);
        io?.to(`tournament:${match.tournamentId}`).emit("match-ended", match);
      } catch (err: any) {
        console.error("[WS] Match end error:", err.message);
      }
    });

    socket.on("game-update", (data: { matchId: string; gameNumber: number; player1Score: number; player2Score: number }) => {
      io?.to(`match:${data.matchId}`).emit("game-changed", data);
    });

    socket.on("disconnect", () => {
      console.log(`[WS] Disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIo(): Server | null {
  return io;
}
