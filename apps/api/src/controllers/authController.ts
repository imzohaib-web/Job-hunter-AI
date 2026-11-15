import type { CookieOptions, Request, Response } from "express";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import {
  createRefreshToken,
  deleteUserCascade,
  generateAccessToken,
  hashPassword,
  revokeRefreshToken,
  verifyAndRotateRefreshToken,
  verifyPassword,
} from "../services/authService.js";
import { AppError } from "../types/errors.js";

const REFRESH_COOKIE_NAME = "jobpilot_refresh_token";

function getCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError("CONFLICT", "Email is already registered", 409);
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: "user",
    quota: {
      dailyAiRequests: 0,
      lastResetDate: new Date().toISOString().slice(0, 10),
      dailyLimit: env.AI_DAILY_QUOTA_DEFAULT,
    },
  });

  const accessToken = generateAccessToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  });
  const refreshToken = await createRefreshToken(user._id.toString());

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions());

  res.status(201).json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    },
    accessToken,
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError("UNAUTHORIZED", "Invalid email or password", 401);
  }

  const isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError("UNAUTHORIZED", "Invalid email or password", 401);
  }

  const accessToken = generateAccessToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  });
  const refreshToken = await createRefreshToken(user._id.toString());

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getCookieOptions());

  res.status(200).json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    },
    accessToken,
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    throw new AppError("UNAUTHORIZED", "Refresh token missing", 401);
  }

  const { userId, newRefreshToken } = await verifyAndRotateRefreshToken(token);

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("UNAUTHORIZED", "User not found", 401);
  }

  const newAccessToken = generateAccessToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, getCookieOptions());

  res.status(200).json({
    accessToken: newAccessToken,
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (token) {
    await revokeRefreshToken(token);
  }

  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
  }

  const user = await User.findById(userId).select("-passwordHash");
  if (!user) {
    throw new AppError("NOT_FOUND", "User not found", 404);
  }

  res.status(200).json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      quota: user.quota,
      createdAt: user.createdAt,
    },
  });
}

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Unauthorized", 401);
  }

  await deleteUserCascade(userId);

  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });

  res.status(200).json({
    success: true,
    message: "Account and all associated data permanently deleted",
  });
}
