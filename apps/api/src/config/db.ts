import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

interface ConnectMongoOptions {
  uri?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

export async function connectMongo(
  options: ConnectMongoOptions = {},
): Promise<typeof mongoose> {
  const uri = options.uri ?? env.MONGODB_URI;
  const maxRetries = options.maxRetries ?? 5;
  const retryDelayMs = options.retryDelayMs ?? 2000;

  mongoose.connection.on("connected", () => {
    logger.info("MongoDB connected successfully");
  });

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB connection error");
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });

  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      attempt++;
      return await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
      });
    } catch (err) {
      logger.warn(
        { attempt, maxRetries, err: (err as Error).message },
        `MongoDB connection failed, retrying in ${retryDelayMs}ms...`,
      );
      if (attempt >= maxRetries) {
        logger.error({ err }, "All MongoDB connection attempts exhausted");
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error("Failed to connect to MongoDB");
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info("MongoDB disconnected gracefully");
  }
}
