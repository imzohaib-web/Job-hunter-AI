import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAccessToken } from "@/lib/api";
import { useSSE } from "./useSSE";

describe("useSSE", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setAccessToken(null);
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setAccessToken(null);
  });

  it("passes Authorization header when user is logged in", async () => {
    setAccessToken("test-stream-jwt");

    // Create a mock stream that ends immediately
    const mockStream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: mockStream,
    });

    renderHook(() => useSSE("/api/runs/123/events"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/runs/123/events",
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "text/event-stream",
            Authorization: "Bearer test-stream-jwt",
          }),
        }),
      );
    });
  });

  it("parses incoming SSE messages and calls onMessage", async () => {
    const encoder = new TextEncoder();
    const onMessageSpy = vi.fn();

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('event: progress\ndata: {"step": "research", "percent": 50}\n\n'),
        );
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: mockStream,
    });

    const { result } = renderHook(() =>
      useSSE<{ step: string; percent: number }>("/api/runs/test/events", {
        onMessage: onMessageSpy,
      }),
    );

    await waitFor(() => {
      expect(onMessageSpy).toHaveBeenCalledWith({
        event: "progress",
        data: { step: "research", percent: 50 },
        id: undefined,
      });
      expect(result.current.data).toEqual({ step: "research", percent: 50 });
    });
  });

  it("aborts fetch stream on unmount", async () => {
    let abortSignalled = false;

    const mockStream = new ReadableStream({
      start() {
        // keep open until aborted
      },
      cancel() {
        abortSignalled = true;
      },
    });

    mockFetch.mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) => {
        init?.signal?.addEventListener("abort", () => {
          abortSignalled = true;
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          body: mockStream,
        });
      },
    );

    const { unmount } = renderHook(() => useSSE("/api/runs/test/events"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    unmount();

    expect(abortSignalled).toBe(true);
  });
});
