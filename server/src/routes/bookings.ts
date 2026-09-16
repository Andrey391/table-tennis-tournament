import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { CreateBookingSchema } from "../shared/schemas.js";
import { startOfUtcDay } from "../shared/booking.js";
import { findBookingConflict } from "./clubs.js";

export const bookingRouter = Router();

const bookingInclude = { club: { select: { id: true, name: true, city: true, address: true, phone: true } }, table: { select: { id: true, number: true, indoor: true } } };

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

    const booking = await prisma.booking.create({
      data: { clubId: club.id, tableId: data.tableId, date, startTime: data.startTime, durationHours: data.durationHours, userId: req.user!.userId },
      include: bookingInclude,
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
