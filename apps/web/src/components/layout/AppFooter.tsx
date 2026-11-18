import { useEffect, useState } from "react";
import { PIPELINE_VERSION, type VersionInfo } from "@jobpilot/shared";
import { AlertTriangle } from "lucide-react";

export function AppFooter() {
  const webSha = (import.meta.env.VITE_GIT_SHA || "dev").slice(0, 7);
  const webPipeline = import.meta.env.VITE_PIPELINE_VERSION || PIPELINE_VERSION;

  const [apiVersion, setApiVersion] = useState<VersionInfo | null>(null);
  const [aiVersion, setAiVersion] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchVersions() {
      try {
        const [apiRes, aiRes] = await Promise.allSettled([
          fetch("/api/version").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/version/ai").then((r) => (r.ok ? r.json() : null)),
        ]);

        if (!active) return;

        if (apiRes.status === "fulfilled" && apiRes.value) {
          setApiVersion(apiRes.value);
        }
        if (aiRes.status === "fulfilled" && aiRes.value) {
          setAiVersion(aiRes.value);
        }
      } catch (err) {
        console.warn("Failed to fetch version info:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchVersions();
    const interval = setInterval(fetchVersions, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const apiSha = (apiVersion?.git_sha || "unknown").slice(0, 7);
  const aiSha = (aiVersion?.git_sha || "unknown").slice(0, 7);

  const apiPipeline = apiVersion?.pipeline_version || "unknown";
  const aiPipeline = aiVersion?.pipeline_version || "unknown";

  // Check if all three report identical pipeline versions
  const isMismatch =
    !loading &&
    ((apiVersion && apiPipeline !== webPipeline) ||
      (aiVersion && aiPipeline !== webPipeline) ||
      (apiVersion && aiVersion && apiPipeline !== aiPipeline));

  return (
    <footer className="border-t border-border bg-background/80 px-4 py-2 text-xs text-muted-foreground backdrop-blur flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span>
          web <code className="font-mono">{webSha}</code> · api{" "}
          <code className="font-mono">{apiSha}</code> · ai{" "}
          <code className="font-mono">{aiSha}</code> · pipeline{" "}
          <code className="font-mono">{webPipeline}</code>
        </span>
      </div>

      {isMismatch && (
        <div
          role="alert"
          className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/30"
          title={`Pipeline mismatch! Web: ${webPipeline}, API: ${apiPipeline}, AI: ${aiPipeline}`}
        >
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          <span>Pipeline version mismatch (web: {webPipeline}, api: {apiPipeline}, ai: {aiPipeline})</span>
        </div>
      )}
    </footer>
  );
}
