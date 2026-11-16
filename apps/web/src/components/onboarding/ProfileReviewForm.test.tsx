import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api";
import { renderWithProviders } from "@/test/test-utils";
import type { ResumeEntity } from "@jobpilot/shared";
import { ProfileReviewForm } from "./ProfileReviewForm";

describe("ProfileReviewForm", () => {
  let mockApi: MockAdapter;

  const mockResume: ResumeEntity = {
    _id: "res-test-99",
    userId: "u-1",
    original: {
      filename: "sample.pdf",
      storageKey: "storage-1",
      mimeType: "application/pdf",
      size: 5000,
      uploadedAt: "2026-01-01T00:00:00Z",
    },
    status: "ready",
    version: 1,
    warnings: ["Scanned PDF, OCR used", "Estimated dates on older roles"],
    fieldConfidences: {
      name: 0.98, // High confidence (no badge)
      summary: 0.65, // Low confidence (<0.8 -> badge)
      experience: 0.72, // Low confidence (<0.8 -> badge)
      education: 0.92, // High confidence (no badge)
    },
    parsedProfile: {
      name: "Alex Rivera",
      email: "alex@example.com",
      phone: "+1 555-0192",
      location: "Austin, TX",
      summary:
        "Experienced software engineer specializing in distributed systems.",
      links: ["https://github.com/alexrivera"],
      skills: [
        { name: "TypeScript", category: "Languages", years: 4 },
        { name: "Node.js", category: "Frameworks", years: 4 },
      ],
      experience: [
        {
          company: "Tech Giant",
          title: "Senior Engineer",
          start: "2022-01",
          end: "Present",
          bullets: ["Engineered scalable backend microservices."],
        },
      ],
      education: [
        {
          institution: "University of Texas",
          degree: "B.S. in Computer Science",
          field_of_study: "Computer Science",
          end: "2020",
        },
      ],
      projects: [],
      certifications: [],
      languages: [{ language: "English", proficiency: "native" }],
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  beforeEach(() => {
    mockApi = new MockAdapter(apiClient);
    localStorage.clear();
  });

  afterEach(() => {
    mockApi.restore();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("highlights fields with low confidence (<0.8) with 'Please check' badge", () => {
    renderWithProviders(
      <ProfileReviewForm resume={mockResume} onConfirmed={vi.fn()} />,
    );

    const badges = screen.getAllByTestId("low-confidence-badge");
    expect(badges.length).toBeGreaterThan(0);

    // Badges contain "Please check"
    badges.forEach((b) => {
      expect(b).toHaveTextContent(/please check/i);
    });

    // Check that low-confidence summary has a badge
    const summaryCard = screen
      .getByText(/professional summary/i)
      .closest(".rounded-xl");
    expect(summaryCard).toHaveTextContent(/please check/i);
  });

  it("displays parser warnings banner when warnings exist", () => {
    renderWithProviders(
      <ProfileReviewForm resume={mockResume} onConfirmed={vi.fn()} />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/scanned pdf, ocr used/i)).toBeInTheDocument();
    expect(
      screen.getByText(/estimated dates on older roles/i),
    ).toBeInTheDocument();
  });

  it("allows adding and removing skill chips", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProfileReviewForm resume={mockResume} onConfirmed={vi.fn()} />,
    );

    // Existing skills rendered
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("Node.js")).toBeInTheDocument();

    // Add new skill
    const skillInput = screen.getByPlaceholderText(/add skill/i);
    await user.type(skillInput, "GraphQL");
    await user.click(screen.getByRole("button", { name: /add skill/i }));

    expect(screen.getByText("GraphQL")).toBeInTheDocument();

    // Remove existing skill
    const removeBtn = screen.getByRole("button", {
      name: /remove skill typescript/i,
    });
    await user.click(removeBtn);

    expect(screen.queryByText("TypeScript")).not.toBeInTheDocument();
  });

  it("validates required name field before confirming", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProfileReviewForm resume={mockResume} onConfirmed={vi.fn()} />,
    );

    const nameInput = screen.getByLabelText(/full name/i);
    await user.clear(nameInput);

    const confirmBtn = screen.getByRole("button", {
      name: /confirm profile & continue/i,
    });
    await user.click(confirmBtn);

    expect(screen.getByText(/candidate name is required/i)).toBeInTheDocument();
  });

  it("submits patched profile on 'Confirm profile' and calls onConfirmed", async () => {
    const onConfirmedSpy = vi.fn();
    const user = userEvent.setup();

    const updatedResume = {
      ...mockResume,
      version: 2,
      verifiedProfile: mockResume.parsedProfile,
    };

    mockApi.onPatch(`/resumes/${mockResume._id}/profile`).reply(200, {
      resume: updatedResume,
    });

    renderWithProviders(
      <ProfileReviewForm resume={mockResume} onConfirmed={onConfirmedSpy} />,
    );

    const confirmBtn = screen.getByRole("button", {
      name: /confirm profile & continue/i,
    });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(onConfirmedSpy).toHaveBeenCalledWith(updatedResume);
    });
  });

  it("fills the form after fetch resolves when initially mounted with null/empty parsedProfile", async () => {
    const unparsedResume: ResumeEntity = {
      ...mockResume,
      _id: "res-unparsed-1",
      status: "processing",
      parsedProfile: null,
      verifiedProfile: null,
    };

    // Stale empty draft should not block newly loaded parsedProfile
    localStorage.setItem(
      `jobpilot_profile_draft_${unparsedResume._id}`,
      JSON.stringify({ name: "", skills: [], experience: [], education: [] }),
    );

    const { rerender } = renderWithProviders(
      <ProfileReviewForm resume={unparsedResume} onConfirmed={vi.fn()} />,
    );

    // Initially empty
    expect(screen.getByLabelText(/full name/i)).toHaveValue("");
    expect(screen.queryByText("TypeScript")).not.toBeInTheDocument();

    // Fetch resolves and updates resume prop with populated parsed profile
    const populatedResume: ResumeEntity = {
      ...unparsedResume,
      status: "ready",
      parsedProfile: mockResume.parsedProfile,
    };

    rerender(
      <ProfileReviewForm resume={populatedResume} onConfirmed={vi.fn()} />,
    );

    // Form fills automatically after fetch resolves
    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toHaveValue("Alex Rivera");
      expect(screen.getByText("TypeScript")).toBeInTheDocument();
      expect(screen.getByText("Node.js")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Tech Giant")).toBeInTheDocument();
      expect(
        screen.getByDisplayValue("University of Texas"),
      ).toBeInTheDocument();
    });
  });
});
