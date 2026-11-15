import axios from "axios";
import { Briefcase, DollarSign, Filter, Globe, MapPin, Plus, Search, X } from "lucide-react";
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateSearchMutation } from "@/hooks/useApi";
import { toast } from "@/stores/toastStore";
import type { ParsedProfile } from "@jobpilot/shared";

interface JobPreferencesStepProps {
  verifiedProfile?: ParsedProfile;
  onSearchStarted: (searchId: string) => void;
  onBack?: () => void;
}

const SENIORITY_LEVELS = [
  "Entry-level / Junior",
  "Mid-level",
  "Senior",
  "Staff / Principal",
  "Engineering Lead / Manager",
];

export function JobPreferencesStep({
  verifiedProfile,
  onSearchStarted,
  onBack,
}: JobPreferencesStepProps) {
  // Prepopulate initial suggested roles based on parsed titles if available
  const defaultRoles = verifiedProfile?.experience?.[0]?.title
    ? [verifiedProfile.experience[0].title]
    : ["Full-Stack Engineer", "AI Engineer"];

  const defaultLocations = verifiedProfile?.location
    ? [verifiedProfile.location, "Remote"]
    : ["Remote"];

  const [roles, setRoles] = useState<string[]>(defaultRoles);
  const [roleInput, setRoleInput] = useState("");

  const [locations, setLocations] = useState<string[]>(defaultLocations);
  const [locationInput, setLocationInput] = useState("");

  const [remoteOnly, setRemoteOnly] = useState(false);
  const [seniority, setSeniority] = useState("Senior");
  const [salaryMin, setSalaryMin] = useState<number | "">(120000);
  const [salaryMax, setSalaryMax] = useState<number | "">(190000);

  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [excludedInput, setExcludedInput] = useState("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createSearchMutation = useCreateSearchMutation();

  // Add / remove roles
  const handleAddRole = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!roleInput.trim()) return;
    if (!roles.includes(roleInput.trim())) {
      setRoles([...roles, roleInput.trim()]);
    }
    setRoleInput("");
  };

  const handleRemoveRole = (role: string) => {
    setRoles(roles.filter((r) => r !== role));
  };

  // Add / remove locations
  const handleAddLocation = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!locationInput.trim()) return;
    if (!locations.includes(locationInput.trim())) {
      setLocations([...locations, locationInput.trim()]);
    }
    setLocationInput("");
  };

  const handleRemoveLocation = (loc: string) => {
    setLocations(locations.filter((l) => l !== loc));
  };

  // Add / remove excluded keywords
  const handleAddExcluded = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!excludedInput.trim()) return;
    if (!excludedKeywords.includes(excludedInput.trim())) {
      setExcludedKeywords([...excludedKeywords, excludedInput.trim()]);
    }
    setExcludedInput("");
  };

  const handleRemoveExcluded = (kw: string) => {
    setExcludedKeywords(excludedKeywords.filter((k) => k !== kw));
  };

  const handleStartSearch = async () => {
    setErrorMsg(null);

    if (roles.length === 0) {
      setErrorMsg("Please add at least one target job role or title.");
      return;
    }

    try {
      const searchKeywords = roles.join(", ");
      const searchLocation = locations.join(", ");

      const result = await createSearchMutation.mutateAsync({
        keywords: searchKeywords,
        query: searchKeywords,
        location: searchLocation || undefined,
        remoteOnly,
        seniority,
      });

      const searchId = result?._id || "latest";

      // Save preferences locally
      try {
        localStorage.setItem(
          "jobpilot_job_preferences",
          JSON.stringify({
            roles,
            locations,
            remoteOnly,
            seniority,
            salaryMin,
            salaryMax,
            excludedKeywords,
          }),
        );
      } catch {
        // ignore
      }

      toast.success("Job discovery initiated!", "Search started");
      onSearchStarted(searchId);
    } catch (err: unknown) {
      let msg = "Failed to start job search.";
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as
          | { error?: { message?: string }; message?: string }
          | undefined;
        msg = data?.error?.message || data?.message || err.message || msg;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setErrorMsg(msg);
    }
  };

  const isSearching = createSearchMutation.isPending;

  return (
    <Card className="max-w-2xl mx-auto shadow-lg border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Filter className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-xl">Set Job Preferences</CardTitle>
            <CardDescription>
              Tell JobPilot which positions to match and rank for you.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {errorMsg && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            {errorMsg}
          </div>
        )}

        {/* Roles input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="roles-input" className="flex items-center gap-1.5 text-sm">
              <Briefcase className="h-4 w-4 text-primary" />
              Target Job Roles / Keywords *
            </Label>
            <span className="text-[11px] text-muted-foreground">Press Enter or click Add</span>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-2">
            {roles.map((role) => (
              <Badge key={role} variant="secondary" className="gap-1 py-1 px-2.5 text-xs">
                <span>{role}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveRole(role)}
                  className="rounded hover:text-destructive"
                  aria-label={`Remove role ${role}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              id="roles-input"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddRole())}
              placeholder="e.g. AI Engineer, Staff Frontend Developer"
              className="text-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => handleAddRole()}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>

        {/* Locations & Remote Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="locations-input" className="flex items-center gap-1.5 text-sm">
              <MapPin className="h-4 w-4 text-primary" />
              Preferred Locations
            </Label>
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remoteOnly}
                onChange={(e) => setRemoteOnly(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span className="flex items-center gap-1 text-muted-foreground font-medium">
                <Globe className="h-3.5 w-3.5 text-emerald-500" />
                Remote Only
              </span>
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-2">
            {locations.map((loc) => (
              <Badge key={loc} variant="outline" className="gap-1 py-1 px-2.5 text-xs">
                <span>{loc}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveLocation(loc)}
                  className="rounded hover:text-destructive"
                  aria-label={`Remove location ${loc}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              id="locations-input"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddLocation())}
              placeholder="e.g. San Francisco, CA or Hybrid"
              className="text-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => handleAddLocation()}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </div>

        {/* Seniority */}
        <div className="space-y-2">
          <Label htmlFor="seniority-select" className="text-sm">Seniority Level</Label>
          <select
            id="seniority-select"
            value={seniority}
            onChange={(e) => setSeniority(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
          >
            {SENIORITY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        {/* Salary Range */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <DollarSign className="h-4 w-4 text-primary" />
            Target Annual Salary Range (USD)
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[11px] text-muted-foreground">Minimum</span>
              <Input
                type="number"
                step={5000}
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value ? Number(e.target.value) : "")}
                placeholder="120000"
                className="text-xs"
              />
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground">Maximum</span>
              <Input
                type="number"
                step={5000}
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value ? Number(e.target.value) : "")}
                placeholder="200000"
                className="text-xs"
              />
            </div>
          </div>
        </div>

        {/* Excluded Keywords */}
        <div className="space-y-2 pt-2 border-t">
          <Label htmlFor="excluded-input" className="text-xs text-muted-foreground">
            Excluded Keywords (Jobs with these terms will be deprioritized)
          </Label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {excludedKeywords.map((kw) => (
              <Badge key={kw} variant="destructive" className="gap-1 py-0.5 px-2 text-[11px]">
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveExcluded(kw)}
                  className="rounded hover:opacity-80"
                  aria-label={`Remove excluded keyword ${kw}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              id="excluded-input"
              value={excludedInput}
              onChange={(e) => setExcludedInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddExcluded())}
              placeholder="e.g. PHP, Crypto, On-call"
              className="text-xs h-8"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => handleAddExcluded()} className="h-8 text-xs">
              Add
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t gap-3">
          {onBack ? (
            <Button type="button" variant="outline" onClick={onBack}>
              Back to Profile Review
            </Button>
          ) : <div />}

          <Button
            type="button"
            size="lg"
            onClick={handleStartSearch}
            disabled={isSearching}
            className="gap-2"
          >
            {isSearching ? (
              <>Starting Search…</>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Find Jobs
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
