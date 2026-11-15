import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api";
import { renderWithProviders } from "@/test/test-utils";
import { ResumeUploader } from "./ResumeUploader";
import { validateResumeFileClient } from "./onboardingUtils";

describe("ResumeUploader", () => {
  let mockApi: MockAdapter;

  beforeEach(() => {
    mockApi = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mockApi.restore();
    vi.restoreAllMocks();
  });

  it("validates client-side file type and size constraints", () => {
    // Invalid extension
    const exeFile = new File(["dummy content"], "malicious.exe", {
      type: "application/x-msdownload",
    });
    const invalidExtResult = validateResumeFileClient(exeFile);
    expect(invalidExtResult.valid).toBe(false);
    expect(invalidExtResult.error).toMatch(/invalid file type/i);

    // Oversized file (>5MB)
    const largeContent = new Uint8Array(6 * 1024 * 1024);
    const largeFile = new File([largeContent], "large_resume.pdf", {
      type: "application/pdf",
    });
    const largeResult = validateResumeFileClient(largeFile);
    expect(largeResult.valid).toBe(false);
    expect(largeResult.error).toMatch(/too large/i);

    // Valid PDF
    const validPdf = new File(["%PDF-1.4 test"], "resume.pdf", {
      type: "application/pdf",
    });
    expect(validateResumeFileClient(validPdf).valid).toBe(true);

    // Valid DOCX
    const validDocx = new File(["PK test"], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(validateResumeFileClient(validDocx).valid).toBe(true);
  });

  it("shows error alert in UI when user drops an unsupported file type", async () => {
    renderWithProviders(<ResumeUploader onUploaded={vi.fn()} />);

    const fileInput = screen.getByTestId("resume-file-input");
    const badFile = new File(["text"], "script.sh", { type: "text/x-sh" });

    fireEvent.change(fileInput, { target: { files: [badFile] } });

    expect(screen.getByRole("alert")).toHaveTextContent(/invalid file type/i);
  });

  it("successfully uploads a valid resume and calls onUploaded callback", async () => {
    const onUploadedSpy = vi.fn();
    const user = userEvent.setup();

    const mockResume = {
      _id: "res-123",
      userId: "u-1",
      original: {
        filename: "my_resume.pdf",
        storageKey: "key-123",
        mimeType: "application/pdf",
        size: 10240,
        uploadedAt: new Date().toISOString(),
      },
      status: "ready" as const,
      version: 1,
      warnings: [],
      fieldConfidences: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockApi.onPost("/resumes").reply(201, {
      resume: mockResume,
      downloadUrl: "https://example.com/download",
    });

    renderWithProviders(<ResumeUploader onUploaded={onUploadedSpy} />);

    const fileInput = screen.getByTestId("resume-file-input");
    const validFile = new File(["%PDF-1.4 sample content"], "my_resume.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    expect(screen.getByText("my_resume.pdf")).toBeInTheDocument();

    const uploadBtn = screen.getByRole("button", { name: /continue to parsing/i });
    await user.click(uploadBtn);

    await waitFor(() => {
      expect(onUploadedSpy).toHaveBeenCalledWith(mockResume);
      const postData = mockApi.history.post[0].data as FormData;
      expect(postData.get("file")).toBeTruthy();
    });
  });
});
