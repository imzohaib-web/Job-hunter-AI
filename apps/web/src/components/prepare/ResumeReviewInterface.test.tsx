import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeReviewInterface } from "./ResumeReviewInterface";
import { renderWithProviders } from "@/test/test-utils";
import * as exportUtils from "@/utils/exportResume";
import type { ArtifactEntity } from "@/hooks/useApi";
import type { MatchEntity } from "@jobpilot/shared";

// Mock export helpers
vi.spyOn(exportUtils, "downloadResumeDocx").mockResolvedValue();
vi.spyOn(exportUtils, "downloadResumePdf").mockResolvedValue();

const mockResumeArtifact: ArtifactEntity = {
  _id: "artifact-resume-123",
  userId: "user-1",
  matchId: "match-1",
  type: "tailored_resume",
  version: 1,
  createdAt: "2026-11-15T10:00:00Z",
  updatedAt: "2026-11-15T10:00:00Z",
  fabricationReport: {
    passed: true,
    claims_checked: 14,
    unsupported_claims: [],
  },
  content: {
    sections: {
      name: "Alex Morgan",
      email: "alex@example.com",
      summary: "Senior AI Engineer specializing in distributed LLM architectures.",
      experience: [
        {
          title: "Senior AI Engineer",
          company: "Nexus AI",
          location: "San Francisco, CA",
          bullets: [
            "Architected low-latency FastAPI pipelines.",
            "Deployed Kubernetes microservices across 3 clusters.",
          ],
        },
      ],
      skills: ["Python", "FastAPI", "Kubernetes", "PyTorch"],
    },
    changes: [
      {
        id: "change-1",
        section: "experience",
        before: "Worked on Python backend services and scripts.",
        after: "Architected production FastAPI pipelines serving 10M requests daily.",
        reason: "Highlights requested FastAPI microservices experience.",
        source_fact_ref: "profile.experience[0].bullets[0]",
        approved: undefined,
      },
      {
        id: "change-2",
        section: "experience",
        before: "Managed Docker containers on local machines.",
        after: "Orchestrated resilient Kubernetes microservices with 99.99% uptime.",
        reason: "Targets infrastructure and Kubernetes requirements.",
        source_fact_ref: "profile.experience[0].bullets[1]",
        approved: undefined,
      },
    ],
    ats_report: {
      keyword_coverage: 92.5,
      missing_keywords: ["Prometheus"],
      word_count: 480,
      length_check: "Optimal: 1-2 pages",
      section_checks: [
        { section: "experience", status: "pass", feedback: "Strong impact metrics." },
      ],
      formatting_warnings: [],
    },
    keyword_plan: [
      { keyword: "FastAPI", is_gap: false },
      { keyword: "Kubernetes", is_gap: false },
      { keyword: "Prometheus", is_gap: true },
    ],
  },
};

const mockCompanyArtifact: ArtifactEntity = {
  _id: "artifact-company-123",
  userId: "user-1",
  matchId: "match-1",
  type: "company_insight",
  version: 1,
  createdAt: "2026-11-15T10:00:00Z",
  updatedAt: "2026-11-15T10:00:00Z",
  content: {
    company_name: "Anthropic",
    summary: "AI safety and research company that builds reliable, beneficial AI systems.",
    industry: "Artificial Intelligence",
    size_estimate: "250-500 employees",
    confidence: 0.88,
    tech_stack: ["Python", "Rust", "FastAPI", "Kubernetes", "AWS"],
    products_or_services: ["Claude LLM", "Constitutional AI", "API Platform"],
    culture_signals: ["Safety-first orientation", "Async research documentation"],
    applicant_notes: [
      "Heavy emphasis on distributed training infrastructure and evaluation safety.",
      "Fast-growing engineering organization expanding inference capacity.",
    ],
    sources: ["https://anthropic.com/about", "https://anthropic.com/careers"],
    limitations: [],
  },
};

const mockMatch = {
  _id: "match-1",
  userId: "user-1",
  jobId: "job-1",
  score: 94,
  breakdown: {},
  matchedSkills: ["FastAPI", "Kubernetes"],
  missingSkills: ["Prometheus"],
  explanation: "High alignment with AI platform engineering role.",
  createdAt: "2026-11-15T10:00:00Z",
  updatedAt: "2026-11-15T10:00:00Z",
  job: {
    _id: "job-1",
    source: "greenhouse",
    externalId: "ext-1",
    title: "Senior AI Platform Engineer",
    company: "Anthropic",
    location: "San Francisco, CA (Remote)",
    remote: true,
    description: "Build robust AI systems.",
    skills: ["Python", "FastAPI", "Kubernetes"],
    url: "https://anthropic.com/jobs/1",
    postedAt: "2026-11-15T09:00:00Z",
  },
};

describe("ResumeReviewInterface Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with strictly two tabs (Resume and Company) and excludes Cover Letter and Interview Prep", () => {
    renderWithProviders(
      <ResumeReviewInterface
        match={mockMatch as unknown as MatchEntity}
        resumeArtifact={mockResumeArtifact}
        companyArtifact={mockCompanyArtifact}
      />,
    );

    // Verify exactly two tabs exist
    expect(screen.getByTestId("tab-resume")).toBeInTheDocument();
    expect(screen.getByTestId("tab-company")).toBeInTheDocument();

    // Verify Cover Letter and Interview Prep are strictly NOT present
    expect(screen.queryByText(/cover letter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/interview preparation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/interview pack/i)).not.toBeInTheDocument();
  });

  it("displays prominent fabrication check pass status and ATS keyword coverage gauge", () => {
    renderWithProviders(
      <ResumeReviewInterface
        match={mockMatch as unknown as MatchEntity}
        resumeArtifact={mockResumeArtifact}
        companyArtifact={mockCompanyArtifact}
      />,
    );

    expect(screen.getByText(/Fabrication Audit: PASSED/i)).toBeInTheDocument();
    expect(screen.getByText(/14 Claims Audited/i)).toBeInTheDocument();
    expect(screen.getByTestId("ats-coverage-percentage")).toHaveTextContent("93%");
    expect(screen.getByText("Prometheus")).toBeInTheDocument(); // Missing keyword
  });

  it("disables DOCX and PDF export while any change is pending", () => {
    renderWithProviders(
      <ResumeReviewInterface
        match={mockMatch as unknown as MatchEntity}
        resumeArtifact={mockResumeArtifact}
        companyArtifact={mockCompanyArtifact}
      />,
    );

    const docxBtn = screen.getByTestId("export-docx-btn");
    const pdfBtn = screen.getByTestId("export-pdf-btn");

    // Both export buttons must be disabled while changes are pending
    expect(docxBtn).toBeDisabled();
    expect(pdfBtn).toBeDisabled();
    expect(screen.getByTestId("export-review-guard-status")).toHaveTextContent(
      /Review all changes to export \(2 pending\)/i,
    );
  });

  it("accepts individual resume changes and updates decision state", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ResumeReviewInterface
        match={mockMatch as unknown as MatchEntity}
        resumeArtifact={mockResumeArtifact}
        companyArtifact={mockCompanyArtifact}
      />,
    );

    const acceptBtn0 = screen.getByTestId("accept-btn-0");
    await user.click(acceptBtn0);

    // Decision status updates to Accepted
    expect(screen.getByTestId("decision-status-0")).toHaveTextContent(/accepted/i);

    // Pending count decremented from 2 to 1
    expect(screen.getByTestId("export-review-guard-status")).toHaveTextContent(
      /1 pending/i,
    );

    // Export must still be disabled because 1 change remains pending
    expect(screen.getByTestId("export-docx-btn")).toBeDisabled();
    expect(screen.getByTestId("export-pdf-btn")).toBeDisabled();
  });

  it("rejects individual resume changes and updates decision state", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ResumeReviewInterface
        match={mockMatch as unknown as MatchEntity}
        resumeArtifact={mockResumeArtifact}
        companyArtifact={mockCompanyArtifact}
      />,
    );

    const rejectBtn1 = screen.getByTestId("reject-btn-1");
    await user.click(rejectBtn1);

    expect(screen.getByTestId("decision-status-1")).toHaveTextContent(/rejected/i);
    expect(screen.getByTestId("export-review-guard-status")).toHaveTextContent(
      /1 pending/i,
    );
  });

  it("enables DOCX and PDF export only after all changes are accepted or rejected", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ResumeReviewInterface
        match={mockMatch as unknown as MatchEntity}
        resumeArtifact={mockResumeArtifact}
        companyArtifact={mockCompanyArtifact}
      />,
    );

    const docxBtn = screen.getByTestId("export-docx-btn");
    const pdfBtn = screen.getByTestId("export-pdf-btn");

    expect(docxBtn).toBeDisabled();
    expect(pdfBtn).toBeDisabled();

    // Accept change 0
    await user.click(screen.getByTestId("accept-btn-0"));
    expect(docxBtn).toBeDisabled();

    // Reject change 1
    await user.click(screen.getByTestId("reject-btn-1"));

    // Now 0 pending: All reviewed!
    expect(screen.getByTestId("export-review-guard-status")).toHaveTextContent(
      /All changes reviewed \(1 accepted, 1 rejected\)/i,
    );

    // Both buttons must now be enabled
    expect(docxBtn).not.toBeDisabled();
    expect(pdfBtn).not.toBeDisabled();
  });

  it("maintains review decisions across filter switches", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ResumeReviewInterface
        match={mockMatch as unknown as MatchEntity}
        resumeArtifact={mockResumeArtifact}
        companyArtifact={mockCompanyArtifact}
      />,
    );

    // Accept change 0
    await user.click(screen.getByTestId("accept-btn-0"));

    // Switch to 'Accepted' filter
    await user.click(screen.getByTestId("filter-accepted-btn"));
    expect(screen.getByTestId("change-card-0")).toBeInTheDocument();
    expect(screen.queryByTestId("change-card-1")).not.toBeInTheDocument();

    // Switch to 'Pending' filter
    await user.click(screen.getByTestId("filter-pending-btn"));
    expect(screen.queryByTestId("change-card-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("change-card-1")).toBeInTheDocument();

    // Reject change 1
    await user.click(screen.getByTestId("reject-btn-1"));

    // Switch back to 'All'
    await user.click(screen.getByRole("button", { name: /^All/i }));
    expect(screen.getByTestId("decision-status-0")).toHaveTextContent(/accepted/i);
    expect(screen.getByTestId("decision-status-1")).toHaveTextContent(/rejected/i);
  });

  it("navigates to Company tab and displays verified insights, tech stack, and sources", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ResumeReviewInterface
        match={mockMatch as unknown as MatchEntity}
        resumeArtifact={mockResumeArtifact}
        companyArtifact={mockCompanyArtifact}
      />,
    );

    // Switch to Company Tab
    await user.click(screen.getByTestId("tab-company"));

    expect(screen.getByTestId("company-research-tab")).toBeInTheDocument();
    expect(screen.getByTestId("company-confidence-badge")).toHaveTextContent("88% Confidence");
    expect(screen.getByText(/AI safety and research company/i)).toBeInTheDocument();
    expect(screen.getByText("Rust")).toBeInTheDocument();
    expect(screen.getByText("Constitutional AI")).toBeInTheDocument();
    expect(screen.getByText("https://anthropic.com/about")).toBeInTheDocument();
  });
});
