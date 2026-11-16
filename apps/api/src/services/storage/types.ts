export interface StoredFile {
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface StorageService {
  upload(
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
  ): Promise<StoredFile>;

  get(storageKey: string): Promise<Buffer>;

  getSignedUrl(storageKey: string, expiresInSec?: number): Promise<string>;

  delete(storageKey: string): Promise<void>;

  selfCheck(): Promise<void>;

  getBaseDir(): string;
}
