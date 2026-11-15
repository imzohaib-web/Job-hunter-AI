import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsPage } from "./AnalyticsPage";
import { renderWithProviders } from "@/test/test-utils";
import * as apiHooks from "@/hooks/useApi";

describe("AnalyticsPage Component", () => {
  const mockAnalyticsData: apiHooks.AnalyticsData = {
    totals: {
      applications: 10,
      matches: 45,
      resumes: 2,
    },
    funnel: {
      counts: {
        saved: 4,
        applied: 3,
        interview: 2,
        offer: 1,
        rejected: 0,
      },
      conversionRates: {
        savedToApplied: 75,
        appliedToInterview: 66.7,
        interviewToOffer: 50,
        overallConversion: 10,
      },
    },
    applicationsPerWeek: [
      { week: "2026-W44", count: 2 },
      { week: "2026-W45", count: 5 },
      { week: "2026-W46", count: 3 },
    ],
    averageMatchScore: 84.5,
    averageMatchScoreByStatus: [
      { status: "saved", averageScore: 78, count: 4 },
      { status: "applied", averageScore: 82, count: 3 },
      { status: "interview", averageScore: 91, count: 2 },
      { status: "offer", averageScore: 96, count: 1 },
      { status: "rejected", averageScore: 65, count: 0 },
    ],
    topMissingSkills: [
      {
        skill: "Docker",
        count: 8,
        suggestion: "Consider a project containerizing a full-stack app with Docker & Compose",
      },
      {
        skill: "Kubernetes",
        count: 5,
        suggestion: "Deploy a microservice cluster using Minikube or Helm charts",
      },
    ],
    llmUsage: [
      { date: "2026-11-14", runsCount: 12, totalCostUsd: 0.045 },
      { date: "2026-11-15", runsCount: 8, totalCostUsd: 0.028 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders pipeline summary KPIs and conversion rates", () => {
    vi.spyOn(apiHooks, "useAnalyticsSummaryQuery").mockReturnValue({
      data: mockAnalyticsData,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useAnalyticsSummaryQuery>);

    renderWithProviders(<AnalyticsPage />);

    expect(screen.getByText("Pipeline & AI Analytics")).toBeInTheDocument();
    expect(screen.getByText("Total Applications")).toBeInTheDocument();
    expect(screen.getByText("Matches Evaluated")).toBeInTheDocument();
    expect(screen.getAllByText("10%").length).toBeGreaterThanOrEqual(1); // Overall conversion
    expect(screen.getByText("84.5%")).toBeInTheDocument(); // Avg applied match
  });

  it("renders the application funnel chart with stage conversion percentages", () => {
    vi.spyOn(apiHooks, "useAnalyticsSummaryQuery").mockReturnValue({
      data: mockAnalyticsData,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useAnalyticsSummaryQuery>);

    renderWithProviders(<AnalyticsPage />);

    expect(screen.getByTestId("funnel-chart-card")).toBeInTheDocument();
    expect(screen.getByText("Saved → Applied")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("Applied → Interview")).toBeInTheDocument();
    expect(screen.getByText("66.7%")).toBeInTheDocument();
  });

  it("renders top missing skills with actionable project suggestions", () => {
    vi.spyOn(apiHooks, "useAnalyticsSummaryQuery").mockReturnValue({
      data: mockAnalyticsData,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useAnalyticsSummaryQuery>);

    renderWithProviders(<AnalyticsPage />);

    expect(screen.getByTestId("top-missing-skills-card")).toBeInTheDocument();
    expect(screen.getByText("Docker")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Consider a project containerizing a full-stack app with Docker & Compose",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Kubernetes")).toBeInTheDocument();
  });

  it("renders daily LLM usage and API cost metrics", () => {
    vi.spyOn(apiHooks, "useAnalyticsSummaryQuery").mockReturnValue({
      data: mockAnalyticsData,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useAnalyticsSummaryQuery>);

    renderWithProviders(<AnalyticsPage />);

    expect(screen.getByTestId("llm-usage-card")).toBeInTheDocument();
    expect(screen.getByText("20 Runs")).toBeInTheDocument(); // 12 + 8
    expect(screen.getByText("$0.0730 USD")).toBeInTheDocument(); // 0.045 + 0.028
  });

  it("renders empty states gracefully when no data exists", () => {
    vi.spyOn(apiHooks, "useAnalyticsSummaryQuery").mockReturnValue({
      data: {
        totals: { applications: 0, matches: 0, resumes: 0 },
        funnel: {
          counts: { saved: 0, applied: 0, interview: 0, offer: 0, rejected: 0 },
          conversionRates: {
            savedToApplied: 0,
            appliedToInterview: 0,
            interviewToOffer: 0,
            overallConversion: 0,
          },
        },
        applicationsPerWeek: [],
        averageMatchScore: 0,
        averageMatchScoreByStatus: [],
        topMissingSkills: [],
        llmUsage: [],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof apiHooks.useAnalyticsSummaryQuery>);

    renderWithProviders(<AnalyticsPage />);

    expect(screen.getByText("No application funnel data yet")).toBeInTheDocument();
    expect(screen.getByText("No weekly application history yet")).toBeInTheDocument();
    expect(screen.getByText("No match score data yet")).toBeInTheDocument();
    expect(screen.getByText("No skill gaps identified yet")).toBeInTheDocument();
    expect(screen.getByText("No LLM activity recorded yet")).toBeInTheDocument();
  });
});
