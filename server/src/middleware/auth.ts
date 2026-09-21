import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: { userId: string; role: string };
}

// No fallback: a default secret baked into the code lets anyone sign their own
// token for any account. It is read on use rather than at import, so a deployment
// without it still serves the public pages and only token operations fail;
// server/src/index.ts calls it at startup to refuse to boot instead.
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function generateToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, jwtSecret(), { expiresIn: "24h" });
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token" });
    return;
  }

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, jwtSecret()) as { userId: string; role: string };
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
