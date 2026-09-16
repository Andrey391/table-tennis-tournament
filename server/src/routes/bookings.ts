import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.js";
import { CreateBookingSchema } from "../shared/schemas.js";

export const bookingRouter = Router();

// Table reservations — no payment processing, this just records who booked what/when.
bookingRouter.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = CreateBookingSchema.parse(req.body);
    const booking = await prisma.booking.create({ data: { ...data, userId: req.user!.userId } });
    res.status(201).json(booking);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

bookingRouter.get("/mine", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const bookings = await prisma.booking.findMany({ where: { userId: req.user!.userId }, orderBy: { date: "asc" } });
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
