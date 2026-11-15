import { ArrowRight, Bot, Briefcase, FileText, FileUp, KanbanSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUserQuery, useResumesQuery } from "@/hooks/useApi";
import { useAuthStore } from "@/stores/authStore";

export function DashboardPage() {
  const storeUser = useAuthStore((s) => s.user);
  const { data: userProfile } = useCurrentUserQuery();
  const { data: resumes } = useResumesQuery();
  const user = userProfile ?? storeUser;

  const hasResumes = resumes && resumes.length > 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back, {user?.name?.split(" ")[0] ?? "there"}!
            </h1>
            <Badge variant="success">Active</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            JobPilot is monitoring your pipeline and ready to tailor applications.
          </p>
        </div>

        {user?.quota && (
          <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
            <Bot className="h-5 w-5 text-primary" />
            <div className="text-xs">
              <p className="font-semibold text-foreground">AI Daily Quota</p>
              <p className="text-muted-foreground">
                {user.quota.dailyAiRequests} of {user.quota.dailyLimit} requests used
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Onboarding Callout if no resume uploaded */}
      {!hasResumes && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <FileUp className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Complete Your Onboarding</h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Upload your resume, review your verified skills & experience, and set your target job preferences to launch your first job search.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0 gap-2">
            <Link to="/onboarding">
              Start Onboarding
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}

      {/* Quick action cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
              <FileText className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Resume & Profile</CardTitle>
            <CardDescription>
              Review your parsed profile, skills, and work history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/profile">
                Go to Profile
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
              <Briefcase className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Job Discovery</CardTitle>
            <CardDescription>
              Explore ranked job matches with explanations and skill gap analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/jobs">
                Explore Jobs
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
              <KanbanSquare className="h-5 w-5" />
            </div>
            <CardTitle className="text-lg">Application Tracker</CardTitle>
            <CardDescription>
              Track your applications across every stage on a kanban board.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/applications">
                View Kanban Board
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
