import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import type { StorageService, StoredFile } from "./types.js";

export function sanitizeFilename(raw: string): string {
  // Strip paths, control chars, null bytes, special symbols
  const basename = path.basename(raw).replace(/[\r\n\0]/g, "");
  const safe = basename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe.length > 0 ? safe : "file.bin";
}

export class LocalStorageService implements StorageService {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = path.resolve(baseDir ?? env.STORAGE_LOCAL_DIR ?? "./uploads");
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private getFilePath(storageKey: string): string {
    const safeKey = path.basename(storageKey);
    return path.join(this.baseDir, safeKey);
  }

  async upload(
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
  ): Promise<StoredFile> {
    await this.ensureDir();
    const sanitized = sanitizeFilename(originalFilename);
    const uniqueId = crypto.randomUUID();
    const storageKey = `${uniqueId}_${sanitized}`;
    const filePath = this.getFilePath(storageKey);

    await fs.writeFile(filePath, fileBuffer);
    logger.debug({ storageKey, size: fileBuffer.length }, "File stored to local disk");

    return {
      storageKey,
      filename: sanitized,
      mimeType,
      size: fileBuffer.length,
    };
  }

  async get(storageKey: string): Promise<Buffer> {
    const filePath = this.getFilePath(storageKey);
    return await fs.readFile(filePath);
  }

  async getSignedUrl(storageKey: string, expiresInSec: number = 3600): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
    const dataToSign = `${storageKey}:${expiresAt}`;
    const signature = crypto
      .createHmac("sha256", env.JWT_ACCESS_SECRET)
      .update(dataToSign)
      .digest("hex");

    return `/api/resumes/download?key=${encodeURIComponent(storageKey)}&expires=${expiresAt}&sig=${signature}`;
  }

  verifySignedUrl(storageKey: string, expiresAt: number, signature: string): boolean {
    if (Math.floor(Date.now() / 1000) > expiresAt) {
      return false;
    }
    const dataToSign = `${storageKey}:${expiresAt}`;
    const expected = crypto
      .createHmac("sha256", env.JWT_ACCESS_SECRET)
      .update(dataToSign)
      .digest("hex");

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  async delete(storageKey: string): Promise<void> {
    try {
      const filePath = this.getFilePath(storageKey);
      await fs.unlink(filePath);
      logger.debug({ storageKey }, "File deleted from local disk");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn({ err, storageKey }, "Failed to delete file from local disk");
      }
    }
  }
}
