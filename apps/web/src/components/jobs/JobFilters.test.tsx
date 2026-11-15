import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobFilters } from "./JobFilters";
import { DEFAULT_FILTERS, type JobFilterValues } from "./jobUtils";

describe("JobFilters Component", () => {
  it("renders filter controls with initial filter values", () => {
    const handleChange = vi.fn();

    render(
      <JobFilters
        filters={DEFAULT_FILTERS}
        onChange={handleChange}
        totalCount={50}
        filteredCount={32}
      />,
    );

    // Title and match count badge
    expect(screen.getByText("Filter Matches")).toBeInTheDocument();
    expect(screen.getByText("32 matches (of 50)")).toBeInTheDocument();

    // Slider
    expect(screen.getByLabelText(/Minimum match score/i)).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();

    // Toggles
    expect(screen.getByRole("button", { name: /Remote Only/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Saved Jobs Only/i })).toBeInTheDocument();

    // Selects
    expect(screen.getByLabelText(/Source Platform/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Seniority/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sort By/i)).toBeInTheDocument();
  });

  it("updates minScore slider and triggers onChange", () => {
    const handleChange = vi.fn();

    render(<JobFilters filters={DEFAULT_FILTERS} onChange={handleChange} />);

    const slider = screen.getByLabelText(/Minimum match score/i);
    fireEvent.change(slider, { target: { value: "75" } });

    expect(handleChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      minScore: 75,
    });
  });

  it("toggles remoteOnly and savedOnly options", () => {
    const handleChange = vi.fn();

    render(<JobFilters filters={DEFAULT_FILTERS} onChange={handleChange} />);

    const remoteBtn = screen.getByRole("button", { name: /Remote Only/i });
    fireEvent.click(remoteBtn);
    expect(handleChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      remoteOnly: true,
    });

    const savedBtn = screen.getByRole("button", { name: /Saved Jobs Only/i });
    fireEvent.click(savedBtn);
    expect(handleChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      savedOnly: true,
    });
  });

  it("updates source and sort select fields", () => {
    const handleChange = vi.fn();

    render(<JobFilters filters={DEFAULT_FILTERS} onChange={handleChange} />);

    const sourceSelect = screen.getByLabelText(/Source Platform/i);
    fireEvent.change(sourceSelect, { target: { value: "greenhouse" } });
    expect(handleChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      source: "greenhouse",
    });

    const sortSelect = screen.getByLabelText(/Sort By/i);
    fireEvent.change(sortSelect, { target: { value: "date_desc" } });
    expect(handleChange).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS,
      sort: "date_desc",
    });
  });

  it("shows Reset Filters button when dirty and resets back to defaults", () => {
    const handleChange = vi.fn();
    const dirtyFilters: JobFilterValues = {
      ...DEFAULT_FILTERS,
      minScore: 80,
      remoteOnly: true,
    };

    render(<JobFilters filters={dirtyFilters} onChange={handleChange} />);

    const resetBtn = screen.getByRole("button", { name: /Reset Filters/i });
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(resetBtn);
    expect(handleChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
  });
});
