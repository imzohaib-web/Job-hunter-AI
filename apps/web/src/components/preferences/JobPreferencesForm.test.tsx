import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ParsedProfile, SearchPreset, SourceAvailabilityInfo } from "@jobpilot/shared";
import {
  JobPreferencesForm,
  inferExperienceLevels,
} from "./JobPreferencesForm";

describe("JobPreferencesForm Component", () => {
  const mockProfile: ParsedProfile = {
    name: "Alex Mercer",
    summary: "Senior full stack and AI engineer with 7 years experience.",
    location: "Berlin, Germany",
    skills: [
      { name: "TypeScript", category: "Languages" },
      { name: "Python", category: "Languages" },
      { name: "React", category: "Frameworks" },
      { name: "FastAPI", category: "Frameworks" },
    ],
    experience: [
      {
        company: "TechCorp",
        title: "Senior Full-Stack Engineer",
        start: "2018-01",
        end: "2024-01",
        bullets: ["Led microservices architecture"],
      },
      {
        company: "StartupLab",
        title: "Software Engineer",
        start: "2016-01",
        end: "2017-12",
        bullets: ["Built frontend applications"],
      },
    ],
  };

  const mockSources: SourceAvailabilityInfo[] = [
    {
      source: "remotive",
      name: "Remotive",
      available: true,
      supportedFilters: ["category", "search"],
    },
    {
      source: "arbeitnow",
      name: "Arbeitnow",
      available: true,
      supportedFilters: [],
    },
    {
      source: "adzuna",
      name: "Adzuna",
      available: false,
      reason: "Missing ADZUNA_APP_ID or ADZUNA_APP_KEY",
      supportedFilters: ["what", "where", "salary_min"],
    },
  ];

  const mockPresets: SearchPreset[] = [
    {
      id: "preset-1",
      name: "Remote Senior TS Roles",
      preferences: {
        targetTitles: ["Senior Full-Stack Engineer"],
        employmentTypes: ["full-time"],
        experienceLevels: ["senior"],
        workModes: ["remote"],
        locations: [],
        openToRelocation: false,
        remoteWorldwide: true,
        visaSponsorshipNeeded: false,
        preferredCountries: [],
        salary: { currency: "USD", minimum: 140000, period: "yearly", hideWithoutSalary: true },
        mustHaveSkills: ["TypeScript"],
        niceToHaveSkills: [],
        industries: [],
        companySizes: [],
        datePosted: "7d",
        excludedKeywords: [],
        excludedCompanies: [],
        roleFamilies: ["software"],
        alsoShowOtherRoles: true,
        sources: ["remotive"],
      },
      createdAt: "2026-01-01T00:00:00Z",
    },
  ];

  it("infers senior/lead experience levels for 7+ years of experience", () => {
    const levels = inferExperienceLevels(mockProfile);
    expect(levels).toEqual(["senior", "lead"]);
  });

  it("pre-fills titles, inferred seniority, and profile skills from candidate profile", () => {
    render(<JobPreferencesForm profile={mockProfile} availableSources={mockSources} />);

    // Inferred experience levels from profile
    expect(screen.getAllByText("Senior Full-Stack Engineer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/From verified profile:/i)).toBeInTheDocument();

    // Profile quick-add skills
    expect(screen.getAllByText("TypeScript").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("FastAPI").length).toBeGreaterThanOrEqual(1);
  });

  it("collapses and expands sections when header is clicked", () => {
    render(<JobPreferencesForm profile={mockProfile} />);

    // Section 1 is expanded initially
    expect(screen.getByText("Employment Type (multi-select)")).toBeInTheDocument();

    // Click header to collapse
    const section1Header = screen.getByText("1. Role & Seniority");
    fireEvent.click(section1Header);

    // After collapse, inner employment type label is hidden
    expect(screen.queryByText("Employment Type (multi-select)")).not.toBeInTheDocument();

    // Click again to expand
    fireEvent.click(section1Header);
    expect(screen.getByText("Employment Type (multi-select)")).toBeInTheDocument();
  });

  it("shows live summary line updating with active filters", () => {
    render(
      <JobPreferencesForm
        initialPreferences={{
          targetTitles: ["AI Engineer"],
          workModes: ["remote"],
          employmentTypes: ["full-time"],
          salary: { currency: "USD", minimum: 150000, period: "yearly", hideWithoutSalary: false },
          sources: ["remotive", "arbeitnow"],
        }}
      />,
    );

    expect(screen.getByText(/AI Engineer • full-time • remote • \$150k\+\/yr • 2 sources/i)).toBeInTheDocument();
  });

  it("submits form values when 'Save Preferences' is clicked", async () => {
    const handleSave = vi.fn();
    const user = userEvent.setup();

    render(
      <JobPreferencesForm
        initialPreferences={{
          targetTitles: ["Backend Architect"],
          employmentTypes: ["full-time"],
          workModes: ["remote"],
        }}
        onSave={handleSave}
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /^Save Preferences$/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalled();
      const submitted = handleSave.mock.calls[0][0];
      expect(submitted.targetTitles).toContain("Backend Architect");
      expect(submitted.workModes).toContain("remote");
    });
  });

  it("triggers 'Save and Find Jobs' action on button click", async () => {
    const handleFind = vi.fn();
    const user = userEvent.setup();

    render(
      <JobPreferencesForm
        initialPreferences={{
          targetTitles: ["Staff DevOps Engineer"],
          workModes: ["hybrid"],
        }}
        onSaveAndFindJobs={handleFind}
      />,
    );

    const findBtn = screen.getByRole("button", { name: /Save and Find Jobs/i });
    await user.click(findBtn);

    await waitFor(() => {
      expect(handleFind).toHaveBeenCalled();
      expect(handleFind.mock.calls[0][0].targetTitles).toContain("Staff DevOps Engineer");
    });
  });

  it("manages search presets: saving and selecting presets", async () => {
    const handleSavePreset = vi.fn();
    const handleApplyPreset = vi.fn();
    const user = userEvent.setup();

    render(
      <JobPreferencesForm
        presets={mockPresets}
        onSavePreset={handleSavePreset}
        onApplyPreset={handleApplyPreset}
      />,
    );

    // Save Preset button toggles input
    const openPresetBtn = screen.getByRole("button", { name: /Save Preset/i });
    await user.click(openPresetBtn);

    const input = screen.getByPlaceholderText(/Preset name.../i);
    await user.type(input, "My Custom Preset");

    const saveConfirmBtn = screen.getByRole("button", { name: "Save" });
    await user.click(saveConfirmBtn);

    expect(handleSavePreset).toHaveBeenCalledWith("My Custom Preset", expect.any(Object));

    // Preset selection
    const presetSelect = screen.getByLabelText(/Load search preset/i);
    fireEvent.change(presetSelect, { target: { value: "preset-1" } });

    expect(handleApplyPreset).toHaveBeenCalledWith(mockPresets[0]);
  });

  it("renders source availability and credential warning status", () => {
    render(<JobPreferencesForm availableSources={mockSources} />);

    // Remotive is active
    expect(screen.getByText("Remotive")).toBeInTheDocument();

    // Adzuna is unavailable with reason
    expect(screen.getByText("Adzuna")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Missing ADZUNA_APP_ID or ADZUNA_APP_KEY/i)).toBeInTheDocument();

    // Adzuna checkbox is disabled
    const checkboxes = screen.getAllByRole("checkbox");
    const adzunaCheckbox = checkboxes.find(
      (cb) => cb.closest("div")?.textContent?.includes("Adzuna"),
    ) as HTMLInputElement;

    expect(adzunaCheckbox).toBeDisabled();
  });

  it("resets to default values on 'Reset' click", () => {
    const handleReset = vi.fn();

    render(
      <JobPreferencesForm
        initialPreferences={{
          targetTitles: ["Non-default Role"],
        }}
        onReset={handleReset}
      />,
    );

    expect(screen.getByText("Non-default Role")).toBeInTheDocument();

    const resetButton = screen.getByRole("button", { name: /^Reset$/i });
    fireEvent.click(resetButton);

    expect(handleReset).toHaveBeenCalled();
  });
});
