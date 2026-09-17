import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@localhost" },
    update: {},
    create: { email: "admin@localhost", password, firstName: "Admin", lastName: "Admin", role: "ADMIN", club: "System", city: "Moscow" },
  });
  console.log("Admin user:", admin.email);

  const organizer = await prisma.user.upsert({
    where: { email: "organizer@localhost" },
    update: {},
    create: { email: "organizer@localhost", password, firstName: "Organizer", lastName: "User", role: "ORGANIZER", club: "System", city: "Moscow" },
  });
  console.log("Organizer user:", organizer.email);

  // One venue with tables, so the Play screen has something to book straight away.
  const club = await prisma.club.upsert({
    where: { name_city: { name: "Moscow TT", city: "Moscow" } },
    update: {},
    create: { name: "Moscow TT", city: "Moscow", address: "Ul. Primernaya 1", phone: "+7 900 000-00-00", createdById: admin.id },
  });
  for (const number of [1, 2, 3, 4]) {
    await prisma.clubTable.upsert({
      where: { clubId_number: { clubId: club.id, number } },
      update: {},
      create: { clubId: club.id, number },
    });
  }
  console.log(`Club: ${club.name} (${club.city}) with 4 tables`);

  const playerNames = [
    { firstName: "Ivan", lastName: "Petrov", club: "Moscow TT", city: "Moscow" },
    { firstName: "Sergei", lastName: "Ivanov", club: "St. Petersburg TT", city: "St. Petersburg" },
    { firstName: "Dmitry", lastName: "Sidorov", club: "Kazan TT", city: "Kazan" },
    { firstName: "Alexei", lastName: "Smirnov", club: "Novosibirsk TT", city: "Novosibirsk" },
    { firstName: "Nikolai", lastName: "Kuznetsov", club: "Moscow TT", city: "Moscow" },
    { firstName: "Andrei", lastName: "Popov", club: "Samara TT", city: "Samara" },
    { firstName: "Pavel", lastName: "Volkov", club: "Nizhny Novgorod TT", city: "Nizhny Novgorod" },
    { firstName: "Maxim", lastName: "Novikov", club: "Yekaterinburg TT", city: "Yekaterinburg" },
    { firstName: "Viktor", lastName: "Morozov", club: "Chelyabinsk TT", city: "Chelyabinsk" },
    { firstName: "Alexander", lastName: "Lebedev", club: "Rostov TT", city: "Rostov" },
    { firstName: "Mikhail", lastName: "Sokolov", club: "Krasnodar TT", city: "Krasnodar" },
    { firstName: "Eugene", lastName: "Fedorov", club: "Voronezh TT", city: "Voronezh" },
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
        city: p.city,
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
