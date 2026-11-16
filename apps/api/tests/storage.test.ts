import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalStorageService } from "../src/services/storage/localStorageService.js";
import { AppError } from "../src/types/errors.js";

describe("LocalStorageService Unit Tests", () => {
  const cleanupDirs: string[] = [];

  afterAll(async () => {
    for (const dir of cleanupDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("creates a missing nested directory when storing a file", async () => {
    const nestedDir = path.resolve(__dirname, "test-storage/nested/level1/level2/level3");
    cleanupDirs.push(path.resolve(__dirname, "test-storage"));

    const service = new LocalStorageService(nestedDir);
    const content = Buffer.from("%PDF-1.4 resume bytes");
    const stored = await service.upload(content, "nested_resume.pdf", "application/pdf");

    expect(stored.storageKey).toBeDefined();
    expect(stored.storageKey).toMatch(/^[0-9a-f-]+\.pdf$/i);

    const dirStat = await fs.stat(nestedDir);
    expect(dirStat.isDirectory()).toBe(true);

    const retrieved = await service.get(stored.storageKey);
    expect(retrieved.equals(content)).toBe(true);
  });

  it("handles a path containing spaces robustly without escaping issues", async () => {
    const spaceDir = path.resolve(
      __dirname,
      "test-storage/folder with spaces and symbols/uploads",
    );
    cleanupDirs.push(spaceDir);

    const service = new LocalStorageService(spaceDir);
    const content = Buffer.from("%PDF-1.4 spaces resume test");
    const stored = await service.upload(content, "spaces resume.pdf", "application/pdf");

    expect(stored.storageKey).toBeDefined();
    // Safe filename check: UUID + extension, original filename never used as disk filename
    expect(stored.storageKey).not.toContain("spaces");
    expect(stored.storageKey).toMatch(/^[0-9a-f-]+\.pdf$/i);

    const retrieved = await service.get(stored.storageKey);
    expect(retrieved.equals(content)).toBe(true);
  });

  it("rejects path traversal in storage keys", async () => {
    const safeDir = path.resolve(__dirname, "test-storage/traversal-test");
    cleanupDirs.push(safeDir);
    const service = new LocalStorageService(safeDir);

    // Attempting path traversal should throw STORAGE_FAILED AppError
    await expect(service.get("../secret.txt")).rejects.toThrow(AppError);
    await expect(service.get("..\\secret.txt")).rejects.toThrow(AppError);
    await expect(service.get("../../etc/passwd")).rejects.toThrow(AppError);
    await expect(service.get("/etc/passwd")).rejects.toThrow(AppError);
    await expect(service.delete("../secret.txt")).rejects.toThrow(AppError);
  });

  it("self-check passes on valid directory and fails loudly with a bad path", async () => {
    // 1. Passes on valid directory
    const validDir = path.resolve(__dirname, "test-storage/self-check-valid");
    cleanupDirs.push(validDir);
    const validService = new LocalStorageService(validDir);
    await expect(validService.selfCheck()).resolves.toBeUndefined();

    // 2. Fails loudly on an invalid path (e.g. using a file path where a directory is expected)
    const filePath = path.resolve(__dirname, "test-storage/not-a-dir.tmp");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "I am a file, not a directory");
    cleanupDirs.push(filePath);

    // Trying to use a file as baseDir should cause fs.mkdir to fail with ENOTDIR / EEXIST
    const badService = new LocalStorageService(filePath);
    await expect(badService.selfCheck()).rejects.toThrow();
  });
});
