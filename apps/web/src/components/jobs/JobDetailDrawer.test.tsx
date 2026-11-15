import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobDetailDrawer } from "./JobDetailDrawer";
import type { CompanyInsight, JobEntity, MatchEntity } from "@jobpilot/shared";

describe("JobDetailDrawer Component", () => {
  const mockInsight: CompanyInsight = {
    summary: "Leading AI systems and developer tooling lab.",
    company_name: "Anthropic Partner Lab",
    industry: "Artificial Intelligence",
    size_estimate: "100-250 employees",
    tech_stack: ["Python", "PyTorch", "TypeScript", "React"],
    culture_signals: ["High autonomy", "Rigorous research culture"],
    applicant_notes: ["Emphasis on evaluation metrics and clean systems."],
    confidence: 0.95,
  };

  const sampleJob: JobEntity = {
    _id: "job-202",
    source: "adzuna",
    externalId: "ext-202",
    title: "Lead AI Architect",
    company: "Neural Horizons",
    location: "New York, NY",
    remote: true,
    salary: "$180,000 - $240,000 / yr",
    description: `
      <p>Looking for a Lead AI Architect.</p>
      <script>window.maliciousPayload = true;</script>
      <p><strong>Responsibilities:</strong> Design robust multi-agent systems.</p>
      <img src="x" onerror="alert('xss')" />
    `,
    skills: ["Python", "LangChain", "FastAPI", "PostgreSQL"],
    url: "https://example.com/apply/202",
    postedAt: "2026-11-14T12:00:00.000Z",
    isDemo: true,
    companyInsight: mockInsight as unknown as Record<string, unknown>,
  };

  const sampleMatch: MatchEntity = {
    _id: "match-202",
    userId: "user-2",
    jobId: sampleJob,
    score: 91,
    breakdown: {
      semantic: 95,
      keyword: 88,
      skills: 92,
      experience: 89,
    },
    matchedSkills: ["Python", "FastAPI", "PostgreSQL"],
    missingSkills: ["LangChain", "Vector Databases"],
    explanation:
      "Exceptional fit based on extensive Python backend architecture and multi-agent leadership.",
    createdAt: "2026-11-14T12:05:00.000Z",
    updatedAt: "2026-11-14T12:05:00.000Z",
  };

  it("renders detail view and sanitises description with DOMPurify removing scripts and onerror handlers", () => {
    const handleClose = vi.fn();
    const handleToggleSave = vi.fn();
    const handlePrepare = vi.fn();

    render(
      <JobDetailDrawer
        match={sampleMatch}
        isOpen={true}
        onClose={handleClose}
        isSaved={false}
        onToggleSave={handleToggleSave}
        onPrepareApplication={handlePrepare}
      />,
    );

    // Job header
    expect(screen.getByText("Lead AI Architect")).toBeInTheDocument();
    expect(screen.getByText("Neural Horizons")).toBeInTheDocument();
    expect(screen.getByText("New York, NY")).toBeInTheDocument();

    // Sanitised description verification:
    // Safe text should be rendered
    expect(screen.getByText("Looking for a Lead AI Architect.")).toBeInTheDocument();
    expect(screen.getByText("Design robust multi-agent systems.")).toBeInTheDocument();

    // Malicious script content must NOT be present
    expect(document.querySelector("script")).toBeNull();
    // Malicious onerror handler must be stripped by DOMPurify
    expect(document.querySelector("img[onerror]")).toBeNull();
  });

  it("renders score breakdown horizontal bar chart and AI match summary explanation", () => {
    render(
      <JobDetailDrawer
        match={sampleMatch}
        isOpen={true}
        onClose={vi.fn()}
        onToggleSave={vi.fn()}
        onPrepareApplication={vi.fn()}
      />,
    );

    // 4 Score breakdown dimensions
    expect(screen.getByText("Semantic Match")).toBeInTheDocument();
    expect(screen.getByText("Skills Overlap")).toBeInTheDocument();
    expect(screen.getByText("Keyword Fit")).toBeInTheDocument();
    expect(screen.getByText("Experience Level")).toBeInTheDocument();

    // Explanation narrative text
    expect(screen.getByText(/AI Match Summary:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Exceptional fit based on extensive Python backend architecture/i),
    ).toBeInTheDocument();

    // Matched skills chips
    expect(screen.getByText("FastAPI")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();

    // Missing skills chips
    expect(screen.getByText("LangChain")).toBeInTheDocument();
    expect(screen.getByText("Vector Databases")).toBeInTheDocument();
  });

  it("renders company insight card with summary, tech stack, and culture signals", () => {
    render(
      <JobDetailDrawer
        match={sampleMatch}
        isOpen={true}
        onClose={vi.fn()}
        onToggleSave={vi.fn()}
        onPrepareApplication={vi.fn()}
      />,
    );

    expect(screen.getByText(/Company Intelligence/i)).toBeInTheDocument();
    expect(
      screen.getByText(/"Leading AI systems and developer tooling lab."/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Artificial Intelligence")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("High autonomy")).toBeInTheDocument();
  });

  it("triggers onPrepareApplication when Prepare Application button is clicked", async () => {
    const handlePrepare = vi.fn().mockResolvedValue(undefined);

    render(
      <JobDetailDrawer
        match={sampleMatch}
        isOpen={true}
        onClose={vi.fn()}
        onToggleSave={vi.fn()}
        onPrepareApplication={handlePrepare}
      />,
    );

    const prepareBtn = screen.getByRole("button", { name: /Prepare Application/i });
    await act(async () => {
      fireEvent.click(prepareBtn);
    });

    expect(handlePrepare).toHaveBeenCalledTimes(1);
    expect(handlePrepare).toHaveBeenCalledWith("match-202");
  });

  it("calls onClose when close button is clicked or Escape key is pressed", () => {
    const handleClose = vi.fn();

    render(
      <JobDetailDrawer
        match={sampleMatch}
        isOpen={true}
        onClose={handleClose}
        onToggleSave={vi.fn()}
        onPrepareApplication={vi.fn()}
      />,
    );

    const closeBtn = screen.getByRole("button", { name: /Close drawer/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
