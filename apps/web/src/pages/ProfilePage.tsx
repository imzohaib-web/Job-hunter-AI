import {
  AlertCircle,
  Briefcase,
  Download,
  Edit3,
  FileText,
  FileUp,
  GraduationCap,
  History,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ProfileReviewForm } from "@/components/onboarding/ProfileReviewForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useResumesQuery } from "@/hooks/useApi";
import type { ResumeEntity } from "@jobpilot/shared";

export function ProfilePage() {
  const { data: resumes, isLoading, isError, error, refetch } = useResumesQuery();
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <Card className="border-destructive/30 shadow-lg">
          <CardHeader>
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-destructive/10 text-destructive mb-2">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">Failed to Load Profile</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : "An unexpected error occurred."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state: no resumes uploaded yet
  if (!resumes || resumes.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <Card className="shadow-lg border">
          <CardHeader>
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
              <FileUp className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl font-bold">No Resume Profile Yet</CardTitle>
            <CardDescription className="max-w-sm mx-auto mt-1">
              Upload your resume to extract your verified skills, experience, and unlock tailored job matching.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <Button asChild size="lg" className="gap-2">
              <Link to="/onboarding">
                <PlusCircle className="h-4 w-4" />
                Start Resume Onboarding
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const latestResume = resumes[0];
  const profile = latestResume.verifiedProfile ?? latestResume.parsedProfile;

  if (isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
            ← Cancel Editing
          </Button>
          <span className="text-xs text-muted-foreground font-medium">
            Editing Version {latestResume.version}
          </span>
        </div>
        <ProfileReviewForm
          resume={latestResume}
          onConfirmed={(_updated: ResumeEntity) => {
            setIsEditing(false);
            void refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12 animate-fade-in">
      {/* Profile Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {profile?.name || "Candidate Profile"}
            </h1>
            <Badge variant="success">Verified Profile</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {profile?.location && <span>{profile.location} • </span>}
            {profile?.email && <span>{profile.email} • </span>}
            {profile?.phone && <span>{profile.phone}</span>}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="gap-1.5">
            <Edit3 className="h-4 w-4" />
            Edit Profile
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/onboarding">
              <FileUp className="h-4 w-4" />
              Upload New Resume
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary */}
      {profile?.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">{profile.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Skills */}
      {(profile?.skills ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Verified Skills
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile?.skills?.map((skill, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 rounded-lg border bg-secondary/50 px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  <span>{skill.name}</span>
                  {typeof skill.years === "number" && (
                    <span className="text-[10px] text-muted-foreground">{skill.years}y</span>
                  )}
                  {skill.category && (
                    <span className="text-[10px] text-primary/70 bg-primary/10 px-1 rounded">
                      {skill.category}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Work Experience */}
      {(profile?.experience ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              Work Experience
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {profile?.experience?.map((exp, idx) => (
              <div key={idx} className="space-y-2 border-b pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">{exp.title}</h3>
                  <span className="text-xs text-muted-foreground">
                    {exp.start || "Start"} — {exp.end || "Present"}
                  </span>
                </div>
                <p className="text-xs font-medium text-primary">{exp.company}</p>
                {(exp.bullets ?? []).length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4 mt-2">
                    {exp.bullets?.map((bullet, bIdx) => (
                      <li key={bIdx}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Education & Projects Grid */}
      <div className="grid gap-6 sm:grid-cols-2">
        {(profile?.education ?? []).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                Education
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile?.education?.map((edu, idx) => (
                <div key={idx} className="border-b pb-2 last:border-b-0">
                  <p className="text-xs font-semibold text-foreground">{edu.degree}</p>
                  <p className="text-xs text-muted-foreground">{edu.institution}</p>
                  {edu.end && <p className="text-[11px] text-muted-foreground/80">{edu.end}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {(profile?.projects ?? []).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                Projects
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile?.projects?.map((proj, idx) => (
                <div key={idx} className="border-b pb-2 last:border-b-0">
                  <p className="text-xs font-semibold text-foreground">{proj.name}</p>
                  <p className="text-xs text-muted-foreground">{proj.description}</p>
                  {proj.url && (
                    <a
                      href={proj.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary hover:underline"
                    >
                      {proj.url}
                    </a>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Version History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Version History</CardTitle>
          </div>
          <CardDescription>
            History of parsed and verified versions for your resume documents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {resumes.map((r, idx) => (
              <div
                key={r._id}
                className="flex items-center justify-between rounded-lg border bg-card/60 p-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">Version {r.version}</span>
                    {idx === 0 && <Badge variant="secondary">Current</Badge>}
                    <span className="text-muted-foreground">
                      • {new Date(r.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-muted-foreground flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    {r.original.filename} ({(r.original.size / 1024).toFixed(0)} KB)
                  </p>
                </div>

                {r.downloadUrl && (
                  <Button asChild variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <a href={r.downloadUrl} download>
                      <Download className="h-3.5 w-3.5" />
                      Download Original
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
