import axios from "axios";
import { AlertCircle, FileText, Loader2, UploadCloud, X } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useUploadResumeMutation } from "@/hooks/useApi";
import type { ResumeEntity } from "@jobpilot/shared";
import { validateResumeFileClient } from "./onboardingUtils";

interface ResumeUploaderProps {
  onUploaded: (resume: ResumeEntity) => void;
}

export function ResumeUploader({ onUploaded }: ResumeUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useUploadResumeMutation();

  const handleFileSelect = (file: File) => {
    setValidationError(null);
    const result = validateResumeFileClient(file);
    if (!result.valid) {
      setValidationError(result.error ?? "Invalid file selected");
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelect(file);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setValidationError(null);
    setUploadProgress(15);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      // Simulate smooth progress for snappy UI feel
      const progressTimer = setInterval(() => {
        setUploadProgress((prev) => (prev < 90 ? prev + 15 : prev));
      }, 150);

      const result = await uploadMutation.mutateAsync(formData);

      clearInterval(progressTimer);
      setUploadProgress(100);
      onUploaded(result.resume);
    } catch (err: unknown) {
      setUploadProgress(0);
      let message = "Failed to upload resume. Please try again.";
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as {
          error?: {
            message?: string;
            code?: string;
            details?: { message?: string } | string;
          };
          message?: string;
        } | undefined;
        const devDetail =
          typeof data?.error?.details === "object" && data?.error?.details !== null
            ? (data?.error?.details as { message?: string }).message
            : typeof data?.error?.details === "string"
              ? data?.error?.details
              : undefined;

        message =
          data?.error?.message && data.error.message !== "An unexpected error occurred"
            ? data.error.message
            : devDetail || data?.error?.message || data?.message || err.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setValidationError(message);
    }
  };

  const isUploading = uploadMutation.isPending;

  return (
    <div className="w-full space-y-4">
      {/* Dropzone container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload resume file dropzone"
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 sm:p-12 text-center transition-all cursor-pointer ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : selectedFile
              ? "border-primary/50 bg-card"
              : "border-border hover:border-primary/40 hover:bg-muted/30"
        } ${isUploading ? "pointer-events-none opacity-80" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          data-testid="resume-file-input"
          onChange={handleInputChange}
          disabled={isUploading}
        />

        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 transition-transform group-hover:scale-105">
          <UploadCloud className="h-7 w-7" />
        </div>

        <h3 className="text-base font-semibold text-foreground">
          {selectedFile ? "Replace selected resume" : "Upload your resume"}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          Drag and drop your resume here, or click to browse. Supports PDF or DOCX up to 5MB.
        </p>
      </div>

      {/* Selected File Card */}
      {selectedFile && !validationError && (
        <div className="flex items-center justify-between rounded-lg border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(0)} KB
              </p>
            </div>
          </div>

          {!isUploading && (
            <button
              type="button"
              aria-label="Remove selected file"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                setUploadProgress(0);
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Upload Progress Bar */}
      {isUploading && (
        <div className="space-y-1.5 animate-fade-in">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Uploading file…</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Validation / API Error */}
      {validationError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Action Button */}
      {selectedFile && !isUploading && (
        <Button
          type="button"
          onClick={handleUpload}
          className="w-full gap-2"
          size="lg"
        >
          <UploadCloud className="h-4 w-4" />
          Continue to Parsing
        </Button>
      )}

      {isUploading && (
        <Button type="button" disabled className="w-full gap-2" size="lg">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading resume…
        </Button>
      )}
    </div>
  );
}
