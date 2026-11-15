import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import { renderWithProviders } from "@/test/test-utils";
import * as apiHooks from "@/hooks/useApi";
import type { AuthUser, MatchesResponse, ResumeEntity } from "@jobpilot/shared";

describe("DashboardPage Component", () => {
  const mockUser = {
    _id: "user-1",
    id: "user-1",
    name: "Jane Doe",
    email: "jane@example.com",
    quota: {
      dailyAiRequests: 5,
      dailyLimit: 25,
      resetsAt: new Date().toISOString(),
    },
  };

  const mockAppNeedingFollowUp: apiHooks.ApplicationDetailItem = {
    _id: "app-followup",
    userId: "user-1",
    status: "applied",
    jobId: {
      _id: "job-1",
      title: "Senior AI Engineer",
      company: "Google DeepMind",
      location: "London, UK",
    },
    matchId: {
      _id: "match-1",
      score: 95,
    },
    appliedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
    statusHistory: [
      {
        status: "applied",
        changedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockRecentApp: apiHooks.ApplicationDetailItem = {
    _id: "app-recent",
    userId: "user-1",
    status: "applied",
    jobId: {
      _id: "job-2",
      title: "ML Infra Engineer",
      company: "Anthropic",
      location: "San Francisco, CA",
    },
    matchId: {
      _id: "match-2",
      score: 88,
    },
    appliedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    statusHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(apiHooks, "useCurrentUserQuery").mockReturnValue({
      data: mockUser as unknown as AuthUser,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useCurrentUserQuery>);

    vi.spyOn(apiHooks, "useResumesQuery").mockReturnValue({
      data: [{ _id: "res-1" } as unknown as ResumeEntity],
      isLoading: false,
    } as unknown as ReturnType<typeof apiHooks.useResumesQuery>);

    vi.spyOn(apiHooks, "useAnalyticsSummaryQuery").mockReturnValue({
      data: {
        totals: { applications: 5, matches: 12, resumes: 1 },
        funnel: {
          counts: { saved: 1, applied: 2, interview: 1, offer: 1, rejected: 0 },
          conversionRates: {
            savedToApplied: 100,
            appliedToInterview: 50,
            interviewToOffer: 100,
            overallConversion: 20,
          },
        },
        applicationsPerWeek: [],
        averageMatchScore: 88,
        averageMatchScoreByStatus: [],
        topMissingSkills: [],
        llmUsage: [],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useAnalyticsSummaryQuery>);

    vi.spyOn(apiHooks, "useMatchesQuery").mockReturnValue({
      data: {
        data: [
          {
            _id: "match-1",
            score: 94,
            jobId: {
              _id: "job-1",
              title: "Senior AI Engineer",
              company: "DeepMind",
              location: "London",
            },
            matchedSkills: ["Python", "PyTorch"],
          },
        ],
        pagination: { total: 1, page: 1, limit: 5, totalPages: 1 },
      } as unknown as MatchesResponse,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useMatchesQuery>);
  });

  it("renders 3 KPI cards with pipeline counts, interview conversion, and matches", () => {
    vi.spyOn(apiHooks, "useApplicationsQuery").mockReturnValue({
      data: {
        grouped: {
          saved: [],
          applied: [mockAppNeedingFollowUp],
          interview: [],
          offer: [],
          rejected: [],
        },
        all: [mockAppNeedingFollowUp],
        savedJobIds: new Set<string>(),
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useApplicationsQuery>);

    renderWithProviders(<DashboardPage />);

    expect(screen.getByText("Active Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Interview Rate")).toBeInTheDocument();
    expect(screen.getByText("Opportunities")).toBeInTheDocument();
  });

  it("identifies and displays applications needing follow-up (applied > 7 days ago)", () => {
    vi.spyOn(apiHooks, "useApplicationsQuery").mockReturnValue({
      data: {
        grouped: {
          saved: [],
          applied: [mockAppNeedingFollowUp, mockRecentApp],
          interview: [],
          offer: [],
          rejected: [],
        },
        all: [mockAppNeedingFollowUp, mockRecentApp],
        savedJobIds: new Set<string>(),
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useApplicationsQuery>);

    renderWithProviders(<DashboardPage />);

    const followUpSection = screen.getByTestId("follow-up-section");
    expect(followUpSection).toHaveTextContent("Google DeepMind");
    expect(followUpSection).toHaveTextContent("10 days ago");
    // Recent app (2 days ago) should NOT be in follow-up list
    expect(followUpSection).not.toHaveTextContent("Anthropic");
  });

  it("renders empty state when no applications need follow-up", () => {
    vi.spyOn(apiHooks, "useApplicationsQuery").mockReturnValue({
      data: {
        grouped: {
          saved: [],
          applied: [mockRecentApp], // applied 2 days ago
          interview: [],
          offer: [],
          rejected: [],
        },
        all: [mockRecentApp],
        savedJobIds: new Set<string>(),
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useApplicationsQuery>);

    renderWithProviders(<DashboardPage />);

    expect(
      screen.getByText("All caught up! No applications currently waiting for follow-up."),
    ).toBeInTheDocument();
  });

  it("renders recent job matches with direct 'Prepare Application' CTA", () => {
    vi.spyOn(apiHooks, "useApplicationsQuery").mockReturnValue({
      data: {
        grouped: { saved: [], applied: [], interview: [], offer: [], rejected: [] },
        all: [],
        savedJobIds: new Set<string>(),
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useApplicationsQuery>);

    renderWithProviders(<DashboardPage />);

    const matchesSection = screen.getByTestId("recent-matches-section");
    expect(matchesSection).toHaveTextContent("DeepMind");
    expect(matchesSection).toHaveTextContent("94%");
    expect(screen.getByRole("link", { name: /prepare application/i })).toBeInTheDocument();
  });
});
