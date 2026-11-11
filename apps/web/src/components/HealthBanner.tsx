import { useQuery } from "@tanstack/react-query";
import type { HealthStatus } from "@jobpilot/shared";
import { cn } from "@/lib/utils";

async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch("/api/health");
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  return res.json() as Promise<HealthStatus>;
}

export function HealthBanner() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["api-health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    retry: 1,
  });

  const statusLabel = isLoading
    ? "Checking API…"
    : isError
      ? `API unreachable${error instanceof Error ? `: ${error.message}` : ""}`
      : `API ${data?.status ?? "unknown"}`;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b px-4 py-2 text-sm",
        isError
          ? "border-red-200 bg-red-50 text-red-800"
          : isLoading
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-900",
      )}
      role="status"
    >
      <span>{statusLabel}</span>
      <button
        type="button"
        className="underline-offset-2 hover:underline disabled:opacity-60"
        onClick={() => void refetch()}
        disabled={isFetching}
      >
        {isFetching ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
