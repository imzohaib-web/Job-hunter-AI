import { describe, expect, it } from "vitest";
import type { ApplicationDetailItem } from "@/hooks/useApi";
import {
  getApplicationsNeedingFollowUp,
  getDaysSinceApplied,
  isApplicationNeedingFollowUp,
} from "./followUpRule";

describe("followUpRule (applied > 7 days ago with no status change)", () => {
  const referenceDate = new Date("2026-11-15T12:00:00Z");

  const createMockApp = (
    overrides: Partial<ApplicationDetailItem> = {},
  ): ApplicationDetailItem => ({
    _id: "app-1",
    status: "applied",
    jobId: {
      _id: "job-1",
      title: "Senior AI Engineer",
      company: "Anthropic",
      location: "San Francisco, CA",
    },
    matchId: {
      _id: "match-1",
      score: 92,
    },
    appliedAt: "2026-11-05T12:00:00Z", // 10 days before referenceDate
    statusHistory: [
      {
        status: "saved",
        changedAt: "2026-11-01T12:00:00Z",
      },
      {
        status: "applied",
        changedAt: "2026-11-05T12:00:00Z",
      },
    ],
    notes: "Applied via referral",
    createdAt: "2026-11-01T12:00:00Z",
    updatedAt: "2026-11-05T12:00:00Z",
    ...overrides,
  });

  it("returns true when applied 10 days ago with no subsequent status change", () => {
    const app = createMockApp({
      appliedAt: "2026-11-05T12:00:00Z", // 10 days ago
    });
    expect(isApplicationNeedingFollowUp(app, referenceDate)).toBe(true);
  });

  it("returns true when applied 8 days ago (> 7 days)", () => {
    const app = createMockApp({
      appliedAt: "2026-11-07T11:00:00Z", // 8.04 days ago
    });
    expect(isApplicationNeedingFollowUp(app, referenceDate)).toBe(true);
  });

  it("returns false when applied exactly 7 days ago", () => {
    const app = createMockApp({
      appliedAt: "2026-11-08T12:00:00Z", // exactly 7 days ago
    });
    expect(isApplicationNeedingFollowUp(app, referenceDate)).toBe(false);
  });

  it("returns false when applied 3 days ago (< 7 days)", () => {
    const app = createMockApp({
      appliedAt: "2026-11-12T12:00:00Z", // 3 days ago
    });
    expect(isApplicationNeedingFollowUp(app, referenceDate)).toBe(false);
  });

  it("returns false when status is not 'applied' (e.g. saved, interview, offer, rejected)", () => {
    const savedApp = createMockApp({
      status: "saved",
      appliedAt: "2026-11-01T12:00:00Z",
    });
    const interviewApp = createMockApp({
      status: "interview",
      appliedAt: "2026-11-01T12:00:00Z",
    });
    const offerApp = createMockApp({
      status: "offer",
      appliedAt: "2026-11-01T12:00:00Z",
    });
    const rejectedApp = createMockApp({
      status: "rejected",
      appliedAt: "2026-11-01T12:00:00Z",
    });

    expect(isApplicationNeedingFollowUp(savedApp, referenceDate)).toBe(false);
    expect(isApplicationNeedingFollowUp(interviewApp, referenceDate)).toBe(false);
    expect(isApplicationNeedingFollowUp(offerApp, referenceDate)).toBe(false);
    expect(isApplicationNeedingFollowUp(rejectedApp, referenceDate)).toBe(false);
  });

  it("returns false if application had a subsequent status change after being applied", () => {
    const app = createMockApp({
      status: "applied",
      appliedAt: "2026-11-01T12:00:00Z", // 14 days ago
      statusHistory: [
        {
          status: "applied",
          changedAt: "2026-11-01T12:00:00Z",
        },
        {
          status: "interview",
          changedAt: "2026-11-14T12:00:00Z", // Later changed to interview
        },
      ],
    });
    expect(isApplicationNeedingFollowUp(app, referenceDate)).toBe(false);
  });

  it("derives applied date from statusHistory if appliedAt is missing", () => {
    const app = createMockApp({
      appliedAt: null,
      statusHistory: [
        {
          status: "saved",
          changedAt: "2026-11-01T10:00:00Z",
        },
        {
          status: "applied",
          changedAt: "2026-11-05T10:00:00Z", // 10 days ago
        },
      ],
    });
    expect(isApplicationNeedingFollowUp(app, referenceDate)).toBe(true);
  });

  it("getApplicationsNeedingFollowUp filters an array correctly", () => {
    const app1 = createMockApp({
      _id: "app-1",
      appliedAt: "2026-11-02T12:00:00Z", // 13 days ago -> true
    });
    const app2 = createMockApp({
      _id: "app-2",
      appliedAt: "2026-11-13T12:00:00Z", // 2 days ago -> false
    });
    const app3 = createMockApp({
      _id: "app-3",
      status: "interview",
      appliedAt: "2026-10-20T12:00:00Z", // status != applied -> false
    });

    const result = getApplicationsNeedingFollowUp([app1, app2, app3], referenceDate);
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe("app-1");
  });

  it("calculates days since applied accurately", () => {
    const app = createMockApp({
      appliedAt: "2026-11-05T12:00:00Z", // 10 days before Nov 15
    });
    expect(getDaysSinceApplied(app, referenceDate)).toBe(10);
  });
});
