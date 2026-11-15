import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useResumeRunMutation } from "@/hooks/useApi";
import { useSSE } from "@/hooks/useSSE";

export type StepStatus = "pending" | "running" | "completed" | "failed";

export interface StepperNodeState {
  id: "company_research" | "tailor_resume" | "fabrication_check";
  label: string;
  description: string;
  status: StepStatus;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  message?: string;
  error?: string;
}

export interface GraphProgressEventData {
  run_id?: string;
  node?: string;
  status?: string;
  started_at?: string;
  ended_at?: string;
  message?: string;
}

interface PreparationRunStepperProps {
  runId: string;
  matchId: string;
  onComplete?: () => void;
  className?: string;
}

const INITIAL_NODES: StepperNodeState[] = [
  {
    id: "company_research",
    label: "Company Research",
    description: "Gathering company background, tech stack, and strategic insights",
    status: "pending",
  },
  {
    id: "tailor_resume",
    label: "Tailor Resume",
    description: "Aligning experience and keywords defensively against job requirements",
    status: "pending",
  },
  {
    id: "fabrication_check",
    label: "Fabrication Check",
    description: "Auditing every tailored bullet against verified source facts",
    status: "pending",
  },
];

export function PreparationRunStepper({
  runId,
  matchId,
  onComplete,
  className = "",
}: PreparationRunStepperProps) {
  const [nodes, setNodes] = useState<StepperNodeState[]>(INITIAL_NODES);
  const [now, setNow] = useState<number>(Date.now());
  const [hasCompleted, setHasCompleted] = useState(false);
  const onCompleteCalledRef = useRef(false);

  const resumeMutation = useResumeRunMutation();

  // Tick timer every 100ms for smooth duration counters
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const sseUrl = runId ? `/api/runs/${runId}/events?matchId=${matchId}` : null;

  const { status: sseStatus } = useSSE<GraphProgressEventData>(sseUrl, {
    enabled: Boolean(runId) && !hasCompleted,
    onMessage: (ev) => {
      const data = ev.data;
      if (!data) return;

      const nodeName: string | undefined = data.node;
      const status: string | undefined = data.status;
      const message: string = data.message || "";

      setNodes((prev) => {
        const next = prev.map((n) => ({ ...n }));

        const updateNode = (
          id: StepperNodeState["id"],
          newStatus: StepStatus,
          msg?: string,
          err?: string,
        ) => {
          const target = next.find((n) => n.id === id);
          if (target) {
            if (newStatus === "running" && target.status !== "running") {
              target.startedAt = Date.now();
            }
            if ((newStatus === "completed" || newStatus === "failed") && !target.endedAt) {
              target.endedAt = Date.now();
              if (target.startedAt) {
                target.durationMs = target.endedAt - target.startedAt;
              }
            }
            target.status = newStatus;
            if (msg) target.message = msg;
            if (err) target.error = err;
          }
        };

        if (nodeName === "company_research") {
          if (status === "running") {
            updateNode("company_research", "running", message);
          } else if (status === "done" || status === "skipped") {
            updateNode("company_research", "completed", message);
          } else if (status === "failed") {
            updateNode("company_research", "failed", message, message);
          }
        } else if (nodeName === "tailor_resume") {
          if (status === "running") {
            // Ensure company research is marked done if not already
            const cr = next.find((n) => n.id === "company_research");
            if (cr && cr.status !== "completed") {
              updateNode("company_research", "completed");
            }
            updateNode("tailor_resume", "running", message);
          } else if (status === "done") {
            updateNode("tailor_resume", "completed", message);
            // Resume tailoring passed fabrication check
            updateNode("fabrication_check", "running", "Auditing resume modifications...");
          } else if (status === "failed") {
            updateNode("tailor_resume", "failed", message, message);
          }
        } else if (nodeName === "fabrication_check") {
          if (status === "running") {
            updateNode("fabrication_check", "running", message);
          } else if (status === "done") {
            updateNode("fabrication_check", "completed", message);
          } else if (status === "failed") {
            updateNode("fabrication_check", "failed", message, message);
          }
        } else if (nodeName === "system" || nodeName === "assemble_result") {
          if (status === "done" || status === "completed") {
            // All completed
            next.forEach((n) => {
              if (n.status !== "completed") {
                updateNode(n.id, "completed");
              }
            });
            setHasCompleted(true);
          } else if (status === "failed") {
            // Mark last active node as failed
            const runningNode = next.find((n) => n.status === "running");
            if (runningNode) {
              updateNode(runningNode.id, "failed", message, message);
            }
          }
        }

        return next;
      });
    },
    onError: () => {
      // Don't mark failed immediately on transient error as useSSE retries automatically
    },
  });

  // Check if all 3 nodes have completed
  const allCompleted =
    hasCompleted ||
    (nodes.length === 3 && nodes.every((n) => n.status === "completed"));

  useEffect(() => {
    if (allCompleted && !onCompleteCalledRef.current) {
      onCompleteCalledRef.current = true;
      // Small graceful delay to let user see completion checkmarks
      const timer = setTimeout(() => {
        onComplete?.();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [allCompleted, onComplete]);

  // Handle retry
  const handleRetry = async () => {
    try {
      await resumeMutation.mutateAsync(runId);
      setNodes((prev) =>
        prev.map((n) => {
          if (n.status === "failed") {
            return {
              ...n,
              status: "running",
              error: undefined,
              startedAt: Date.now(),
              endedAt: undefined,
              durationMs: undefined,
            };
          }
          return n;
        }),
      );
    } catch {
      // Resume mutation handled
    }
  };

  const hasFailedNode = nodes.some((n) => n.status === "failed");

  // Format node duration
  const formatDuration = (node: StepperNodeState) => {
    if (node.status === "pending") return null;
    if (node.status === "running" && node.startedAt) {
      const ms = Math.max(0, now - node.startedAt);
      return `${(ms / 1000).toFixed(1)}s`;
    }
    if (node.durationMs !== undefined) {
      return `${(node.durationMs / 1000).toFixed(1)}s`;
    }
    if (node.startedAt && node.endedAt) {
      return `${((node.endedAt - node.startedAt) / 1000).toFixed(1)}s`;
    }
    return null;
  };

  return (
    <Card className={`border shadow-md bg-card ${className}`}>
      <CardHeader className="border-b pb-4 px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Application Preparation Pipeline
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Multi-agent orchestration: company research, defensive tailoring, and fabrication audit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {sseStatus === "connected" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Wifi className="h-3 w-3" />
                <span>Live SSE Connected</span>
              </span>
            )}
            {sseStatus === "connecting" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Connecting Stream...</span>
              </span>
            )}
            {sseStatus === "reconnecting" && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Reconnecting...</span>
              </span>
            )}
            {sseStatus === "error" && !hasFailedNode && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <WifiOff className="h-3 w-3" />
                <span>Connection Retrying</span>
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {/* Stepper container */}
        <div className="relative pl-6 space-y-8 before:absolute before:left-10 before:top-4 before:bottom-4 before:w-0.5 before:bg-border">
          {nodes.map((node, index) => {
            const duration = formatDuration(node);

            return (
              <div
                key={node.id}
                data-testid={`stepper-node-${node.id}`}
                className="relative flex items-start gap-4 transition-all duration-200"
              >
                {/* Node status icon */}
                <div
                  className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                    node.status === "completed"
                      ? "border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"
                      : node.status === "running"
                        ? "border-primary bg-background text-primary shadow-md shadow-primary/20 ring-4 ring-primary/10"
                        : node.status === "failed"
                          ? "border-destructive bg-destructive text-destructive-foreground shadow-sm shadow-destructive/20"
                          : "border-muted-foreground/30 bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {node.status === "completed" && (
                    <CheckCircle2 className="h-5 w-5 stroke-[2.5]" />
                  )}
                  {node.status === "running" && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary stroke-[2.5]" />
                  )}
                  {node.status === "failed" && (
                    <AlertCircle className="h-5 w-5 stroke-[2.5]" />
                  )}
                  {node.status === "pending" && (
                    <span className="text-xs font-semibold">{index + 1}</span>
                  )}
                </div>

                {/* Node details card */}
                <div className="flex-1 min-w-0 rounded-lg border bg-card/60 p-4 shadow-sm hover:border-foreground/20 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">
                        {node.label}
                      </span>
                      {/* Status badge */}
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider ${
                          node.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : node.status === "running"
                              ? "bg-primary/10 text-primary animate-pulse"
                              : node.status === "failed"
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {node.status === "completed"
                          ? "Completed"
                          : node.status === "running"
                            ? "Running"
                            : node.status === "failed"
                              ? "Failed"
                              : "Pending"}
                      </span>
                    </div>

                    {/* Execution duration */}
                    {duration && (
                      <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">
                        <Clock className="h-3 w-3" />
                        <span>{duration}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mt-1">
                    {node.description}
                  </p>

                  {/* Progress message or error */}
                  {node.message && node.status !== "failed" && (
                    <p className="text-xs text-primary/80 mt-2 italic bg-primary/5 p-2 rounded border border-primary/10">
                      {node.message}
                    </p>
                  )}

                  {node.error && (
                    <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="break-words font-medium">{node.error}</span>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={handleRetry}
                        disabled={resumeMutation.isPending}
                        className="shrink-0 gap-1 text-xs h-7 px-2.5 font-semibold"
                      >
                        {resumeMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        <span>Retry</span>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Global failure retry bar */}
        {hasFailedNode && (
          <div className="mt-6 p-4 rounded-xl bg-destructive/5 border border-destructive/20 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-medium">
                Pipeline execution stopped due to a node failure. You can resume execution from the checkpoint.
              </span>
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleRetry}
              disabled={resumeMutation.isPending}
              className="gap-1.5 text-xs font-semibold"
            >
              {resumeMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Resuming Graph...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry Node</span>
                </>
              )}
            </Button>
          </div>
        )}

        {/* Completed status summary */}
        {allCompleted && (
          <div className="mt-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>All 3 pipeline stages finished successfully. Generating review interface...</span>
            </div>
            {onComplete && (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={onComplete}
                className="gap-1.5 text-xs font-semibold"
              >
                <span>View Review Interface</span>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
