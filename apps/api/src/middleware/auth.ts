import type { NextFunction, Request, Response } from "express";
import { AppError } from "../types/errors.js";
import { verifyAccessToken, type JwtUserPayload } from "../services/authService.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: "user" | "admin";
      };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("UNAUTHORIZED", "Authorization token required", 401);
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    throw new AppError("UNAUTHORIZED", "Authorization token required", 401);
  }

  try {
    const payload: JwtUserPayload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    throw new AppError("FORBIDDEN", "Admin access required", 403);
  }
  next();
}
