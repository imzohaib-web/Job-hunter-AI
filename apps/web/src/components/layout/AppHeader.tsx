import { Bot, CheckCircle2, Sparkles, WifiOff } from "lucide-react";
import { useLocation } from "react-router-dom";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { UserMenu } from "@/components/layout/UserMenu";
import { useDeepHealthQuery, useHealthQuery } from "@/hooks/useApi";

function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/jobs")) return "Job Matches";
  if (pathname.startsWith("/preferences")) return "Job Preferences";
  if (pathname.startsWith("/applications")) return "Application Pipeline";
  if (pathname.startsWith("/profile")) return "Profile & Resume";
  if (pathname.startsWith("/analytics")) return "Analytics & Insights";
  return "JobPilot";
}

export function AppHeader() {
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);
  const { data: health, isError: isHealthError } = useHealthQuery();
  const { data: deepHealth, isError: isDeepError } = useDeepHealthQuery();

  const aiServiceStatus =
    isHealthError || isDeepError
      ? "error"
      : deepHealth?.checks?.aiService ?? (health?.status === "ok" ? "starting" : "error");

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b bg-card/80 backdrop-blur px-4 sm:px-6">
      {/* Left side: Mobile brand / Desktop section title */}
      <div className="flex items-center gap-3">
        <div className="flex md:hidden items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </div>
          <span className="font-bold text-sm">JobPilot</span>
        </div>

        <div className="hidden md:block">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            {pageTitle}
          </h1>
        </div>
      </div>

      {/* Right side: AI Service Status Chip, Health, Theme toggle, User menu */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* AI Service Status Chip */}
        <div
          title={
            aiServiceStatus === "ok"
              ? "AI Service Ready (Embeddings & Semantic Search loaded)"
              : aiServiceStatus === "starting"
                ? "AI Service Starting (Loading models in background...)"
                : "AI Service Offline"
          }
          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground bg-background"
        >
          <Sparkles className="h-3 w-3 text-primary" />
          {aiServiceStatus === "ok" ? (
            <>
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline font-medium text-foreground">AI Ready</span>
            </>
          ) : aiServiceStatus === "starting" ? (
            <>
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="hidden sm:inline font-medium text-amber-600 dark:text-amber-400">
                AI Starting…
              </span>
            </>
          ) : (
            <>
              <span className="flex h-2 w-2 rounded-full bg-destructive" />
              <span className="hidden sm:inline font-medium text-destructive">AI Down</span>
            </>
          )}
        </div>

        {/* Subtle API Health Dot */}
        <div
          title={
            isHealthError
              ? "API Offline"
              : health?.status === "ok"
                ? "API Connected"
                : "Checking API"
          }
          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground bg-background"
        >
          {isHealthError ? (
            <>
              <WifiOff className="h-3 w-3 text-destructive" />
              <span className="hidden sm:inline">Offline</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              <span className="hidden sm:inline">System Healthy</span>
            </>
          )}
        </div>

        <ThemeToggle />
        <div className="h-4 w-px bg-border" />
        <UserMenu />
      </div>
    </header>
  );
}
