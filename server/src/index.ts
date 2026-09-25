import "dotenv/config";
import { prisma } from "./config/db";
import { createApp } from "./app";
import { jwtSecret } from "./middleware/auth";

const app = createApp({ defaultClientUrl: "http://localhost:5173" });
const PORT = process.env.PORT || 3000;

// Route handlers pass their errors to Express (shared/router.ts); this is the net
// under anything else, so a stray rejection is logged instead of ending the
// process — and with it every club night on this server.
process.on("unhandledRejection", (reason: any) => {
  console.error("[UNHANDLED]", reason?.message ?? reason);
});

async function main() {
  jwtSecret(); // refuse to start without a signing secret
  await prisma.$connect();
  console.log("Connected to database");

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
