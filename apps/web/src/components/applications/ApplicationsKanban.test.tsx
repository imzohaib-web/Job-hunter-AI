import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationsKanban } from "./ApplicationsKanban";
import { renderWithProviders } from "@/test/test-utils";
import type { ApplicationDetailItem, GroupedApplicationsData } from "@/hooks/useApi";
import { toast } from "@/stores/toastStore";

vi.spyOn(toast, "success");
vi.spyOn(toast, "error");

const mockCard1: ApplicationDetailItem = {
  _id: "app-1",
  userId: "user-1",
  status: "saved",
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
  notes: "Referral from teammate",
  statusHistory: [
    {
      status: "saved",
      changedAt: "2026-11-01T10:00:00Z",
      note: "Saved from search",
    },
  ],
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
};

const mockCard2: ApplicationDetailItem = {
  _id: "app-2",
  userId: "user-1",
  status: "applied",
  jobId: {
    _id: "job-2",
    title: "Staff Machine Learning Engineer",
    company: "Anthropic",
    location: "San Francisco, CA",
  },
  matchId: {
    _id: "match-2",
    score: 88,
  },
  appliedAt: "2026-11-05T12:00:00Z",
  notes: "Submitted via portal",
  statusHistory: [
    {
      status: "saved",
      changedAt: "2026-11-02T10:00:00Z",
    },
    {
      status: "applied",
      changedAt: "2026-11-05T12:00:00Z",
      note: "Submitted application online",
    },
  ],
  createdAt: "2026-11-02T10:00:00Z",
  updatedAt: "2026-11-05T12:00:00Z",
};

const mockInitialData: GroupedApplicationsData = {
  saved: [mockCard1],
  applied: [mockCard2],
  interview: [],
  offer: [],
  rejected: [],
};

describe("ApplicationsKanban Component", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all 5 kanban columns (Saved, Applied, Interview, Offer, Rejected)", () => {
    renderWithProviders(<ApplicationsKanban initialData={mockInitialData} />);

    expect(screen.getByTestId("kanban-column-saved")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-applied")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-interview")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-offer")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-rejected")).toBeInTheDocument();

    expect(screen.getByText("Google DeepMind")).toBeInTheDocument();
    expect(screen.getByText("Senior AI Engineer")).toBeInTheDocument();
    expect(screen.getByText("95% Match")).toBeInTheDocument();

    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("Staff Machine Learning Engineer")).toBeInTheDocument();
    expect(screen.getByText("88% Match")).toBeInTheDocument();
  });

  it("clicking a card opens the application detail side panel drawer", async () => {
    renderWithProviders(<ApplicationsKanban initialData={mockInitialData} />);

    const card = screen.getByTestId("kanban-card-app-1");
    await user.click(card);

    // Detail drawer is opened
    const drawer = screen.getByTestId("application-detail-drawer");
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveTextContent("Senior AI Engineer");
    expect(drawer).toHaveTextContent("Referral from teammate");
    expect(drawer).toHaveTextContent("Saved from search");
  });

  it("performs optimistic update when changing application status", async () => {
    const onStatusChangeMock = vi.fn().mockResolvedValue({ ok: true });

    renderWithProviders(
      <ApplicationsKanban
        initialData={mockInitialData}
        onStatusChangeOverride={onStatusChangeMock}
      />,
    );

    // Click card-1 (in saved column) to open drawer
    await user.click(screen.getByTestId("kanban-card-app-1"));

    // Select new status "interview"
    const statusSelect = screen.getByRole("combobox", {
      name: "Application status",
    });
    await user.selectOptions(statusSelect, "interview");

    // Immediately called with new status
    expect(onStatusChangeMock).toHaveBeenCalledWith("app-1", "interview");

    // Close drawer
    await user.click(screen.getByRole("button", { name: "Close drawer" }));

    // Optimistically, "Senior AI Engineer" is now rendered in the Interview column
    const interviewColumn = screen.getByTestId("kanban-column-interview");
    expect(interviewColumn).toHaveTextContent("Senior AI Engineer");
    expect(screen.getByTestId("kanban-column-saved")).not.toHaveTextContent(
      "Senior AI Engineer",
    );
  });

  it("rolls back to previous column on error when status change fails", async () => {
    const onStatusChangeMock = vi
      .fn()
      .mockRejectedValue(new Error("Network connection error"));

    renderWithProviders(
      <ApplicationsKanban
        initialData={mockInitialData}
        onStatusChangeOverride={onStatusChangeMock}
      />,
    );

    // Click card-1 in Saved column
    await user.click(screen.getByTestId("kanban-card-app-1"));

    // Select new status "offer"
    const statusSelect = screen.getByRole("combobox", {
      name: "Application status",
    });
    await user.selectOptions(statusSelect, "offer");

    await waitFor(() => {
      expect(onStatusChangeMock).toHaveBeenCalledWith("app-1", "offer");
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to move application to offer. Rolling back."),
      );
    });

    // Close drawer
    await user.click(screen.getByRole("button", { name: "Close drawer" }));

    // Card should be rolled back and present in Saved column, NOT Offer column
    const savedColumn = screen.getByTestId("kanban-column-saved");
    expect(savedColumn).toHaveTextContent("Senior AI Engineer");

    const offerColumn = screen.getByTestId("kanban-column-offer");
    expect(offerColumn).not.toHaveTextContent("Senior AI Engineer");
  });
});
