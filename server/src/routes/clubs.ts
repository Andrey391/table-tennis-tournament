import { Response } from "express";
import { Router } from "../shared/router";
import { publicError } from "../shared/errors";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth";
import { CreateClubSchema, UpdateClubSchema, CreateClubTableSchema, UpdateClubTableSchema } from "../shared/schemas";
import { bookingsOverlap, startOfUtcDay } from "../shared/booking";
import { queryString, queryDate, cityIs, playerSelect } from "../shared/queries";
import { normalizeCity, cityKey } from "../shared/city";

export const clubRouter = Router();

// Same ownership rule as tournaments: whoever created the club manages it.
// A club with no manager (carried over from the old free-text bookings, or left
// behind by a deleted or expired account) is not open to everyone: only an ADMIN
// may edit it, and the role is read from the database, not from the token.
async function loadOwnedClub(res: Response, clubId: string, userId: string) {
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) { res.status(404).json({ error: "Not found" }); return null; }
  if (club.createdById === userId) return club;
  if (!club.createdById) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true } });
    if (me?.role === "ADMIN" && !me.deletedAt) return club;
  }
  res.status(403).json({ error: "Only the club's manager can do this" });
  return null;
}

clubRouter.get("/", async (req, res: Response) => {
  const city = queryString(req.query.city);
  const q = queryString(req.query.q);
  const clubs = await prisma.club.findMany({
    where: {
      ...(city ? { city: cityIs(city) } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    include: {
      _count: { select: { tables: true, subscriptions: true, tournaments: true } },
      tables: { select: { pricePerHour: true } },
    },
    orderBy: [{ city: "asc" }, { name: "asc" }],
  });
  // The list card shows "from N per hour": the cheapest priced table, or null
  // when no table has a price (booking there is free).
  res.json(clubs.map(({ tables, ...c }) => {
    const prices = tables.map(t => t.pricePerHour).filter((p): p is number => p != null);
    return { ...c, minPrice: prices.length ? Math.min(...prices) : null };
  }));
});

// Powers the "your city" picker on the home screen — must stay above "/:id".
// One entry per city however it was typed: "Москва", "москва" and "Москва " are the
// same place. The label is the spelling most clubs used.
clubRouter.get("/cities", async (_req, res: Response) => {
  const rows = await prisma.club.findMany({ select: { city: true } });
  const byKey = new Map<string, Map<string, number>>();
  for (const { city } of rows) {
    const label = normalizeCity(city);
    if (!label) continue;
    const spellings = byKey.get(cityKey(label)) ?? new Map<string, number>();
    spellings.set(label, (spellings.get(label) ?? 0) + 1);
    byKey.set(cityKey(label), spellings);
  }
  const cities = [...byKey.values()].map(spellings => ({
    city: [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    clubs: [...spellings.values()].reduce((n, c) => n + c, 0),
  }));
  res.json(cities.sort((a, b) => a.city.localeCompare(b.city)));
});

clubRouter.get("/:id", async (req, res: Response) => {
  const club = await prisma.club.findUnique({
    where: { id: req.params.id },
    include: { tables: { orderBy: { number: "asc" } }, _count: { select: { subscriptions: true } }, createdBy: { select: playerSelect } },
  });
  if (!club) { res.status(404).json({ error: "Not found" }); return; }
  res.json(club);
});

// Which tables are free on a given day, and what's already taken — the booking screen
// uses this to grey out slots instead of letting the user submit a clashing booking.
clubRouter.get("/:id/availability", async (req, res: Response) => {
  const date = queryDate(req.query.date);
  if (!date) { res.status(400).json({ error: "date is required" }); return; }
  const day = startOfUtcDay(date);
  const [tables, bookings] = await Promise.all([
    prisma.clubTable.findMany({ where: { clubId: req.params.id }, orderBy: { number: "asc" } }),
    prisma.booking.findMany({ where: { clubId: req.params.id, date: day }, select: { tableId: true, startTime: true, durationHours: true } }),
  ]);
  res.json(tables.map(t => ({
    ...t,
    busy: bookings.filter(b => b.tableId === t.id).map(b => ({ startTime: b.startTime, durationHours: b.durationHours })),
  })));
});

clubRouter.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = CreateClubSchema.parse(req.body);
    const club = await prisma.club.create({ data: { ...data, createdById: req.user!.userId } });
    res.status(201).json(club);
  } catch (err: any) {
    if (err.code === "P2002") { res.status(400).json({ error: "A club with this name already exists in this city" }); return; }
    res.status(400).json({ error: publicError(err) });
  }
});

clubRouter.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const club = await loadOwnedClub(res, req.params.id, req.user!.userId);
    if (!club) return;
    const data = UpdateClubSchema.parse(req.body);
    const updated = await prisma.club.update({ where: { id: club.id }, data });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

clubRouter.post("/:id/tables", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const club = await loadOwnedClub(res, req.params.id, req.user!.userId);
    if (!club) return;
    const data = CreateClubTableSchema.parse(req.body);
    const table = await prisma.clubTable.create({ data: { ...data, clubId: club.id } });
    res.status(201).json(table);
  } catch (err: any) {
    if (err.code === "P2002") { res.status(400).json({ error: "This table number already exists at the club" }); return; }
    res.status(400).json({ error: publicError(err) });
  }
});

clubRouter.put("/:id/tables/:tableId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const club = await loadOwnedClub(res, req.params.id, req.user!.userId);
    if (!club) return;
    const table = await prisma.clubTable.findUnique({ where: { id: req.params.tableId } });
    if (!table || table.clubId !== club.id) { res.status(404).json({ error: "Not found" }); return; }
    const data = UpdateClubTableSchema.parse(req.body);
    const updated = await prisma.clubTable.update({ where: { id: table.id }, data });
    res.json(updated);
  } catch (err: any) {
    if (err.code === "P2002") { res.status(400).json({ error: "This table number already exists at the club" }); return; }
    res.status(400).json({ error: publicError(err) });
  }
});

clubRouter.delete("/:id/tables/:tableId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const club = await loadOwnedClub(res, req.params.id, req.user!.userId);
    if (!club) return;
    const table = await prisma.clubTable.findUnique({ where: { id: req.params.tableId } });
    if (!table || table.clubId !== club.id) { res.status(404).json({ error: "Not found" }); return; }
    await prisma.clubTable.delete({ where: { id: table.id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Exported so the booking route can reuse the same clash rule.
export async function findBookingConflict(tableId: string, date: Date, startTime: string, durationHours: number, ignoreBookingId?: string) {
  const sameDay = await prisma.booking.findMany({ where: { tableId, date, ...(ignoreBookingId ? { NOT: { id: ignoreBookingId } } : {}) } });
  return sameDay.find(b => bookingsOverlap(startTime, durationHours, b.startTime, b.durationHours)) || null;
}
