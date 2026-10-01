import { Response } from "express";
import { Router } from "../shared/router";
import { publicError } from "../shared/errors";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth";
import { CreateClubSchema, UpdateClubSchema, CreateClubTableSchema, UpdateClubTableSchema, AddClubAdminSchema, ClubRatingDecisionSchema } from "../shared/schemas";
import { bookingsOverlap, startOfUtcDay } from "../shared/booking";
import { queryString, queryDate, cityIs, playerSelect } from "../shared/queries";
import { normalizeCity, cityKey } from "../shared/city";
import { isAppAdmin, isClubAdmin } from "../shared/clubs";
import { notify } from "../shared/notify";
import AuditLog from "../models/AuditLog";

export const clubRouter = Router();

// A club is run by its admins (ClubAdmin, several people). A club with none left
// (carried over from the old free-text bookings, or whose last admin deleted or
// lost their account) is not open to everyone: only an app ADMIN may run it, and
// the role is read from the database, not from the token.
async function loadOwnedClub(res: Response, clubId: string, userId: string) {
  const club = await prisma.club.findUnique({ where: { id: clubId }, include: { _count: { select: { admins: true } } } });
  if (!club) { res.status(404).json({ error: "Not found" }); return null; }
  if (await isClubAdmin(club.id, userId)) return club;
  if (club._count.admins === 0 && await isAppAdmin(userId)) return club;
  res.status(403).json({ error: "Only the club's admins can do this" });
  return null;
}

// Who may change a club's admin list: its admins, or an app ADMIN for any club,
// so the app admin can appoint the people who will run a club they approve.
async function loadClubForAdmins(res: Response, clubId: string, userId: string) {
  const club = await prisma.club.findUnique({ where: { id: clubId }, include: { _count: { select: { admins: true } } } });
  if (!club) { res.status(404).json({ error: "Not found" }); return null; }
  if (await isClubAdmin(club.id, userId) || await isAppAdmin(userId)) return club;
  res.status(403).json({ error: "Only the club's admins can do this" });
  return null;
}

const adminsInclude = { admins: { include: { user: { select: playerSelect } }, orderBy: { createdAt: "asc" as const } } };

clubRouter.get("/", async (req, res: Response) => {
  const city = queryString(req.query.city);
  const q = queryString(req.query.q);
  // "?ratingStatus=PENDING" is the app admin's queue of clubs asking for approval.
  const ratingStatus = queryString(req.query.ratingStatus);
  const clubs = await prisma.club.findMany({
    where: {
      ...(city ? { city: cityIs(city) } : {}),
      ...(ratingStatus ? { ratingStatus } : {}),
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

// The clubs the caller runs, with whether each may hold rated events: the event
// form offers a rated tournament only at one of these. Must stay above "/:id".
clubRouter.get("/mine", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const rows = await prisma.clubAdmin.findMany({
    where: { userId: req.user!.userId },
    select: { club: { select: { id: true, name: true, city: true, ratingStatus: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json(rows.map(r => r.club));
});

clubRouter.get("/:id", async (req, res: Response) => {
  const club = await prisma.club.findUnique({
    where: { id: req.params.id },
    include: { tables: { orderBy: { number: "asc" } }, _count: { select: { subscriptions: true } }, ...adminsInclude },
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
    // The creator is the club's first admin.
    const club = await prisma.club.create({ data: { ...data, createdById: req.user!.userId, admins: { create: { userId: req.user!.userId } } } });
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

// Any admin of the club (or an app ADMIN) can make a signed-up player an admin.
clubRouter.post("/:id/admins", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const club = await loadClubForAdmins(res, req.params.id, req.user!.userId);
    if (!club) return;
    const { userId } = AddClubAdminSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isDemo: true, deletedAt: true } });
    if (!user || user.isDemo || user.deletedAt) { res.status(404).json({ error: "Player not found" }); return; }
    await prisma.clubAdmin.upsert({ where: { clubId_userId: { clubId: club.id, userId } }, create: { clubId: club.id, userId }, update: {} });
    await AuditLog.create({ userId: req.user!.userId, action: "CLUB_ADMIN_ADD", entity: "Club", entityId: club.id, newValue: { userId } });
    await notify([{ userId, type: "CLUB_ADMIN_ADDED", link: `/club/${club.id}`, params: { club: club.name } }], req.user!.userId);
    res.status(201).json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Removes an admin, the caller included (that is how an admin steps down). The
// last one cannot go: a club with nobody running it falls to the app ADMIN.
clubRouter.delete("/:id/admins/:userId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const club = await loadClubForAdmins(res, req.params.id, req.user!.userId);
    if (!club) return;
    if (!(await isClubAdmin(club.id, req.params.userId))) { res.status(404).json({ error: "Not found" }); return; }
    if (club._count.admins <= 1) { res.status(400).json({ error: "A club needs at least one admin" }); return; }
    await prisma.clubAdmin.delete({ where: { clubId_userId: { clubId: club.id, userId: req.params.userId } } });
    await AuditLog.create({ userId: req.user!.userId, action: "CLUB_ADMIN_REMOVE", entity: "Club", entityId: club.id, oldValue: { userId: req.params.userId } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// A club admin asks for the club to be approved for rated tournaments; every app
// ADMIN hears about it and decides below.
clubRouter.post("/:id/rating-request", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const club = await loadOwnedClub(res, req.params.id, req.user!.userId);
    if (!club) return;
    if (club.ratingStatus !== "NONE") {
      res.status(400).json({ error: club.ratingStatus === "APPROVED" ? "The club is already approved" : "The request is already pending" });
      return;
    }
    const updated = await prisma.club.update({ where: { id: club.id }, data: { ratingStatus: "PENDING" } });
    await AuditLog.create({ userId: req.user!.userId, action: "CLUB_RATING_REQUEST", entity: "Club", entityId: club.id });
    const appAdmins = await prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true } });
    await notify(appAdmins.map(a => ({ userId: a.id, type: "CLUB_RATING_REQUESTED" as const, link: `/club/${club.id}`, params: { club: club.name } })), req.user!.userId);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// The app ADMIN's decision: approve the club for rated tournaments, or turn the
// request down / withdraw an approval (both back to NONE). Withdrawing stops new
// rated events there; ones already created keep running as they are.
clubRouter.post("/:id/rating-decision", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await isAppAdmin(req.user!.userId))) { res.status(403).json({ error: "Only an app administrator can do this" }); return; }
    const { approved } = ClubRatingDecisionSchema.parse(req.body);
    const club = await prisma.club.findUnique({ where: { id: req.params.id }, include: { admins: { select: { userId: true } } } });
    if (!club) { res.status(404).json({ error: "Not found" }); return; }
    const was = club.ratingStatus;
    const updated = await prisma.club.update({ where: { id: club.id }, data: { ratingStatus: approved ? "APPROVED" : "NONE", ratingReviewedAt: new Date() } });
    await AuditLog.create({ userId: req.user!.userId, action: approved ? "CLUB_RATING_APPROVE" : "CLUB_RATING_REVOKE", entity: "Club", entityId: club.id, oldValue: { ratingStatus: was } });
    // Nothing to tell anyone when a club nobody asked about stays at NONE.
    if (approved || was !== "NONE") {
      const type = approved ? "CLUB_RATING_APPROVED" as const : "CLUB_RATING_DECLINED" as const;
      await notify(club.admins.map(a => ({ userId: a.userId, type, link: `/club/${club.id}`, params: { club: club.name } })), req.user!.userId);
    }
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

// Exported so the booking route can reuse the same clash rule.
export async function findBookingConflict(tableId: string, date: Date, startTime: string, durationHours: number, ignoreBookingId?: string) {
  const sameDay = await prisma.booking.findMany({ where: { tableId, date, ...(ignoreBookingId ? { NOT: { id: ignoreBookingId } } : {}) } });
  return sameDay.find(b => bookingsOverlap(startTime, durationHours, b.startTime, b.durationHours)) || null;
}
