import multer from "multer";
import path from "node:path";
import { AppError } from "../types/errors.js";

const storage = multer.memoryStorage();

export const uploadResumeMiddleware = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".pdf" && ext !== ".docx") {
      return cb(
        new AppError(
          "BAD_REQUEST",
          `Unsupported file type '${ext}'. Only PDF and DOCX files are allowed.`,
          400,
        ),
      );
    }
    cb(null, true);
  },
}).single("file");
