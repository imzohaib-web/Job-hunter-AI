import { Link } from "react-router-dom";
import { BarChart2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApplicationsKanban } from "@/components/applications/ApplicationsKanban";
import { useApplicationsQuery } from "@/hooks/useApi";

export function ApplicationsPage() {
  const { data } = useApplicationsQuery();

  const totalCount = data?.all.length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Application Tracker
            </h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {totalCount} Total
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Organize, update, and monitor your job applications across every stage of the pipeline.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link to="/analytics">
              <BarChart2 className="h-3.5 w-3.5" />
              Pipeline Analytics
            </Link>
          </Button>

          <Button asChild size="sm" className="gap-1.5 text-xs">
            <Link to="/jobs">
              <Plus className="h-3.5 w-3.5" />
              Explore Matches
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Kanban Board */}
      <ApplicationsKanban />
    </div>
  );
}
