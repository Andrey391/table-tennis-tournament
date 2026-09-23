import { Router, Response } from "express";
import { publicError } from "../shared/errors";
import { prisma } from "../config/db";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth";
import { CreateBookingSchema } from "../shared/schemas";
import { startOfUtcDay, bookingStartsAt, bookingEndsAt, countFreeTables, findNextFreeSlot } from "../shared/booking";
import { findBookingConflict } from "./clubs";
import { bookingInclude } from "../shared/queries";
import { computeBookingPrice, initiatePayment } from "../shared/payments";

export const bookingRouter = Router();

// Table reservations. A booking against a table with no pricePerHour is free,
// exactly as it always was; one against a priced table records priceTotal and
// starts out UNPAID (see shared/payments.ts for how it gets marked PAID).
bookingRouter.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = CreateBookingSchema.parse(req.body);
    const club = await prisma.club.findUnique({ where: { id: data.clubId } });
    if (!club) { res.status(404).json({ error: "Club not found" }); return; }

    let table = null as Awaited<ReturnType<typeof prisma.clubTable.findUnique>>;
    if (data.tableId) {
      table = await prisma.clubTable.findUnique({ where: { id: data.tableId } });
      if (!table || table.clubId !== club.id) { res.status(400).json({ error: "This table doesn't belong to the club" }); return; }
    }

    const date = startOfUtcDay(data.date);

    if (data.tableId) {
      // Two people can't hold the same specific table at overlapping times.
      const conflict = await findBookingConflict(data.tableId, date, data.startTime, data.durationHours);
      if (conflict) {
        res.status(409).json({ error: `Table is already booked from ${conflict.startTime} for ${conflict.durationHours}h` });
        return;
      }
    } else {
      // No specific table was picked, but the event still needs `tablesNeeded`
      // tables free at the club during this slot — a tournament spreads its
      // rounds across `tablesCount`, a plain game just needs one. Without this,
      // two tournaments (or a tournament and a game) with no pinned table could
      // both be created at the same club and time even past the club's actual
      // table count, since neither one claims a specific `ClubTable` row.
      const tablesNeeded = data.eventType === "TOURNAMENT" ? (data.tablesCount || 1) : 1;
      const free = await countFreeTables(club.id, date, data.startTime, data.durationHours);
      if (free !== null && tablesNeeded > free) {
        const suggestion = await findNextFreeSlot(club.id, date, data.startTime, data.durationHours, tablesNeeded);
        res.status(409).json({ error: `Only ${free} table(s) free at this club at this time`, suggestion });
        return;
      }
    }

    // The booking and the event it exists for are created together: a half-created
    // pair (a table held for nothing, or an event nobody has a table for) is never
    // a state worth persisting.
    const userId = req.user!.userId;
    // Prefer the instant the booking screen itself resolved (its browser knows
    // its own timezone); fall back to the old UTC-wall-clock guess for any
    // caller that doesn't send it.
    const startsAt = data.eventStartTime ? new Date(data.eventStartTime) : bookingStartsAt(date, data.startTime);
    const endsAt = data.eventEndTime ? new Date(data.eventEndTime) : bookingEndsAt(date, data.startTime, data.durationHours);
    const title = data.eventTitle?.trim() || club.name;

    const booking = await prisma.$transaction(async (tx) => {
      // A game and a tournament are the same row; `kind` is the only difference.
      const event = await tx.tournament.create({
        data: {
          kind: data.eventType, name: title, clubId: club.id, startTime: startsAt, endTime: endsAt, organizerId: userId,
          // How many sets its matches are played to, chosen on the booking screen.
          ...(data.setsToWin ? { setsToWin: data.setsToWin } : {}),
          ...(data.tablesCount ? { tablesCount: data.tablesCount } : {}),
          ...(data.isPublic === undefined ? {} : { isPublic: data.isPublic }),
          ...(data.description ? { description: data.description } : {}),
          ...(data.maxPlayers ? { maxPlayers: data.maxPlayers } : {}),
          ...(data.minRating !== undefined ? { minRating: data.minRating } : {}),
          ...(data.maxRating !== undefined ? { maxRating: data.maxRating } : {}),
          ...(data.ratingWeight ? { ratingWeight: data.ratingWeight } : {}),
        },
      });
      // The organiser is a participant of their own event from the start.
      await tx.tournamentUser.create({ data: { tournamentId: event.id, userId, status: "REGISTERED" } });

      const priceTotal = computeBookingPrice(table, data.durationHours);

      return tx.booking.create({
        data: {
          clubId: club.id, tableId: data.tableId, date, startTime: data.startTime,
          durationHours: data.durationHours, userId, tournamentId: event.id,
          priceTotal, paymentStatus: priceTotal ? "UNPAID" : "PAID",
        },
        include: bookingInclude,
      });
    });

    res.status(201).json(booking);
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

bookingRouter.get("/mine", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const bookings = await prisma.booking.findMany({
    where: { userId: req.user!.userId },
    include: bookingInclude,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  res.json(bookings);
});

// Starts (and, under the mock provider, immediately completes) payment for an
// UNPAID booking. Only the booking's own owner can pay for it — nobody should
// be able to trigger a charge against someone else's reservation.
bookingRouter.post("/:id/pay", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) { res.status(404).json({ error: "Not found" }); return; }
    if (booking.userId !== req.user!.userId) { res.status(403).json({ error: "Not your booking" }); return; }
    if (booking.paymentStatus !== "UNPAID") { res.status(400).json({ error: `Booking is already ${booking.paymentStatus.toLowerCase()}` }); return; }
    if (!booking.priceTotal) { res.status(400).json({ error: "This booking has no price to pay" }); return; }

    const intent = await initiatePayment(booking);
    // A real provider confirms asynchronously via its own webhook, which would
    // call this same update after verifying the charge — never on a client's
    // say-so. The mock provider has no async leg, so it confirms right here.
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { paymentRef: intent.paymentRef, ...(intent.redirectUrl ? {} : { paymentStatus: "PAID" }) },
      include: bookingInclude,
    });
    res.json({ booking: updated, redirectUrl: intent.redirectUrl });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});

bookingRouter.delete("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) { res.status(404).json({ error: "Not found" }); return; }
    if (booking.userId !== req.user!.userId) { res.status(403).json({ error: "Not your booking" }); return; }
    await prisma.booking.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: publicError(err) });
  }
});
