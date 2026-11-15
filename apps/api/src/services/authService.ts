import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { getRedisClient } from "../config/redis.js";
import {
  Application,
  Artifact,
  LlmRun,
  Match,
  Resume,
  SearchRun,
  User,
} from "../models/index.js";
import { getStorageService } from "./storage/index.js";
import { AppError } from "../types/errors.js";
import { logger } from "../utils/logger.js";

export interface JwtUserPayload {
  sub: string;
  email: string;
  role: "user" | "admin";
}

// In-memory fallback for test environments without live Redis
const inMemoryTokenStore = new Map<string, { userId: string; expiresAt: number }>();

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): JwtUserPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtUserPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError("UNAUTHORIZED", "Access token expired", 401);
    }
    throw new AppError("UNAUTHORIZED", "Invalid access token", 401);
  }
}

function parseExpirySeconds(expiryStr: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiryStr);
  if (!match) return 7 * 24 * 3600;
  const count = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s":
      return count;
    case "m":
      return count * 60;
    case "h":
      return count * 3600;
    case "d":
      return count * 86400;
    default:
      return 7 * 86400;
  }
}

function isRedisReady(): boolean {
  if (env.NODE_ENV === "test") {
    return false;
  }
  try {
    const client = getRedisClient();
    return client.status === "ready";
  } catch {
    return false;
  }
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  const ttlSec = parseExpirySeconds(env.JWT_REFRESH_EXPIRES_IN);
  const redisKey = `refresh_token:${token}`;
  const userTokensKey = `user_tokens:${userId}`;

  if (!isRedisReady()) {
    inMemoryTokenStore.set(token, {
      userId,
      expiresAt: Date.now() + ttlSec * 1000,
    });
    return token;
  }

  try {
    const redis = getRedisClient();
    await redis.set(redisKey, userId, "EX", ttlSec);
    await redis.sadd(userTokensKey, token);
    await redis.expire(userTokensKey, ttlSec);
  } catch (err) {
    logger.warn({ err }, "Redis unavailable, using in-memory token store");
    inMemoryTokenStore.set(token, {
      userId,
      expiresAt: Date.now() + ttlSec * 1000,
    });
  }

  return token;
}

export async function verifyAndRotateRefreshToken(
  token: string,
): Promise<{ userId: string; newRefreshToken: string }> {
  let userId: string | null = null;
  const redisKey = `refresh_token:${token}`;

  if (isRedisReady()) {
    try {
      const redis = getRedisClient();
      userId = await redis.get(redisKey);
      if (userId) {
        await redis.del(redisKey);
        await redis.srem(`user_tokens:${userId}`, token);
      }
    } catch (err) {
      logger.warn({ err }, "Redis error during refresh verification");
    }
  }

  if (!userId) {
    const item = inMemoryTokenStore.get(token);
    if (item && item.expiresAt > Date.now()) {
      userId = item.userId;
      inMemoryTokenStore.delete(token);
    }
  }

  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Invalid or revoked refresh token", 401);
  }

  const newRefreshToken = await createRefreshToken(userId);
  return { userId, newRefreshToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const redisKey = `refresh_token:${token}`;

  if (isRedisReady()) {
    try {
      const redis = getRedisClient();
      const userId = await redis.get(redisKey);
      if (userId) {
        await redis.del(redisKey);
        await redis.srem(`user_tokens:${userId}`, token);
      }
    } catch {
      // Redis error; continue to inMemory cleanup
    }
  }

  inMemoryTokenStore.delete(token);
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  if (isRedisReady()) {
    try {
      const redis = getRedisClient();
      const tokens = await redis.smembers(`user_tokens:${userId}`);
      if (tokens && tokens.length > 0) {
        const keys = tokens.map((t) => `refresh_token:${t}`);
        await redis.del(...keys);
        await redis.del(`user_tokens:${userId}`);
      }
    } catch {
      // Redis error; continue
    }
  }

  for (const [token, data] of inMemoryTokenStore.entries()) {
    if (data.userId === userId) {
      inMemoryTokenStore.delete(token);
    }
  }
}

export async function deleteUserCascade(userId: string): Promise<void> {
  logger.info({ userId }, "Starting account deletion cascade");

  // 1. Find all resumes and delete files from object storage
  const storage = getStorageService();
  const resumes = await Resume.find({ userId });
  for (const resume of resumes) {
    if (resume.original?.storageKey) {
      await storage.delete(resume.original.storageKey);
    }
  }

  // 2. Delete all MongoDB records across all user collections
  await Promise.all([
    Resume.deleteMany({ userId }),
    Match.deleteMany({ userId }),
    Application.deleteMany({ userId }),
    Artifact.deleteMany({ userId }),
    SearchRun.deleteMany({ userId }),
    LlmRun.deleteMany({ userId }),
  ]);

  // 3. Revoke all refresh tokens in Redis
  await revokeAllUserRefreshTokens(userId);

  // 4. Delete User document
  const deletedUser = await User.findByIdAndDelete(userId);
  if (!deletedUser) {
    throw new AppError("NOT_FOUND", "User not found", 404);
  }

  logger.info({ userId }, "Account deletion cascade completed successfully");
}
