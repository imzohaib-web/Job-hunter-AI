export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "PAYLOAD_TOO_LARGE"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
  | "PROFILE_NOT_VERIFIED"
  | "SEARCH_NOT_FOUND"
  | "JOB_NOT_FOUND"
  | "MATCH_NOT_FOUND"
  | "ARTIFACT_NOT_FOUND"
  | "APPLICATION_NOT_FOUND"
  | "INVALID_ID"
  | "EXPORT_FAILED"
  | "RESUME_FAILED"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "STORAGE_FAILED"
  | "PARSER_UNAVAILABLE"
  | "PARSER_FAILED"
  | "QUEUE_UNAVAILABLE"
  | (string & {});

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    codeOrStatus: ErrorCode | number,
    messageOrCode: string,
    statusOrMessage?: number | string,
    details?: unknown,
  ) {
    if (typeof codeOrStatus === "number") {
      // Called as: new AppError(404, "NOT_FOUND", "Message", details)
      super(typeof statusOrMessage === "string" ? statusOrMessage : messageOrCode);
      this.statusCode = codeOrStatus;
      this.code = messageOrCode as ErrorCode;
      this.details = details;
    } else {
      // Called as: new AppError("NOT_FOUND", "Message", 404, details)
      super(messageOrCode);
      this.code = codeOrStatus;
      this.statusCode = typeof statusOrMessage === "number" ? statusOrMessage : 500;
      this.details = details;
    }
    this.name = "AppError";
  }
}
