import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db.js";

export interface AuthenticatedRequest extends Request {
  user?: { userId: string; role: string };
}

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-key-change-me";

export function generateToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "24h" });
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token" });
    return;
  }

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function roleMiddleware(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
