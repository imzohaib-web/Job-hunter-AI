import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { renderWithProviders } from "@/test/test-utils";
import { JobsPage } from "./JobsPage";

vi.mock("@/hooks/useSSE", () => ({
  useSSE: vi.fn(),
}));

describe("JobsPage Component", () => {
  let mockApi: MockAdapter;

  beforeEach(() => {
    mockApi = new MockAdapter(apiClient);
    useAuthStore.getState().setAuth(
      {
        id: "u-1",
        email: "test@example.com",
        name: "Test User",
        role: "user",
      },
      "test-token",
    );

    mockApi.onGet("/applications").reply(200, {
      applications: [],
      savedJobIds: [],
    });
  });

  afterEach(() => {
    mockApi.restore();
    useAuthStore.getState().clearAuth();
  });

  it("Variant 1: renders search failed state with real error message and retry button", async () => {
    const searchId = "search-failed-1";
    mockApi.onGet(`/searches/${searchId}`).reply(200, {
      data: {
        _id: searchId,
        userId: "u-1",
        query: { keywords: "full stack developer" },
        status: "failed",
        error: "Authentication failed connecting to AI provider (401 Unauthorized)",
        resultsCount: 0,
        perSourceCounts: {},
        createdAt: "2026-11-15T00:00:00Z",
        updatedAt: "2026-11-15T00:00:01Z",
      },
    });

    mockApi.onGet("/matches").reply(200, {
      data: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 1 },
    });

    renderWithProviders(<JobsPage />, {
      initialEntries: [`/jobs?searchId=${searchId}`],
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/Discovery Search Failed/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Authentication failed connecting to AI provider \(401 Unauthorized\)/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /retry search/i })).toBeInTheDocument();
    });
  });

  it("Variant 2: renders sources returned 0 jobs state when no positions found", async () => {
    const searchId = "search-empty-1";
    mockApi.onGet(`/searches/${searchId}`).reply(200, {
      data: {
        _id: searchId,
        userId: "u-1",
        query: { keywords: "full stack developer" },
        status: "completed",
        resultsCount: 0,
        perSourceCounts: { remotive: 0, arbeitnow: 0 },
        diagnostics: {
          fetched: 0,
          afterDedupe: 0,
          afterHardFilters: 0,
          ranked: 0,
        },
        createdAt: "2026-11-15T00:00:00Z",
        updatedAt: "2026-11-15T00:00:01Z",
      },
    });

    mockApi.onGet("/matches").reply(200, {
      data: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 1 },
    });

    renderWithProviders(<JobsPage />, {
      initialEntries: [`/jobs?searchId=${searchId}`],
    });

    await waitFor(() => {
      expect(
        screen.getByText(/No candidate positions found across sources/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /start new search/i })).toBeInTheDocument();
    });
  });

  it("Variant 3: renders filters removed all jobs state with Clear All Filters button", async () => {
    const searchId = "search-filtered-1";
    mockApi.onGet(`/searches/${searchId}`).reply(200, {
      data: {
        _id: searchId,
        userId: "u-1",
        query: { keywords: "full stack developer" },
        status: "completed",
        resultsCount: 2,
        perSourceCounts: { remotive: 2 },
        createdAt: "2026-11-15T00:00:00Z",
        updatedAt: "2026-11-15T00:00:01Z",
      },
    });

    mockApi.onGet("/matches").reply(200, {
      data: [
        {
          _id: "match-1",
          userId: "u-1",
          jobId: {
            _id: "job-1",
            title: "Senior Lead Architect",
            company: "Acme",
            source: "remotive",
          },
          score: 85,
        },
      ],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
    });

    const user = userEvent.setup();
    renderWithProviders(<JobsPage />, {
      initialEntries: [`/jobs?searchId=${searchId}`],
    });

    // Wait for the job card to appear first
    await waitFor(() => {
      expect(screen.getByText("Senior Lead Architect")).toBeInTheDocument();
    });

    // Select "Junior" seniority filter to exclude the Senior Lead job
    const senioritySelect = screen.getByRole("combobox", { name: /seniority/i });
    await user.selectOptions(senioritySelect, "junior");

    // Now filtered count is 0 while total count is 1 -> Filter empty state
    await waitFor(() => {
      expect(
        screen.getByText(/Filters removed all candidate positions/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /clear all filters/i }),
      ).toBeInTheDocument();
    });

    // Clicking Clear All Filters should restore the job card
    const clearBtn = screen.getByRole("button", { name: /clear all filters/i });
    await user.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText("Senior Lead Architect")).toBeInTheDocument();
    });
  });

  it("renders collapsible 'Why 0 results' diagnostics panel with staged counts", async () => {
    const user = userEvent.setup();
    const searchId = "search-diag-1";

    mockApi.onGet(`/searches/${searchId}`).reply(200, {
      data: {
        _id: searchId,
        userId: "u-1",
        query: { keywords: "full stack developer" },
        status: "completed",
        resultsCount: 0,
        perSourceCounts: { remotive: 0 },
        diagnostics: {
          fetched: 25,
          afterDedupe: 18,
          afterHardFilters: 4,
          ranked: 0,
          mainFilterRemoved: "Strict non-remote country requirements",
        },
        createdAt: "2026-11-15T00:00:00Z",
        updatedAt: "2026-11-15T00:00:01Z",
      },
    });

    mockApi.onGet("/matches").reply(200, {
      data: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 1 },
    });

    renderWithProviders(<JobsPage />, {
      initialEntries: [`/jobs?searchId=${searchId}`],
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /why 0 results\? search diagnostics & stage breakdown/i,
        }),
      ).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole("button", {
      name: /why 0 results\? search diagnostics & stage breakdown/i,
    });

    // Expand panel
    await user.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText(/Stage 1: Fetched/i)).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
      expect(screen.getByText(/Stage 2: After Dedupe/i)).toBeInTheDocument();
      expect(screen.getByText("18")).toBeInTheDocument();
      expect(screen.getByText(/Stage 3: Passing Criteria/i)).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText(/Strict non-remote country requirements/i)).toBeInTheDocument();
    });
  });
});
