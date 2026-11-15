import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrepareApplicationPage } from "./PrepareApplicationPage";
import { renderWithProviders } from "@/test/test-utils";
import * as apiHooks from "@/hooks/useApi";
import type { MatchEntity } from "@jobpilot/shared";

describe("PrepareApplicationPage Component", () => {
  const mockMatch = {
    _id: "match-123",
    userId: "user-1",
    jobId: "job-1",
    score: 95,
    matchedSkills: ["Python", "FastAPI"],
    missingSkills: [],
    explanation: "Strong alignment",
    job: {
      _id: "job-1",
      title: "Lead AI Engineer",
      company: "Anthropic",
      location: "San Francisco, CA",
      skills: ["Python", "FastAPI"],
    },
  };

  const mockResumeArtifact = {
    _id: "art-1",
    userId: "user-1",
    matchId: "match-123",
    type: "tailored_resume" as const,
    version: 1,
    createdAt: "2026-11-15T10:00:00Z",
    updatedAt: "2026-11-15T10:00:00Z",
    content: {
      sections: {
        name: "Test Candidate",
        summary: "Staff AI Specialist",
      },
      changes: [
        {
          section: "summary",
          before: "Old summary",
          after: "Staff AI Specialist",
          reason: "Better targeting",
          source_fact_ref: "profile.summary",
        },
      ],
      ats_report: { keyword_coverage: 90, missing_keywords: [] },
    },
    fabricationReport: { passed: true, claims_checked: 10, unsupported_claims: [] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders review interface immediately if artifacts are already present", () => {
    vi.spyOn(apiHooks, "useSingleMatchQuery").mockReturnValue({
      data: mockMatch as unknown as MatchEntity,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useSingleMatchQuery>);

    vi.spyOn(apiHooks, "useArtifactsQuery").mockReturnValue({
      data: [mockResumeArtifact],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof apiHooks.useArtifactsQuery>);

    renderWithProviders(
      <Routes>
        <Route path="/prepare/:matchId" element={<PrepareApplicationPage />} />
      </Routes>,
      {
        initialEntries: ["/prepare/match-123"],
      },
    );

    expect(screen.getByTestId("resume-review-interface")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lead AI Engineer" })).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
  });

  it("displays verification required warning banner when preparation is rejected with 409", async () => {
    vi.spyOn(apiHooks, "useSingleMatchQuery").mockReturnValue({
      data: mockMatch as unknown as MatchEntity,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useSingleMatchQuery>);

    vi.spyOn(apiHooks, "useArtifactsQuery").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof apiHooks.useArtifactsQuery>);

    vi.spyOn(apiHooks, "usePrepareApplicationMutation").mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Candidate profile must be verified")),
      isPending: false,
    } as unknown as ReturnType<typeof apiHooks.usePrepareApplicationMutation>);

    renderWithProviders(
      <Routes>
        <Route path="/prepare/:matchId" element={<PrepareApplicationPage />} />
      </Routes>,
      {
        initialEntries: ["/prepare/match-123"],
      },
    );

    expect(
      await screen.findByText(/Profile Verification Required/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Candidate profile must be verified/i),
    ).toBeInTheDocument();
  });
});
