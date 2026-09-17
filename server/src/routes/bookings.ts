import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { CreateBookingSchema } from "../shared/schemas.js";
import { startOfUtcDay, bookingStartsAt, bookingEndsAt } from "../shared/booking.js";
import { findBookingConflict } from "./clubs.js";

export const bookingRouter = Router();

const bookingInclude = {
  club: { select: { id: true, name: true, city: true, address: true, phone: true } },
  table: { select: { id: true, number: true, indoor: true } },
  tournament: { select: { id: true, kind: true, name: true, status: true } },
};

// Table reservations — no payment processing, this just records who booked what/when.
bookingRouter.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = CreateBookingSchema.parse(req.body);
    const club = await prisma.club.findUnique({ where: { id: data.clubId } });
    if (!club) { res.status(404).json({ error: "Club not found" }); return; }

    if (data.tableId) {
      const table = await prisma.clubTable.findUnique({ where: { id: data.tableId } });
      if (!table || table.clubId !== club.id) { res.status(400).json({ error: "This table doesn't belong to the club" }); return; }
    }

    const date = startOfUtcDay(data.date);

    // Two people can't hold the same table at overlapping times. Bookings without a
    // specific table are just a note that someone's coming, so they can't clash.
    if (data.tableId) {
      const conflict = await findBookingConflict(data.tableId, date, data.startTime, data.durationHours);
      if (conflict) {
        res.status(409).json({ error: `Table is already booked from ${conflict.startTime} for ${conflict.durationHours}h` });
        return;
      }
    }

    // The booking and the event it exists for are created together: a half-created
    // pair (a table held for nothing, or an event nobody has a table for) is never
    // a state worth persisting.
    const userId = req.user!.userId;
    const startsAt = bookingStartsAt(date, data.startTime);
    const endsAt = bookingEndsAt(date, data.startTime, data.durationHours);
    const title = data.eventTitle?.trim() || club.name;

    const booking = await prisma.$transaction(async (tx) => {
      // A game and a tournament are the same row; `kind` is the only difference.
      const event = await tx.tournament.create({
        data: {
          kind: data.eventType, name: title, clubId: club.id, startTime: startsAt, endTime: endsAt, organizerId: userId,
          // The "11 / 21" choice on the booking screen is the target its matches
          // get created with; tournaments keep the 11 default and set it per match.
          ...(data.pointsToWin ? { pointsToWin: data.pointsToWin } : {}),
          ...(data.isPublic === undefined ? {} : { isPublic: data.isPublic }),
        },
      });
      // The organiser is a participant of their own event from the start.
      await tx.tournamentUser.create({ data: { tournamentId: event.id, userId, status: "REGISTERED" } });

      return tx.booking.create({
        data: {
          clubId: club.id, tableId: data.tableId, date, startTime: data.startTime,
          durationHours: data.durationHours, userId, tournamentId: event.id,
        },
        include: bookingInclude,
      });
    });

    res.status(201).json(booking);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
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

bookingRouter.delete("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!booking) { res.status(404).json({ error: "Not found" }); return; }
    if (booking.userId !== req.user!.userId) { res.status(403).json({ error: "Not your booking" }); return; }
    await prisma.booking.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
