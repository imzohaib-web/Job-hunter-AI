export const MAX_RESUME_FILE_SIZE = 5 * 1024 * 1024; // 5MB matching backend upload middleware

export const ALLOWED_RESUME_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

export const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".docx"];

export function validateResumeFileClient(file: File): { valid: boolean; error?: string } {
  const extension = "." + file.name.split(".").pop()?.toLowerCase();
  const isValidExtension = ALLOWED_RESUME_EXTENSIONS.includes(extension);
  const isValidMime = ALLOWED_RESUME_MIME_TYPES.includes(file.type) || isValidExtension;

  if (!isValidExtension && !isValidMime) {
    return {
      valid: false,
      error: "Invalid file type. Please upload a PDF or DOCX resume document.",
    };
  }

  if (file.size > MAX_RESUME_FILE_SIZE) {
    return {
      valid: false,
      error: `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 5MB.`,
    };
  }

  return { valid: true };
}

export function isFieldLowConfidence(
  fieldName: string,
  confidences?: Record<string, number>,
): boolean {
  if (!confidences) return false;
  const score = confidences[fieldName];
  return typeof score === "number" && score < 0.8;
}
