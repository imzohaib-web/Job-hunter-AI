import { describe, expect, it } from "vitest";
import {
  jobPreferencesSchema,
  savePresetSchema,
  updatePreferencesSchema,
} from "../src/schemas/preferenceSchemas.js";
import { mapPreferencesToJobQuery } from "../src/services/preferenceMapper.js";

describe("Preference Schemas & Mapping", () => {
  describe("jobPreferencesSchema validation", () => {
    it("parses valid minimal empty preferences and populates defaults", () => {
      const parsed = jobPreferencesSchema.parse({});
      expect(parsed.targetTitles).toEqual([]);
      expect(parsed.employmentTypes).toEqual([]);
      expect(parsed.experienceLevels).toEqual([]);
      expect(parsed.workModes).toEqual([]);
      expect(parsed.locations).toEqual([]);
      expect(parsed.openToRelocation).toBe(false);
      expect(parsed.remoteWorldwide).toBe(false);
      expect(parsed.visaSponsorshipNeeded).toBe(false);
      expect(parsed.salary.currency).toBe("USD");
      expect(parsed.salary.period).toBe("yearly");
      expect(parsed.salary.hideWithoutSalary).toBe(false);
      expect(parsed.datePosted).toBe("all");
      expect(parsed.alsoShowOtherRoles).toBe(true);
    });

    it("parses full valid preferences object", () => {
      const fullInput = {
        targetTitles: ["Full-Stack Engineer", "Backend Developer"],
        employmentTypes: ["full-time", "contract"],
        experienceLevels: ["senior", "lead"],
        workModes: ["remote", "hybrid"],
        locations: [{ country: "Germany", city: "Berlin", label: "Berlin, Germany" }],
        openToRelocation: true,
        remoteWorldwide: true,
        visaSponsorshipNeeded: true,
        preferredCountries: ["Germany", "Netherlands"],
        salary: {
          currency: "EUR",
          minimum: "95000", // coercible to number
          period: "yearly",
          hideWithoutSalary: true,
        },
        mustHaveSkills: ["TypeScript", "Node.js"],
        niceToHaveSkills: ["AWS", "Docker"],
        industries: ["Fintech", "SaaS"],
        companySizes: ["mid", "large"],
        datePosted: "7d",
        excludedKeywords: ["Junior", "Intern"],
        excludedCompanies: ["SpamInc"],
        roleFamilies: ["software", "engineering"],
        alsoShowOtherRoles: false,
        sources: ["remotive", "arbeitnow", "adzuna"],
      };

      const parsed = jobPreferencesSchema.parse(fullInput);
      expect(parsed.targetTitles).toEqual(["Full-Stack Engineer", "Backend Developer"]);
      expect(parsed.employmentTypes).toEqual(["full-time", "contract"]);
      expect(parsed.salary.minimum).toBe(95000);
      expect(parsed.salary.currency).toBe("EUR");
      expect(parsed.datePosted).toBe("7d");
      expect(parsed.sources).toEqual(["remotive", "arbeitnow", "adzuna"]);
    });

    it("rejects invalid employment types and negative salary", () => {
      expect(() =>
        jobPreferencesSchema.parse({
          employmentTypes: ["invalid-type"],
        }),
      ).toThrow();

      expect(() =>
        jobPreferencesSchema.parse({
          salary: {
            minimum: -100,
          },
        }),
      ).toThrow();

      expect(() =>
        jobPreferencesSchema.parse({
          datePosted: "1year",
        }),
      ).toThrow();
    });
  });

  describe("updatePreferencesSchema and savePresetSchema", () => {
    it("validates updatePreferencesSchema with activePresetId", () => {
      const parsed = updatePreferencesSchema.parse({
        preferences: {
          targetTitles: ["DevOps Engineer"],
        },
        activePresetId: "preset-123",
      });

      expect(parsed.preferences.targetTitles).toEqual(["DevOps Engineer"]);
      expect(parsed.activePresetId).toBe("preset-123");
    });

    it("validates savePresetSchema requiring non-empty preset name", () => {
      const valid = savePresetSchema.parse({
        name: "Remote Python Jobs",
        preferences: { targetTitles: ["Python Developer"] },
      });
      expect(valid.name).toBe("Remote Python Jobs");

      expect(() =>
        savePresetSchema.parse({
          name: "   ",
          preferences: {},
        }),
      ).toThrow();
    });
  });

  describe("mapPreferencesToJobQuery mapping", () => {
    it("maps fallback query values when preferences are null or empty", () => {
      const mapped = mapPreferencesToJobQuery(
        "Frontend Engineer",
        {
          location: "San Francisco",
          remoteOnly: true,
          seniority: "senior",
          sources: ["remotive"],
        },
        null,
      );

      expect(mapped.query).toBe("Frontend Engineer");
      expect(mapped.target_titles).toEqual(["Frontend Engineer"]);
      expect(mapped.location).toBe("San Francisco");
      expect(mapped.remote_only).toBe(true);
      expect(mapped.seniority).toBe("senior");
      expect(mapped.sources).toEqual(["remotive"]);
      expect(mapped.salary_currency).toBe("USD");
      expect(mapped.salary_min).toBeUndefined();
    });

    it("maps rich preferences to query payload for AI service", () => {
      const prefs = {
        targetTitles: ["Full-Stack Engineer", "Software Engineer"],
        employmentTypes: ["full-time" as const],
        experienceLevels: ["mid" as const, "senior" as const],
        workModes: ["remote" as const],
        locations: [{ country: "United Kingdom", city: "London" }],
        openToRelocation: true,
        remoteWorldwide: true,
        visaSponsorshipNeeded: false,
        preferredCountries: ["United Kingdom"],
        salary: {
          currency: "GBP",
          minimum: 80000,
          period: "yearly" as const,
          hideWithoutSalary: true,
        },
        mustHaveSkills: ["React", "Node.js"],
        niceToHaveSkills: ["GraphQL"],
        industries: ["Fintech"],
        companySizes: ["startup" as const],
        datePosted: "3d" as const,
        excludedKeywords: ["PHP"],
        excludedCompanies: ["OldCorp"],
        roleFamilies: ["software"],
        alsoShowOtherRoles: false,
        sources: ["adzuna", "remotive"],
      };

      const mapped = mapPreferencesToJobQuery("Full-Stack Engineer", {}, prefs);

      expect(mapped.target_titles).toEqual(["Full-Stack Engineer", "Software Engineer"]);
      expect(mapped.employment_types).toEqual(["full-time"]);
      expect(mapped.experience_levels).toEqual(["mid", "senior"]);
      expect(mapped.work_modes).toEqual(["remote"]);
      expect(mapped.salary_min).toBe(80000);
      expect(mapped.salary_currency).toBe("GBP");
      expect(mapped.hide_without_salary).toBe(true);
      expect(mapped.must_have_skills).toEqual(["React", "Node.js"]);
      expect(mapped.excluded_keywords).toEqual(["PHP"]);
      expect(mapped.sources).toEqual(["adzuna", "remotive"]);
      expect(mapped.date_posted).toBe("3d");
    });
  });
});
