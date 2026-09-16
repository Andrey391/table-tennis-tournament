import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@localhost" },
    update: {},
    create: { email: "admin@localhost", password, firstName: "Admin", lastName: "Admin", role: "ADMIN", club: "System" },
  });
  console.log("Admin user:", admin.email);

  const organizer = await prisma.user.upsert({
    where: { email: "organizer@localhost" },
    update: {},
    create: { email: "organizer@localhost", password, firstName: "Organizer", lastName: "User", role: "ORGANIZER", club: "System" },
  });
  console.log("Organizer user:", organizer.email);

  const playerNames = [
    { firstName: "Ivan", lastName: "Petrov", club: "Moscow TT" },
    { firstName: "Sergei", lastName: "Ivanov", club: "St. Petersburg TT" },
    { firstName: "Dmitry", lastName: "Sidorov", club: "Kazan TT" },
    { firstName: "Alexei", lastName: "Smirnov", club: "Novosibirsk TT" },
    { firstName: "Nikolai", lastName: "Kuznetsov", club: "Moscow TT" },
    { firstName: "Andrei", lastName: "Popov", club: "Samara TT" },
    { firstName: "Pavel", lastName: "Volkov", club: "Nizhny Novgorod TT" },
    { firstName: "Maxim", lastName: "Novikov", club: "Yekaterinburg TT" },
    { firstName: "Viktor", lastName: "Morozov", club: "Chelyabinsk TT" },
    { firstName: "Alexander", lastName: "Lebedev", club: "Rostov TT" },
    { firstName: "Mikhail", lastName: "Sokolov", club: "Krasnodar TT" },
    { firstName: "Eugene", lastName: "Fedorov", club: "Voronezh TT" },
  ];

  for (const p of playerNames) {
    const user = await prisma.user.upsert({
      where: { email: `${p.firstName.toLowerCase()}@localhost` },
      update: {},
      create: {
        email: `${p.firstName.toLowerCase()}@localhost`,
        password,
        firstName: p.firstName,
        lastName: p.lastName,
        role: "PLAYER",
        club: p.club,
        rating: Math.floor(Math.random() * 400) + 100,
      },
    });
    console.log(`Player: ${user.firstName} ${user.lastName} (${user.club})`);
  }

  console.log("Seed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
