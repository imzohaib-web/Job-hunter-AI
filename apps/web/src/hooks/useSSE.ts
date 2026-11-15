import { useCallback, useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/api";

export type SseConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error"
  | "closed";

export interface SseMessageEvent<T = unknown> {
  event?: string;
  data: T;
  id?: string;
}

export interface UseSseOptions<T = unknown> {
  enabled?: boolean;
  initialData?: T | null;
  onMessage?: (event: SseMessageEvent<T>) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  maxRetries?: number;
  initialRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  headers?: Record<string, string>;
}

export function useSSE<T = unknown>(
  url: string | null,
  options: UseSseOptions<T> = {},
) {
  const {
    enabled = true,
    initialData = null,
    onMessage,
    onError,
    onOpen,
    maxRetries = 5,
    initialRetryDelayMs = 1000,
    maxRetryDelayMs = 16000,
    headers = {},
  } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [status, setStatus] = useState<SseConnectionStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef<number>(0);
  const isManuallyClosedRef = useRef<boolean>(false);

  // Keep callback and object refs stable to avoid reconnect loops
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onOpenRef = useRef(onOpen);
  onMessageRef.current = onMessage;
  onErrorRef.current = onError;
  onOpenRef.current = onOpen;

  const headersRef = useRef(headers);
  headersRef.current = headers;

  const configRef = useRef({
    maxRetries,
    initialRetryDelayMs,
    maxRetryDelayMs,
  });
  configRef.current = {
    maxRetries,
    initialRetryDelayMs,
    maxRetryDelayMs,
  };

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!url || !enabled || isManuallyClosedRef.current) {
      return;
    }

    cleanup();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus(retryCountRef.current > 0 ? "reconnecting" : "connecting");

    const token = getAccessToken();
    const requestHeaders: Record<string, string> = {
      Accept: "text/event-stream",
      ...headersRef.current,
    };
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }

    void (async () => {
      try {
        const response = await fetch(url, {
          headers: requestHeaders,
          signal: controller.signal,
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`SSE stream connection failed with HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error("ReadableStream not supported by environment");
        }

        setStatus("connected");
        setError(null);
        retryCountRef.current = 0;
        setRetryCount(0);
        onOpenRef.current?.();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const processPart = (part: string) => {
          if (!part.trim()) return;

          let eventName: string | undefined;
          let rawData = "";
          let id: string | undefined;

          const lines = part.split(/\r?\n/);
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              const dataSlice = line.slice(5).trim();
              rawData += (rawData ? "\n" : "") + dataSlice;
            } else if (line.startsWith("id:")) {
              id = line.slice(3).trim();
            }
          }

          if (rawData) {
            let parsed: unknown = rawData;
            try {
              parsed = JSON.parse(rawData);
            } catch {
              // leave as string if not JSON
            }

            const typedData = parsed as T;
            setData(typedData);
            onMessageRef.current?.({
              event: eventName,
              data: typedData,
              id,
            });
          }
        };

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim()) {
              processPart(buffer);
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            processPart(part);
          }
        }

        // Stream closed normally from server
        if (!controller.signal.aborted && !isManuallyClosedRef.current) {
          setStatus("closed");
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          return;
        }

        const sseErr = err instanceof Error ? err : new Error(String(err));
        setError(sseErr);
        onErrorRef.current?.(sseErr);

        const {
          maxRetries: retriesLimit,
          initialRetryDelayMs: initialDelay,
          maxRetryDelayMs: maxDelay,
        } = configRef.current;

        if (retryCountRef.current < retriesLimit) {
          const currentRetry = retryCountRef.current;
          const delay = Math.min(
            initialDelay * 2 ** currentRetry + Math.random() * 500,
            maxDelay,
          );
          retryCountRef.current += 1;
          setRetryCount(retryCountRef.current);
          setStatus("reconnecting");

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setStatus("error");
        }
      }
    })();
  }, [url, enabled, cleanup]);

  useEffect(() => {
    isManuallyClosedRef.current = false;
    if (enabled && url) {
      connect();
    } else {
      cleanup();
      setStatus("idle");
    }

    return () => {
      cleanup();
    };
  }, [url, enabled, connect, cleanup]);

  const close = useCallback(() => {
    isManuallyClosedRef.current = true;
    cleanup();
    setStatus("closed");
  }, [cleanup]);

  const reconnect = useCallback(() => {
    isManuallyClosedRef.current = false;
    retryCountRef.current = 0;
    setRetryCount(0);
    connect();
  }, [connect]);

  return {
    data,
    status,
    error,
    retryCount,
    close,
    reconnect,
  };
}
