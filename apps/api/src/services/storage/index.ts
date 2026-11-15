import { env } from "../../config/env.js";
import { LocalStorageService } from "./localStorageService.js";
import type { StorageService } from "./types.js";

export * from "./types.js";
export * from "./localStorageService.js";

let storageServiceInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!storageServiceInstance) {
    if (env.STORAGE_DRIVER === "local") {
      storageServiceInstance = new LocalStorageService(env.STORAGE_LOCAL_DIR);
    } else {
      // S3 or other drivers can be plugged here; defaults to LocalStorageService
      storageServiceInstance = new LocalStorageService(env.STORAGE_LOCAL_DIR);
    }
  }
  return storageServiceInstance;
}

export function setStorageService(service: StorageService): void {
  storageServiceInstance = service;
}
