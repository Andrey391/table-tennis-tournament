import { Router, Response } from "express";
import { prisma } from "../config/db.js";
import { AuthenticatedRequest, authMiddleware, roleMiddleware, generateToken } from "../middleware/auth.js";
import { LoginSchema, RegisterSchema } from "../shared/schemas.js";
import bcrypt from "bcryptjs";

export const authRouter = Router();

authRouter.post("/login", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = generateToken(user.id, user.role);
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, rating: user.rating, club: user.club },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

authRouter.post("/register", authMiddleware, roleMiddleware("ADMIN", "ORGANIZER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = RegisterSchema.parse(req.body);
    const hashed = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({ data: { ...data, password: hashed } });
    const token = generateToken(user.id, user.role);
    res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

authRouter.get("/me", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, club: true, city: true, rating: true, dateOfBirth: true, phone: true },
  });
  // The JWT is self-contained, so a token outlives the account it was issued for
  // (e.g. after the database is reset). Answering 200 with a null body would leave
  // the client "signed in" as nobody until some later write blew up on a foreign
  // key — 401 makes it drop the token and send the user back to the login screen.
  if (!user) { res.status(401).json({ error: "Account no longer exists" }); return; }
  res.json(user);
});
