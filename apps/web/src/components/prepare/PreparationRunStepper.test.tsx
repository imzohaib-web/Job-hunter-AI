import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreparationRunStepper } from "./PreparationRunStepper";
import { renderWithProviders } from "@/test/test-utils";
import * as apiHooks from "@/hooks/useApi";
import * as sseHook from "@/hooks/useSSE";

describe("PreparationRunStepper Component", () => {
  const mockResumeMutation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(apiHooks, "useResumeRunMutation").mockReturnValue({
      mutateAsync: mockResumeMutation,
      isPending: false,
    } as unknown as ReturnType<typeof apiHooks.useResumeRunMutation>);
  });

  it("renders the 3 graph nodes in the vertical stepper", () => {
    vi.spyOn(sseHook, "useSSE").mockReturnValue({
      data: null,
      status: "connected",
      error: null,
      retryCount: 0,
      close: vi.fn(),
      reconnect: vi.fn(),
    });

    renderWithProviders(
      <PreparationRunStepper runId="run-123" matchId="match-123" />,
    );

    expect(screen.getByTestId("stepper-node-company_research")).toBeInTheDocument();
    expect(screen.getByTestId("stepper-node-tailor_resume")).toBeInTheDocument();
    expect(screen.getByTestId("stepper-node-fabrication_check")).toBeInTheDocument();

    expect(screen.getByText("Company Research")).toBeInTheDocument();
    expect(screen.getByText("Tailor Resume")).toBeInTheDocument();
    expect(screen.getByText("Fabrication Check")).toBeInTheDocument();
  });

  it("updates node statuses and progress messages upon receiving SSE events", async () => {
    let capturedOnMessage:
      | ((event: sseHook.SseMessageEvent<unknown>) => void)
      | undefined;

    vi.spyOn(sseHook, "useSSE").mockImplementation((_url, options) => {
      capturedOnMessage = options?.onMessage as
        | ((event: sseHook.SseMessageEvent<unknown>) => void)
        | undefined;
      return {
        data: null,
        status: "connected",
        error: null,
        retryCount: 0,
        close: vi.fn(),
        reconnect: vi.fn(),
      };
    });

    renderWithProviders(
      <PreparationRunStepper runId="run-123" matchId="match-123" />,
    );

    // Initial state: pending
    expect(screen.getByTestId("stepper-node-company_research")).toHaveTextContent(/Pending/i);

    // Simulate company_research running event wrapped in act
    await act(async () => {
      capturedOnMessage?.({
        data: {
          node: "company_research",
          status: "running",
          message: "Searching public web sources for Anthropic intelligence",
        },
      });
    });

    expect(screen.getByTestId("stepper-node-company_research")).toHaveTextContent(/Running/i);
    expect(
      screen.getByText("Searching public web sources for Anthropic intelligence"),
    ).toBeInTheDocument();

    // Simulate company_research done event wrapped in act
    await act(async () => {
      capturedOnMessage?.({
        data: {
          node: "company_research",
          status: "done",
          message: "Gathered background intelligence",
        },
      });
    });

    expect(screen.getByTestId("stepper-node-company_research")).toHaveTextContent(/Completed/i);
  });

  it("displays retry button on failed node and triggers resume endpoint", async () => {
    const user = userEvent.setup();
    let capturedOnMessage:
      | ((event: sseHook.SseMessageEvent<unknown>) => void)
      | undefined;

    vi.spyOn(sseHook, "useSSE").mockImplementation((_url, options) => {
      capturedOnMessage = options?.onMessage as
        | ((event: sseHook.SseMessageEvent<unknown>) => void)
        | undefined;
      return {
        data: null,
        status: "connected",
        error: null,
        retryCount: 0,
        close: vi.fn(),
        reconnect: vi.fn(),
      };
    });

    renderWithProviders(
      <PreparationRunStepper runId="run-123" matchId="match-123" />,
    );

    // Simulate tailor_resume node failure wrapped in act
    await act(async () => {
      capturedOnMessage?.({
        data: {
          node: "tailor_resume",
          status: "failed",
          message: "API rate limit reached during LLM rewrite",
        },
      });
    });

    expect(screen.getByTestId("stepper-node-tailor_resume")).toHaveTextContent(/Failed/i);
    expect(screen.getByText("API rate limit reached during LLM rewrite")).toBeInTheDocument();

    // Find and click Retry button
    const retryButtons = screen.getAllByRole("button", { name: /Retry/i });
    expect(retryButtons.length).toBeGreaterThan(0);

    mockResumeMutation.mockResolvedValueOnce({ status: "running" });
    await user.click(retryButtons[0]);

    expect(mockResumeMutation).toHaveBeenCalledWith("run-123");
  });

  it("triggers onComplete callback when graph completes all nodes", async () => {
    const onComplete = vi.fn();
    let capturedOnMessage:
      | ((event: sseHook.SseMessageEvent<unknown>) => void)
      | undefined;

    vi.spyOn(sseHook, "useSSE").mockImplementation((_url, options) => {
      capturedOnMessage = options?.onMessage as
        | ((event: sseHook.SseMessageEvent<unknown>) => void)
        | undefined;
      return {
        data: null,
        status: "connected",
        error: null,
        retryCount: 0,
        close: vi.fn(),
        reconnect: vi.fn(),
      };
    });

    renderWithProviders(
      <PreparationRunStepper
        runId="run-123"
        matchId="match-123"
        onComplete={onComplete}
      />,
    );

    // Complete all nodes via system done event
    await act(async () => {
      capturedOnMessage?.({
        data: {
          node: "system",
          status: "done",
          message: "Graph execution completed successfully.",
        },
      });
    });

    await waitFor(
      () => {
        expect(onComplete).toHaveBeenCalled();
      },
      { timeout: 1500 },
    );
  });
});
