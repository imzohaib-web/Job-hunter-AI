import {
  AlertTriangle,
  Award,
  Briefcase,
  CheckCircle2,
  GraduationCap,
  Languages,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePatchResumeMutation } from "@/hooks/useApi";
import { toast } from "@/stores/toastStore";
import type {
  Certification,
  Education,
  LanguageProficiency,
  ParsedProfile,
  ProfileSkill,
  Project,
  ResumeEntity,
  WorkExperience,
} from "@jobpilot/shared";

import { isFieldLowConfidence } from "./onboardingUtils";

interface ProfileReviewFormProps {
  resume: ResumeEntity;
  onConfirmed: (updatedResume: ResumeEntity) => void;
  onBack?: () => void;
}

const DEFAULT_CATEGORIES = [
  "Languages",
  "Frameworks",
  "Cloud & DevOps",
  "Databases",
  "Tools",
  "General",
];

export function ProfileReviewForm({
  resume,
  onConfirmed,
  onBack,
}: ProfileReviewFormProps) {
  const initialData: ParsedProfile = resume.verifiedProfile ??
    resume.parsedProfile ?? {
      name: "",
      email: "",
      phone: "",
      location: "",
      summary: "",
      links: [],
      skills: [],
      experience: [],
      education: [],
      projects: [],
      certifications: [],
      languages: [],
    };

  const draftKey = `jobpilot_profile_draft_${resume._id}`;

  const [profile, setProfile] = useState<ParsedProfile>(() => {
    try {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft) as ParsedProfile;
        const hasDraftContent =
          (parsed.skills && parsed.skills.length > 0) ||
          (parsed.experience && parsed.experience.length > 0) ||
          (parsed.education && parsed.education.length > 0);
        const hasInitialContent =
          (initialData.skills && initialData.skills.length > 0) ||
          (initialData.experience && initialData.experience.length > 0) ||
          (initialData.education && initialData.education.length > 0);

        // Do not let an empty stale draft override real parsed initialData
        if (hasDraftContent || !hasInitialContent) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return initialData;
  });

  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillCategory, setNewSkillCategory] = useState("Languages");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const confidences =
    resume.fieldConfidences ??
    (resume.parsedProfile?.field_confidence as
      Record<string, number> | undefined);
  const warnings = resume.warnings ?? [];

  const patchMutation = usePatchResumeMutation();

  // Re-initialise form when parsed profile loads or updates (e.g. after fetch resolves)
  useEffect(() => {
    const freshProfile = resume.verifiedProfile ?? resume.parsedProfile;
    if (freshProfile) {
      setProfile((prev) => {
        const prevHasContent =
          (prev.skills && prev.skills.length > 0) ||
          (prev.experience && prev.experience.length > 0) ||
          (prev.education && prev.education.length > 0);
        const freshHasContent =
          (freshProfile.skills && freshProfile.skills.length > 0) ||
          (freshProfile.experience && freshProfile.experience.length > 0) ||
          (freshProfile.education && freshProfile.education.length > 0);

        // If local state was empty or incoming server profile has populated content, re-initialize
        if (!prevHasContent || freshHasContent) {
          return {
            ...freshProfile,
            skills: freshProfile.skills ?? [],
            experience: freshProfile.experience ?? [],
            education: freshProfile.education ?? [],
            projects: freshProfile.projects ?? [],
            certifications: freshProfile.certifications ?? [],
            languages: freshProfile.languages ?? [],
          };
        }
        return prev;
      });
    }
  }, [resume._id, resume.parsedProfile, resume.verifiedProfile]);

  // Autosave to localStorage on form changes
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(profile));
      const now = new Date();
      setLastSaved(
        now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    } catch {
      // ignore
    }
  }, [profile, draftKey]);

  // Skill management
  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim()) return;

    const newSkill: ProfileSkill = {
      name: newSkillName.trim(),
      category: newSkillCategory,
    };

    setProfile((prev) => ({
      ...prev,
      skills: [...(prev.skills ?? []), newSkill],
    }));

    setNewSkillName("");
  };

  const handleRemoveSkill = (skillIndex: number) => {
    setProfile((prev) => ({
      ...prev,
      skills: (prev.skills ?? []).filter((_, i) => i !== skillIndex),
    }));
  };

  // Links management
  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkUrl.trim()) return;
    setProfile((prev) => ({
      ...prev,
      links: [...(prev.links ?? []), newLinkUrl.trim()],
    }));
    setNewLinkUrl("");
  };

  const handleRemoveLink = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      links: (prev.links ?? []).filter((_, i) => i !== index),
    }));
  };

  // Experience management
  const handleAddExperience = () => {
    const newExp: WorkExperience = {
      company: "Company Name",
      title: "Job Title",
      start: "",
      end: "Present",
      bullets: ["Led engineering initiatives and delivered features."],
    };
    setProfile((prev) => ({
      ...prev,
      experience: [newExp, ...(prev.experience ?? [])],
    }));
  };

  const handleUpdateExperience = (
    index: number,
    patch: Partial<WorkExperience>,
  ) => {
    setProfile((prev) => {
      const exp = [...(prev.experience ?? [])];
      exp[index] = { ...exp[index], ...patch };
      return { ...prev, experience: exp };
    });
  };

  const handleRemoveExperience = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      experience: (prev.experience ?? []).filter((_, i) => i !== index),
    }));
  };

  const handleAddBullet = (expIndex: number) => {
    const exp = [...(profile.experience ?? [])];
    const target = exp[expIndex];
    if (!target) return;
    target.bullets = [
      ...(target.bullets ?? []),
      "New achievement bullet point",
    ];
    setProfile({ ...profile, experience: exp });
  };

  const handleUpdateBullet = (
    expIndex: number,
    bulletIndex: number,
    text: string,
  ) => {
    const exp = [...(profile.experience ?? [])];
    const target = exp[expIndex];
    if (!target) return;
    const bullets = [...(target.bullets ?? [])];
    bullets[bulletIndex] = text;
    target.bullets = bullets;
    setProfile({ ...profile, experience: exp });
  };

  const handleRemoveBullet = (expIndex: number, bulletIndex: number) => {
    const exp = [...(profile.experience ?? [])];
    const target = exp[expIndex];
    if (!target) return;
    target.bullets = (target.bullets ?? []).filter((_, i) => i !== bulletIndex);
    setProfile({ ...profile, experience: exp });
  };

  // Education management
  const handleAddEducation = () => {
    const newEdu: Education = {
      institution: "University / College",
      degree: "B.S. in Computer Science",
      field_of_study: "Computer Science",
      end: String(new Date().getFullYear()),
    };
    setProfile((prev) => ({
      ...prev,
      education: [newEdu, ...(prev.education ?? [])],
    }));
  };

  const handleUpdateEducation = (index: number, patch: Partial<Education>) => {
    setProfile((prev) => {
      const edu = [...(prev.education ?? [])];
      edu[index] = { ...edu[index], ...patch };
      return { ...prev, education: edu };
    });
  };

  const handleRemoveEducation = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      education: (prev.education ?? []).filter((_, i) => i !== index),
    }));
  };

  // Projects management
  const handleAddProject = () => {
    const newProj: Project = {
      name: "Project Name",
      description: "Description of the project and impact.",
      technologies: ["React", "TypeScript", "Node.js"],
      url: "",
    };
    setProfile((prev) => ({
      ...prev,
      projects: [newProj, ...(prev.projects ?? [])],
    }));
  };

  const handleUpdateProject = (index: number, patch: Partial<Project>) => {
    setProfile((prev) => {
      const proj = [...(prev.projects ?? [])];
      proj[index] = { ...proj[index], ...patch };
      return { ...prev, projects: proj };
    });
  };

  const handleRemoveProject = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      projects: (prev.projects ?? []).filter((_, i) => i !== index),
    }));
  };

  // Certifications management
  const handleAddCertification = () => {
    const newCert: Certification = {
      name: "Certification Name",
      issuer: "Issuing Organization",
      date: new Date().toISOString().slice(0, 10),
    };
    setProfile((prev) => ({
      ...prev,
      certifications: [newCert, ...(prev.certifications ?? [])],
    }));
  };

  const handleUpdateCertification = (
    index: number,
    patch: Partial<Certification>,
  ) => {
    setProfile((prev) => {
      const cert = [...(prev.certifications ?? [])];
      cert[index] = { ...cert[index], ...patch };
      return { ...prev, certifications: cert };
    });
  };

  const handleRemoveCertification = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      certifications: (prev.certifications ?? []).filter((_, i) => i !== index),
    }));
  };

  // Languages management
  const handleAddLanguage = () => {
    const newLang: LanguageProficiency = {
      language: "Language",
      proficiency: "fluent",
    };
    setProfile((prev) => ({
      ...prev,
      languages: [...(prev.languages ?? []), newLang],
    }));
  };

  const handleUpdateLanguage = (
    index: number,
    patch: Partial<LanguageProficiency>,
  ) => {
    setProfile((prev) => {
      const langs = [...(prev.languages ?? [])];
      langs[index] = { ...langs[index], ...patch };
      return { ...prev, languages: langs };
    });
  };

  const handleRemoveLanguage = (index: number) => {
    setProfile((prev) => ({
      ...prev,
      languages: (prev.languages ?? []).filter((_, i) => i !== index),
    }));
  };

  // Submit & Confirm
  const handleConfirmProfile = async () => {
    setValidationError(null);

    if (!profile.name.trim()) {
      setValidationError("Candidate name is required.");
      return;
    }

    try {
      const updatedResume = await patchMutation.mutateAsync({
        id: resume._id,
        profile,
      });

      try {
        localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }

      toast.success(
        "Profile verified and saved successfully!",
        "Profile Confirmed",
      );
      onConfirmed(updatedResume);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to confirm profile.";
      setValidationError(msg);
    }
  };

  const isSaving = patchMutation.isPending;

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      {/* Top Header & Autosave Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Review & Verify Profile
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Check the extracted fields below. Low-confidence fields are marked
            for your review.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Save className="h-3.5 w-3.5 text-emerald-500" />
              Draft saved at {lastSaved}
            </span>
          )}
          {onBack && (
            <Button variant="outline" size="sm" onClick={onBack}>
              Upload Different File
            </Button>
          )}
        </div>
      </div>

      {/* Parser Warnings Banner */}
      {warnings.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Parser Notices</p>
              <ul className="text-xs space-y-0.5 list-disc pl-4 text-amber-800 dark:text-amber-300">
                {warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {validationError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {validationError}
        </div>
      )}

      {/* Section 1: Basic Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Contact Information</CardTitle>
            {isFieldLowConfidence("name", confidences) && (
              <span
                data-testid="low-confidence-badge"
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
              >
                Please check
              </span>
            )}
          </div>
          <CardDescription>Your name and contact details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-name">Full Name *</Label>
                {isFieldLowConfidence("name", confidences) && (
                  <span
                    data-testid="low-confidence-badge"
                    className="text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                  >
                    Please check
                  </span>
                )}
              </div>
              <Input
                id="profile-name"
                value={profile.name}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
                placeholder="Jane Doe"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-email">Email</Label>
                {isFieldLowConfidence("email", confidences) && (
                  <span
                    data-testid="low-confidence-badge"
                    className="text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                  >
                    Please check
                  </span>
                )}
              </div>
              <Input
                id="profile-email"
                type="email"
                value={profile.email ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, email: e.target.value })
                }
                placeholder="jane@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-phone">Phone</Label>
                {isFieldLowConfidence("phone", confidences) && (
                  <span
                    data-testid="low-confidence-badge"
                    className="text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                  >
                    Please check
                  </span>
                )}
              </div>
              <Input
                id="profile-phone"
                value={profile.phone ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, phone: e.target.value })
                }
                placeholder="+1 (555) 019-2834"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-location">Location</Label>
                {isFieldLowConfidence("location", confidences) && (
                  <span
                    data-testid="low-confidence-badge"
                    className="text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                  >
                    Please check
                  </span>
                )}
              </div>
              <Input
                id="profile-location"
                value={profile.location ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, location: e.target.value })
                }
                placeholder="San Francisco, CA"
              />
            </div>
          </div>

          {/* Links chips */}
          <div className="space-y-2 pt-2">
            <Label>Portfolio & Profile Links</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(profile.links ?? []).map((link, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="gap-1.5 py-1 px-2.5 text-xs font-normal"
                >
                  <span className="truncate max-w-[200px]">{link}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveLink(idx)}
                    className="rounded hover:text-destructive"
                    aria-label={`Remove link ${link}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="https://github.com/username or linkedin.com/in/username"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                className="text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddLink}
              >
                Add Link
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Professional Summary</CardTitle>
            {isFieldLowConfidence("summary", confidences) && (
              <span
                data-testid="low-confidence-badge"
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
              >
                Please check
              </span>
            )}
          </div>
          <CardDescription>
            A concise overview of your background and core competencies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            rows={4}
            className="flex w-full rounded-md border border-input bg-background p-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={profile.summary}
            onChange={(e) =>
              setProfile({ ...profile, summary: e.target.value })
            }
            placeholder="Write your professional summary…"
          />
        </CardContent>
      </Card>

      {/* Section 3: Skills as Editable Chips with Category */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Skills & Technologies
              </CardTitle>
              <CardDescription>
                Categorized skill chips extracted from your experience.
              </CardDescription>
            </div>
            {isFieldLowConfidence("skills", confidences) && (
              <span
                data-testid="low-confidence-badge"
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
              >
                Please check
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Display skills by category */}
          <div className="space-y-4">
            {DEFAULT_CATEGORIES.map((cat) => {
              const categorySkills = (profile.skills ?? []).filter(
                (s) =>
                  (s.category || "General").toLowerCase() === cat.toLowerCase(),
              );
              if (categorySkills.length === 0) return null;

              return (
                <div key={cat} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {cat}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {categorySkills.map((skill) => {
                      const globalIdx = (profile.skills ?? []).findIndex(
                        (s) =>
                          s.name === skill.name &&
                          s.category === skill.category,
                      );
                      return (
                        <span
                          key={skill.name}
                          className="inline-flex items-center gap-1.5 rounded-lg border bg-secondary/50 px-2.5 py-1 text-xs font-medium text-foreground transition-all hover:border-primary/40"
                        >
                          <span>{skill.name}</span>
                          {typeof skill.years === "number" && (
                            <span className="text-[10px] text-muted-foreground">
                              {skill.years}y
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveSkill(globalIdx)}
                            className="rounded p-0.5 hover:text-destructive transition-colors"
                            aria-label={`Remove skill ${skill.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add new skill inline */}
          <form
            onSubmit={handleAddSkill}
            className="flex flex-wrap items-center gap-2 pt-2 border-t"
          >
            <Input
              placeholder="Add skill (e.g. Python, Docker, PyTorch)"
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              className="flex-1 min-w-[200px] text-xs h-9"
            />
            <select
              value={newSkillCategory}
              onChange={(e) => setNewSkillCategory(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-xs"
            >
              {DEFAULT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              className="gap-1 h-9"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Skill
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Section 4: Work Experience */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                Work Experience
              </CardTitle>
              <CardDescription>
                Repeatable cards for employment history and achievements.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isFieldLowConfidence("experience", confidences) && (
                <span
                  data-testid="low-confidence-badge"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
                >
                  Please check
                </span>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddExperience}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Position
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(profile.experience ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              No work experience extracted. Click &quot;Add Position&quot; to
              add one.
            </p>
          ) : (
            (profile.experience ?? []).map((exp, expIdx) => (
              <div
                key={expIdx}
                className="rounded-xl border bg-card/60 p-4 space-y-3 relative group"
              >
                <button
                  type="button"
                  onClick={() => handleRemoveExperience(expIdx)}
                  aria-label={`Remove experience at ${exp.company}`}
                  className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-destructive rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <div className="grid gap-3 sm:grid-cols-2 pr-8">
                  <div className="space-y-1">
                    <Label className="text-xs">Job Title *</Label>
                    <Input
                      value={exp.title}
                      onChange={(e) =>
                        handleUpdateExperience(expIdx, {
                          title: e.target.value,
                        })
                      }
                      placeholder="e.g. Senior Software Engineer"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Company *</Label>
                    <Input
                      value={exp.company}
                      onChange={(e) =>
                        handleUpdateExperience(expIdx, {
                          company: e.target.value,
                        })
                      }
                      placeholder="e.g. Acme Corp"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Start Date</Label>
                    <Input
                      value={exp.start ?? ""}
                      onChange={(e) =>
                        handleUpdateExperience(expIdx, {
                          start: e.target.value,
                        })
                      }
                      placeholder="e.g. 2021-06"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End Date</Label>
                    <Input
                      value={exp.end ?? ""}
                      onChange={(e) =>
                        handleUpdateExperience(expIdx, { end: e.target.value })
                      }
                      placeholder="e.g. Present"
                      className="text-xs h-8"
                    />
                  </div>
                </div>

                {/* Bullets */}
                <div className="space-y-2 pt-1 border-t">
                  <Label className="text-xs text-muted-foreground">
                    Key Contributions & Bullets
                  </Label>
                  <div className="space-y-1.5">
                    {(exp.bullets ?? []).map((bullet, bulletIdx) => (
                      <div key={bulletIdx} className="flex items-center gap-2">
                        <span className="text-xs text-primary font-bold">
                          •
                        </span>
                        <Input
                          value={bullet}
                          onChange={(e) =>
                            handleUpdateBullet(
                              expIdx,
                              bulletIdx,
                              e.target.value,
                            )
                          }
                          className="text-xs h-8 flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveBullet(expIdx, bulletIdx)}
                          className="text-muted-foreground hover:text-destructive p-1 rounded"
                          aria-label="Remove bullet point"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddBullet(expIdx)}
                    className="text-xs text-primary gap-1 h-7"
                  >
                    <Plus className="h-3 w-3" />
                    Add Bullet
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Section 5: Education */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                Education
              </CardTitle>
              <CardDescription>
                Degrees, universities, and academic background.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isFieldLowConfidence("education", confidences) && (
                <span
                  data-testid="low-confidence-badge"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
                >
                  Please check
                </span>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddEducation}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Education
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(profile.education ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              No education records extracted.
            </p>
          ) : (
            (profile.education ?? []).map((edu, eduIdx) => (
              <div
                key={eduIdx}
                className="rounded-xl border bg-card/60 p-4 space-y-3 relative"
              >
                <button
                  type="button"
                  onClick={() => handleRemoveEducation(eduIdx)}
                  aria-label={`Remove education ${edu.degree}`}
                  className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-destructive rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <div className="grid gap-3 sm:grid-cols-2 pr-8">
                  <div className="space-y-1">
                    <Label className="text-xs">Degree *</Label>
                    <Input
                      value={edu.degree}
                      onChange={(e) =>
                        handleUpdateEducation(eduIdx, {
                          degree: e.target.value,
                        })
                      }
                      placeholder="e.g. B.S. in Computer Science"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Institution *</Label>
                    <Input
                      value={edu.institution}
                      onChange={(e) =>
                        handleUpdateEducation(eduIdx, {
                          institution: e.target.value,
                        })
                      }
                      placeholder="e.g. UC Berkeley"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Field of Study</Label>
                    <Input
                      value={
                        edu.field_of_study ??
                        (edu as { fieldOfStudy?: string }).fieldOfStudy ??
                        ""
                      }
                      onChange={(e) =>
                        handleUpdateEducation(eduIdx, {
                          field_of_study: e.target.value,
                        })
                      }
                      placeholder="e.g. Artificial Intelligence"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Graduation / End Date</Label>
                    <Input
                      value={edu.end ?? ""}
                      onChange={(e) =>
                        handleUpdateEducation(eduIdx, { end: e.target.value })
                      }
                      placeholder="e.g. 2022"
                      className="text-xs h-8"
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Section 6: Projects */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                Featured Projects
              </CardTitle>
              <CardDescription>
                Technical projects, open source, and portfolio work.
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleAddProject}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Project
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(profile.projects ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-2">
              No projects added yet.
            </p>
          ) : (
            (profile.projects ?? []).map((proj, projIdx) => (
              <div
                key={projIdx}
                className="rounded-xl border bg-card/60 p-4 space-y-3 relative"
              >
                <button
                  type="button"
                  onClick={() => handleRemoveProject(projIdx)}
                  aria-label={`Remove project ${proj.name}`}
                  className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-destructive rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <div className="grid gap-3 sm:grid-cols-2 pr-8">
                  <div className="space-y-1">
                    <Label className="text-xs">Project Name *</Label>
                    <Input
                      value={proj.name}
                      onChange={(e) =>
                        handleUpdateProject(projIdx, { name: e.target.value })
                      }
                      placeholder="e.g. AI Search Engine"
                      className="text-xs h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Link / Repository URL</Label>
                    <Input
                      value={proj.url ?? ""}
                      onChange={(e) =>
                        handleUpdateProject(projIdx, { url: e.target.value })
                      }
                      placeholder="https://github.com/..."
                      className="text-xs h-8"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <textarea
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-background p-2 text-xs"
                    value={proj.description}
                    onChange={(e) =>
                      handleUpdateProject(projIdx, {
                        description: e.target.value,
                      })
                    }
                    placeholder="Project overview and measurable outcomes…"
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Section 7: Certifications & Languages */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" />
                Certifications
              </CardTitle>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleAddCertification}
                className="text-xs gap-1 h-7"
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(profile.certifications ?? []).map((cert, cIdx) => (
              <div key={cIdx} className="flex items-center gap-2 border-b pb-2">
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="Certification Name"
                    value={cert.name}
                    onChange={(e) =>
                      handleUpdateCertification(cIdx, { name: e.target.value })
                    }
                    className="text-xs h-7"
                  />
                  <Input
                    placeholder="Issuer (e.g. AWS, Google)"
                    value={cert.issuer ?? ""}
                    onChange={(e) =>
                      handleUpdateCertification(cIdx, {
                        issuer: e.target.value,
                      })
                    }
                    className="text-xs h-7"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveCertification(cIdx)}
                  className="text-muted-foreground hover:text-destructive p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Languages className="h-4 w-4 text-primary" />
                Languages
              </CardTitle>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleAddLanguage}
                className="text-xs gap-1 h-7"
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(profile.languages ?? []).map((lang, lIdx) => (
              <div key={lIdx} className="flex items-center gap-2 border-b pb-2">
                <Input
                  placeholder="Language"
                  value={lang.language}
                  onChange={(e) =>
                    handleUpdateLanguage(lIdx, { language: e.target.value })
                  }
                  className="text-xs h-7 flex-1"
                />
                <select
                  value={lang.proficiency}
                  onChange={(e) =>
                    handleUpdateLanguage(lIdx, { proficiency: e.target.value })
                  }
                  className="text-xs h-7 rounded border bg-background px-2"
                >
                  <option value="native">Native</option>
                  <option value="fluent">Fluent</option>
                  <option value="professional">Professional</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="basic">Basic</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleRemoveLanguage(lIdx)}
                  className="text-muted-foreground hover:text-destructive p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
        <p className="text-xs text-muted-foreground">
          Confirming locks this verified profile as the source of truth for all
          job matches and tailoring.
        </p>

        <Button
          type="button"
          onClick={handleConfirmProfile}
          disabled={isSaving}
          size="lg"
          className="w-full sm:w-auto gap-2"
        >
          {isSaving ? (
            <>Saving…</>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Confirm Profile & Continue
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
