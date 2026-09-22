import { prisma } from "../config/db";

// Booking times are stored as a "HH:MM" string plus a duration in hours, so
// overlap checks work in minutes-since-midnight within a single calendar day.

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function bookingsOverlap(startA: string, hoursA: number, startB: string, hoursB: number): boolean {
  const a1 = timeToMinutes(startA);
  const a2 = a1 + Math.round(hoursA * 60);
  const b1 = timeToMinutes(startB);
  const b2 = b1 + Math.round(hoursB * 60);
  return a1 < b2 && b1 < a2;
}

// Bookings are keyed by calendar day; normalise whatever the client sent to UTC midnight
// so "same day" comparisons don't depend on the submitter's timezone.
export function startOfUtcDay(date: Date | string): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// A booking stores the day and the wall-clock start separately. The event it
// creates needs one timestamp, so combine them (and add the duration for the end).
export function bookingStartsAt(day: Date, startTime: string): Date {
  return new Date(day.getTime() + timeToMinutes(startTime) * 60_000);
}

export function bookingEndsAt(day: Date, startTime: string, durationHours: number): Date {
  return new Date(bookingStartsAt(day, startTime).getTime() + Math.round(durationHours * 60) * 60_000);
}

// A booking either pins one specific table (`tableId` set) or, when the event
// itself spreads across several tables (a tournament's rounds) or the booker
// simply didn't pick one, reserves a *count* of the club's tables without
// saying which ones. Both kinds consume capacity, so a slot's free-table count
// has to add them together rather than only looking at pinned tables — a club
// with 4 tables and one untabled 4-table tournament already booked has zero
// free tables for a second tournament at the same time, even though no single
// `ClubTable` row is on record as busy.
type OverlapRow = { tableId: string | null; startTime: string; durationHours: number; tournament: { tablesCount: number } | null };

function reservedTables(rows: OverlapRow[]): number {
  const pinned = new Set(rows.filter(b => b.tableId).map(b => b.tableId!));
  const unpinned = rows.reduce((sum, b) => (b.tableId ? sum : sum + (b.tournament?.tablesCount ?? 1)), 0);
  return pinned.size + unpinned;
}

// How many of a club's tables are NOT already booked over the given slot, so an
// event asking for more tables than the club actually has free can be refused
// up front instead of only failing when two matches later collide on a table.
// Returns null when the club has no tables on record at all — there is nothing
// to check the request against, so it is trusted the way it always was.
export async function countFreeTables(clubId: string, date: Date, startTime: string, durationHours: number): Promise<number | null> {
  const [tableCount, bookings] = await Promise.all([
    prisma.clubTable.count({ where: { clubId } }),
    prisma.booking.findMany({
      where: { clubId, date },
      select: { tableId: true, startTime: true, durationHours: true, tournament: { select: { tablesCount: true } } },
    }),
  ]);
  if (tableCount === 0) return null;
  const overlapping = bookings.filter(b => bookingsOverlap(startTime, durationHours, b.startTime, b.durationHours));
  return Math.max(0, tableCount - reservedTables(overlapping));
}

// When a slot doesn't have enough free tables, find the next one that does —
// first later the same day, then at any time on the following days — so the
// booker gets a concrete alternative instead of just a rejection. Scans in
// 15-minute steps, which matches the granularity a person actually picks a
// start time at; a single upfront query per day range keeps this from being
// N round trips to the database.
const SLOT_STEP_MINUTES = 15;

export async function findNextFreeSlot(
  clubId: string,
  date: Date,
  startTime: string,
  durationHours: number,
  tablesNeeded: number,
  maxDaysAhead = 14,
): Promise<{ date: string; startTime: string } | null> {
  const tableCount = await prisma.clubTable.count({ where: { clubId } });
  if (tableCount === 0 || tablesNeeded > tableCount) return null;

  const rangeStart = date;
  const rangeEnd = new Date(date.getTime() + (maxDaysAhead + 1) * 24 * 60 * 60_000);
  const bookings = await prisma.booking.findMany({
    where: { clubId, date: { gte: rangeStart, lt: rangeEnd } },
    select: { date: true, tableId: true, startTime: true, durationHours: true, tournament: { select: { tablesCount: true } } },
  });
  const byDay = new Map<number, OverlapRow[]>();
  for (const b of bookings) {
    const key = b.date.getTime();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(b);
  }
  const freeAt = (day: Date, time: string): number => {
    const rows = byDay.get(day.getTime()) ?? [];
    const overlapping = rows.filter(b => bookingsOverlap(time, durationHours, b.startTime, b.durationHours));
    return Math.max(0, tableCount - reservedTables(overlapping));
  };

  const durationMinutes = Math.round(durationHours * 60);
  const lastStart = 24 * 60 - durationMinutes;
  const scanDay = (day: Date, fromMinutes: number): string | null => {
    for (let m = fromMinutes; m <= lastStart; m += SLOT_STEP_MINUTES) {
      if (freeAt(day, minutesToTime(m)) >= tablesNeeded) return minutesToTime(m);
    }
    return null;
  };

  const todaySlot = scanDay(date, timeToMinutes(startTime) + SLOT_STEP_MINUTES);
  if (todaySlot) return { date: date.toISOString(), startTime: todaySlot };

  for (let d = 1; d <= maxDaysAhead; d++) {
    const day = new Date(date.getTime() + d * 24 * 60 * 60_000);
    const slot = scanDay(day, 0);
    if (slot) return { date: day.toISOString(), startTime: slot };
  }
  return null;
}
