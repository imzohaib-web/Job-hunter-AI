import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiClient } from "@/lib/api";
import { renderWithProviders } from "@/test/test-utils";
import type { ResumeEntity } from "@jobpilot/shared";
import { OnboardingWizard } from "./OnboardingWizard";

describe("OnboardingWizard Flow", () => {
  let mockApi: MockAdapter;

  const mockResume: ResumeEntity = {
    _id: "res-flow-1",
    userId: "u-1",
    original: {
      filename: "test_resume.pdf",
      storageKey: "storage-flow",
      mimeType: "application/pdf",
      size: 4096,
      uploadedAt: new Date().toISOString(),
    },
    status: "ready",
    version: 1,
    warnings: [],
    fieldConfidences: {},
    parsedProfile: {
      name: "Taylor Swift",
      email: "taylor@example.com",
      phone: "+1 555-1234",
      location: "New York, NY",
      summary: "Full-Stack Software Engineer with 6 years experience.",
      links: [],
      skills: [{ name: "React", category: "Frameworks" }],
      experience: [
        {
          company: "Acme Inc",
          title: "Senior AI Engineer",
          start: "2021",
          end: "Present",
          bullets: ["Built LLM applications."],
        },
      ],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    mockApi = new MockAdapter(apiClient);
    localStorage.clear();
  });

  afterEach(() => {
    mockApi.restore();
    localStorage.clear();
  });

  it("completes full flow: review profile -> job preferences -> starts search", async () => {
    const user = userEvent.setup();

    // Mock profile confirmation PATCH
    const verifiedResume: ResumeEntity = {
      ...mockResume,
      version: 2,
      verifiedProfile: mockResume.parsedProfile,
    };
    mockApi.onPatch(`/resumes/${mockResume._id}/profile`).reply(200, {
      resume: verifiedResume,
    });

    // Mock search creation POST
    mockApi.onPost("/searches").reply(200, {
      _id: "search-12345",
      status: "pending",
    });

    // Render wizard starting at review step with parsed resume
    renderWithProviders(
      <OnboardingWizard initialResume={mockResume} initialStep="review" />,
    );

    // 1. In Review Step
    expect(screen.getByRole("heading", { name: /review & verify profile/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Taylor Swift")).toBeInTheDocument();

    // Confirm Profile
    const confirmBtn = screen.getByRole("button", { name: /confirm profile & continue/i });
    await user.click(confirmBtn);

    // 2. Transitions seamlessly to Job Preferences Step
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /set job preferences/i })).toBeInTheDocument();
    });

    // Verify role pre-populated from experience
    expect(screen.getByText("Senior AI Engineer")).toBeInTheDocument();

    // 3. Click "Find Jobs"
    const findJobsBtn = screen.getByRole("button", { name: /find jobs/i });
    await user.click(findJobsBtn);

    // 4. Mutation dispatched successfully
    await waitFor(() => {
      expect(mockApi.history.post.length).toBe(1);
      expect(mockApi.history.post[0].url).toBe("/searches");
    });
  });
});
