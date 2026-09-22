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

// How many of a club's tables are NOT already booked over the given slot, so an
// event asking for more tables than the club actually has free can be refused
// up front instead of only failing when two matches later collide on a table.
// Returns null when the club has no tables on record at all — there is nothing
// to check the request against, so it is trusted the way it always was.
export async function countFreeTables(clubId: string, date: Date, startTime: string, durationHours: number): Promise<number | null> {
  const [tableCount, bookings] = await Promise.all([
    prisma.clubTable.count({ where: { clubId } }),
    prisma.booking.findMany({ where: { clubId, date, tableId: { not: null } }, select: { tableId: true, startTime: true, durationHours: true } }),
  ]);
  if (tableCount === 0) return null;
  const busyTableIds = new Set(
    bookings.filter(b => bookingsOverlap(startTime, durationHours, b.startTime, b.durationHours)).map(b => b.tableId!),
  );
  return Math.max(0, tableCount - busyTableIds.size);
}
