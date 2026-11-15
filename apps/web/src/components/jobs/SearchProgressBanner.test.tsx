import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchProgressBanner } from "./SearchProgressBanner";
import type { SearchRunEntity } from "@jobpilot/shared";

// Mock useSSE to avoid real EventSource initialization
vi.mock("@/hooks/useSSE", () => ({
  useSSE: vi.fn(),
}));

describe("SearchProgressBanner Component", () => {
  it("does not render hardcoded LinkedIn or Indeed chips, and renders real source statuses", () => {
    const mockSearch: SearchRunEntity = {
      _id: "search-123",
      userId: "user-456",
      query: { keywords: "full stack developer" },
      resultsCount: 28,
      status: "completed",
      sourceStatuses: [
        { source: "remotive", status: "ok", count: 16 },
        { source: "arbeitnow", status: "ok", count: 12 },
        {
          source: "adzuna",
          status: "skipped",
          count: 0,
          reason: "Missing credentials: ADZUNA_APP_ID/KEY not configured",
        },
      ],
      perSourceCounts: { remotive: 16, arbeitnow: 12, adzuna: 0 },
      durationMs: 1420,
      createdAt: "2026-11-15T00:00:00Z",
      updatedAt: "2026-11-15T00:00:01Z",
    };

    render(<SearchProgressBanner searchId="search-123" initialSearch={mockSearch} />);

    // Must NOT contain hardcoded LinkedIn or Indeed
    expect(screen.queryByText(/linkedin/i)).toBeNull();
    expect(screen.queryByText(/indeed/i)).toBeNull();

    // Must render real providers
    expect(screen.getByText(/remotive/i)).toBeDefined();
    expect(screen.getByText(/arbeitnow/i)).toBeDefined();
    expect(screen.getByText(/adzuna/i)).toBeDefined();

    // Adzuna must show skipped with tooltip reason
    expect(screen.getByText(/skipped/i)).toBeDefined();
    const adzunaChip = screen.getByTitle("Missing credentials: ADZUNA_APP_ID/KEY not configured");
    expect(adzunaChip).toBeDefined();
  });

  it("renders failed status and displays the real error message when search fails", () => {
    const mockFailedSearch: SearchRunEntity = {
      _id: "search-failed-123",
      userId: "user-456",
      query: { keywords: "full stack developer" },
      resultsCount: 0,
      status: "failed",
      error: "Authentication failed connecting to AI provider (401 Unauthorized)",
      sourceStatuses: [
        {
          source: "greenhouse",
          status: "failed",
          count: 0,
          error: "Rate limit reached",
        },
      ],
      durationMs: 500,
      createdAt: "2026-11-15T00:00:00Z",
      updatedAt: "2026-11-15T00:00:01Z",
    };

    render(
      <SearchProgressBanner
        searchId="search-failed-123"
        initialSearch={mockFailedSearch}
      />,
    );

    expect(screen.getByText(/Search Run Failed/i)).toBeDefined();
    expect(
      screen.getByText(/Authentication failed connecting to AI provider \(401 Unauthorized\)/i),
    ).toBeDefined();
    expect(screen.getByText(/greenhouse/i)).toBeDefined();
    expect(screen.getByTitle(/Rate limit reached/i)).toBeDefined();
  });
});
