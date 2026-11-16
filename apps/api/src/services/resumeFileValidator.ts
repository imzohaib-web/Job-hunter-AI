import { fileTypeFromBuffer } from "file-type";
import path from "node:path";
import { AppError } from "../types/errors.js";

export const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx"]);
export const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export interface ValidatedFileResult {
  detectedMime: string;
  detectedExt: string;
}

export async function validateResumeFile(
  buffer: Buffer,
  originalFilename: string,
): Promise<ValidatedFileResult> {
  const ext = path.extname(originalFilename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError(
      "UNSUPPORTED_FILE_TYPE",
      `Invalid file extension '${ext}'. Only PDF and DOCX files are allowed.`,
      400,
    );
  }

  // Check magic bytes using file-type
  const detected = await fileTypeFromBuffer(buffer);

  // Fallback check for standard PDF header '%PDF-' (0x25, 0x50, 0x44, 0x46, 0x2D)
  const isPdfHeader =
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d;

  // Fallback check for DOCX / ZIP header 'PK\x03\x04' (0x50, 0x4B, 0x03, 0x04)
  const isZipHeader =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04;

  if (detected) {
    if (detected.mime === "application/pdf") {
      return { detectedMime: detected.mime, detectedExt: detected.ext };
    }
    if (
      detected.ext === "docx" ||
      detected.mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return {
        detectedMime:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        detectedExt: "docx",
      };
    }
    // If it's a ZIP archive and extension is .docx
    if (detected.mime === "application/zip" && ext === ".docx" && isZipHeader) {
      return {
        detectedMime:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        detectedExt: "docx",
      };
    }
    throw new AppError(
      "UNSUPPORTED_FILE_TYPE",
      `File content does not match allowed types (detected ${detected.mime}). Renamed or spoofed files are rejected.`,
      400,
    );
  }

  // If fileTypeFromBuffer did not recognize, check raw header bytes
  if (ext === ".pdf" && isPdfHeader) {
    return { detectedMime: "application/pdf", detectedExt: "pdf" };
  }
  if (ext === ".docx" && isZipHeader) {
    return {
      detectedMime:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      detectedExt: "docx",
    };
  }

  throw new AppError(
    "UNSUPPORTED_FILE_TYPE",
    "Invalid file format: unable to verify file magic bytes for PDF/DOCX.",
    400,
  );
}
