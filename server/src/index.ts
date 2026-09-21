import "dotenv/config";
import { prisma } from "./config/db";
import { createApp } from "./app";
import { jwtSecret } from "./middleware/auth";

const app = createApp({ defaultClientUrl: "http://localhost:5173" });
const PORT = process.env.PORT || 3000;

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
