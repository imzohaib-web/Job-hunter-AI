import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";
import { AppError } from "../../types/errors.js";
import { logger } from "../../utils/logger.js";
import type { StorageService, StoredFile } from "./types.js";

/**
 * Returns the absolute directory root of apps/api.
 * Works across Windows/Linux, in dev (tsx), production (dist), or inside Docker.
 */
export function getApiRootDir(): string {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    let dir = path.dirname(currentFile);
    while (dir !== path.dirname(dir)) {
      if (
        (path.basename(dir) === "api" && path.basename(path.dirname(dir)) === "apps") ||
        (path.basename(dir) === "app" && path.basename(path.dirname(dir)) === "")
      ) {
        return dir;
      }
      dir = path.dirname(dir);
    }
    // eslint-disable-next-line no-empty
  } catch {}

  const cwd = process.cwd();
  if (path.basename(cwd) === "api" && path.basename(path.dirname(cwd)) === "apps") {
    return cwd;
  }
  return path.resolve(cwd, "apps", "api");
}

export function resolveStorageDir(customDir?: string): string {
  const rawDir = customDir ?? env.STORAGE_LOCAL_DIR ?? "./storage/uploads";
  if (path.isAbsolute(rawDir)) {
    return path.resolve(rawDir);
  }
  return path.resolve(getApiRootDir(), rawDir);
}

export class LocalStorageService implements StorageService {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = resolveStorageDir(baseDir);
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  private getFilePath(storageKey: string): string {
    if (!storageKey || typeof storageKey !== "string") {
      throw new AppError("STORAGE_FAILED", "Invalid storage key", 400);
    }

    // Path traversal rejection: key must not contain slashes, backslashes, or relative parent segments
    if (
      storageKey.includes("..") ||
      storageKey.includes("/") ||
      storageKey.includes("\\") ||
      path.basename(storageKey) !== storageKey
    ) {
      throw new AppError(
        "STORAGE_FAILED",
        "Invalid storage key: path traversal detected",
        400,
      );
    }

    const resolved = path.resolve(this.baseDir, storageKey);
    const resolvedBase = path.resolve(this.baseDir);
    // Ensure the resolved file path is strictly inside baseDir
    if (!resolved.startsWith(resolvedBase + path.sep)) {
      throw new AppError(
        "STORAGE_FAILED",
        "Invalid storage key: path traversal detected",
        400,
      );
    }

    return resolved;
  }

  async upload(
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
  ): Promise<StoredFile> {
    await this.ensureDir();

    // Step 2: generated safe file name (uuid + extension, never the original name)
    const ext = path.extname(originalFilename).toLowerCase();
    const safeExt = ext === ".pdf" || ext === ".docx" ? ext : ".bin";
    const uniqueId = crypto.randomUUID();
    const storageKey = `${uniqueId}${safeExt}`;
    const filePath = this.getFilePath(storageKey);

    await fs.writeFile(filePath, fileBuffer);
    logger.debug(
      { storageKey, filePath, size: fileBuffer.length },
      "File stored to local disk",
    );

    return {
      storageKey,
      filename: path.basename(originalFilename),
      mimeType,
      size: fileBuffer.length,
    };
  }

  async get(storageKey: string): Promise<Buffer> {
    const filePath = this.getFilePath(storageKey);
    return await fs.readFile(filePath);
  }

  async getSignedUrl(storageKey: string, expiresInSec: number = 3600): Promise<string> {
    const safeKey = path.basename(storageKey);
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
    const dataToSign = `${safeKey}:${expiresAt}`;
    const signature = crypto
      .createHmac("sha256", env.JWT_ACCESS_SECRET)
      .update(dataToSign)
      .digest("hex");

    return `/api/resumes/download?key=${encodeURIComponent(safeKey)}&expires=${expiresAt}&sig=${signature}`;
  }

  verifySignedUrl(storageKey: string, expiresAt: number, signature: string): boolean {
    if (Math.floor(Date.now() / 1000) > expiresAt) {
      return false;
    }
    const safeKey = path.basename(storageKey);
    const dataToSign = `${safeKey}:${expiresAt}`;
    const expected = crypto
      .createHmac("sha256", env.JWT_ACCESS_SECRET)
      .update(dataToSign)
      .digest("hex");

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = this.getFilePath(storageKey);
    try {
      await fs.unlink(filePath);
      logger.debug({ storageKey, filePath }, "File deleted from local disk");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn({ err, storageKey }, "Failed to delete file from local disk");
      }
    }
  }

  async selfCheck(): Promise<void> {
    await this.ensureDir();
    const probeKey = `__probe_${crypto.randomUUID()}.tmp`;
    const probePath = this.getFilePath(probeKey);
    const probePayload = Buffer.from(`jobpilot-storage-check-${Date.now()}`);

    try {
      await fs.writeFile(probePath, probePayload);
      const readBack = await fs.readFile(probePath);
      if (!readBack.equals(probePayload)) {
        throw new Error("Storage self-check readback integrity mismatch");
      }
    } finally {
      await fs.unlink(probePath).catch(() => {});
    }
  }
}
