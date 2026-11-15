import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobCard } from "./JobCard";
import type { JobEntity, MatchEntity } from "@jobpilot/shared";

describe("JobCard Component", () => {
  const fullJob: JobEntity = {
    _id: "job-101",
    source: "greenhouse",
    externalId: "ext-101",
    title: "Senior AI Engineer",
    company: "Anthropic Partner Lab",
    location: "San Francisco, CA",
    remote: true,
    salary: { min: 160000, max: 210000, currency: "USD", period: "yearly" },
    description: "Build cutting-edge LLM agent workflows.",
    skills: ["Python", "FastAPI", "React", "Docker", "PyTorch"],
    url: "https://example.com/job/101",
    postedAt: "2026-11-14T10:00:00.000Z",
    isDemo: true,
  };

  const fullMatch: MatchEntity = {
    _id: "match-101",
    userId: "user-1",
    jobId: fullJob,
    score: 88,
    breakdown: {
      semantic: 92,
      keyword: 85,
      skills: 90,
      experience: 82,
    },
    matchedSkills: ["Python", "React", "FastAPI", "Docker"],
    missingSkills: ["PyTorch", "Kubernetes", "Rust"],
    explanation: "Strong match for Senior AI role based on candidate's backend and LLM experience.",
    createdAt: "2026-11-14T10:05:00.000Z",
    updatedAt: "2026-11-14T10:05:00.000Z",
  };

  it("renders full job card with title, company, location, formatted salary, score, and badges", () => {
    const handleSelect = vi.fn();
    const handleToggleSave = vi.fn();

    render(
      <JobCard
        match={fullMatch}
        isSaved={false}
        onSelect={handleSelect}
        onToggleSave={handleToggleSave}
      />,
    );

    // Title & company
    expect(screen.getByText("Senior AI Engineer")).toBeInTheDocument();
    expect(screen.getByText("Anthropic Partner Lab")).toBeInTheDocument();
    expect(screen.getByText("San Francisco, CA")).toBeInTheDocument();

    // Badges: remote, source, demo
    expect(screen.getByText("Remote")).toBeInTheDocument();
    expect(screen.getByText("via greenhouse")).toBeInTheDocument();
    expect(screen.getByText("Demo Data")).toBeInTheDocument();

    // Formatted salary
    expect(screen.getByText("USD 160,000 - 210,000/yr")).toBeInTheDocument();

    // Circular score
    expect(screen.getByLabelText(/Match score: 88%/i)).toBeInTheDocument();

    // Top 3 matched skills
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("FastAPI")).toBeInTheDocument();
    expect(screen.queryByText("Docker")).not.toBeInTheDocument(); // 4th skill not in top 3

    // Top 2 missing skills
    expect(screen.getByText("PyTorch")).toBeInTheDocument();
    expect(screen.getByText("Kubernetes")).toBeInTheDocument();
    expect(screen.queryByText("Rust")).not.toBeInTheDocument(); // 3rd skill not in top 2
  });

  it("renders gracefully when optional fields are missing (no salary, no location, empty skills, not demo)", () => {
    const minimalJob: JobEntity = {
      _id: "job-minimal",
      source: "indeed",
      externalId: "ext-min",
      title: "Backend Developer",
      company: "Startup Co",
      location: "",
      remote: false,
      salary: null,
      description: "Simple role",
      skills: [],
      url: "#",
      postedAt: "2026-11-14T00:00:00.000Z",
      isDemo: false,
    };

    const minimalMatch: MatchEntity = {
      _id: "match-minimal",
      userId: "user-1",
      jobId: minimalJob,
      score: 65,
      breakdown: {},
      matchedSkills: [],
      missingSkills: [],
      explanation: "",
      createdAt: "2026-11-14T00:00:00.000Z",
      updatedAt: "2026-11-14T00:00:00.000Z",
    };

    render(
      <JobCard
        match={minimalMatch}
        isSaved={false}
        onSelect={vi.fn()}
        onToggleSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Backend Developer")).toBeInTheDocument();
    expect(screen.getByText("Startup Co")).toBeInTheDocument();

    // On-site / Hybrid badge when remote is false
    expect(screen.getByText("On-site / Hybrid")).toBeInTheDocument();

    // No demo badge
    expect(screen.queryByText("Demo Data")).not.toBeInTheDocument();

    // Fallback notice when no skills
    expect(screen.getByText(/General technical profile match/i)).toBeInTheDocument();

    // Score gauge exists
    expect(screen.getByLabelText(/Match score: 65%/i)).toBeInTheDocument();
  });

  it("handles save bookmark button click without triggering onSelect", async () => {
    const handleSelect = vi.fn();
    const handleToggleSave = vi.fn().mockResolvedValue(undefined);

    render(
      <JobCard
        match={fullMatch}
        isSaved={false}
        onSelect={handleSelect}
        onToggleSave={handleToggleSave}
      />,
    );

    const bookmarkBtn = screen.getByRole("button", { name: /Save job/i });
    await act(async () => {
      fireEvent.click(bookmarkBtn);
    });

    expect(handleToggleSave).toHaveBeenCalledTimes(1);
    expect(handleToggleSave).toHaveBeenCalledWith("job-101", false);
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it("triggers onSelect when card is clicked or Enter is pressed", () => {
    const handleSelect = vi.fn();

    render(
      <JobCard
        match={fullMatch}
        isSaved={false}
        onSelect={handleSelect}
        onToggleSave={vi.fn()}
      />,
    );

    const card = screen.getByRole("button", { name: /Senior AI Engineer at Anthropic Partner Lab/i });
    fireEvent.click(card);
    expect(handleSelect).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(card, { key: "Enter" });
    expect(handleSelect).toHaveBeenCalledTimes(2);
  });
});
