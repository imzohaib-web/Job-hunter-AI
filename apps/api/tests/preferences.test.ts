import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  getPreferences,
  updatePreferences,
  savePreset,
  deletePreset,
  getSourceStatuses,
} from "../src/controllers/preferenceController.js";
import { DEFAULT_PREFERENCES, Preference } from "../src/models/Preference.js";
import { aiClient } from "../src/services/aiClient.js";

vi.mock("../src/models/Preference.js", () => {
  const mockModel: any = {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    create: vi.fn(),
  };
  return {
    Preference: mockModel,
    DEFAULT_PREFERENCES: {
      targetTitles: [],
      employmentTypes: ["full-time"],
      experienceLevels: ["mid", "senior"],
      workModes: ["remote", "hybrid"],
      locations: [],
      openToRelocation: false,
      remoteWorldwide: false,
      visaSponsorshipNeeded: false,
      preferredCountries: [],
      salary: {
        currency: "USD",
        period: "yearly",
        hideWithoutSalary: false,
      },
      mustHaveSkills: [],
      niceToHaveSkills: [],
      industries: [],
      companySizes: [],
      datePosted: "all",
      excludedKeywords: [],
      excludedCompanies: [],
      roleFamilies: ["software"],
      alsoShowOtherRoles: true,
      sources: ["remotive", "arbeitnow"],
    },
  };
});

vi.mock("../src/services/aiClient.js", () => ({
  aiClient: {
    get: vi.fn(),
  },
}));

function createMockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: any; json: any };
}

describe("Preference Controller Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPreferences", () => {
    it("returns existing preferences if found", async () => {
      const mockDoc = {
        userId: "user-123",
        preferences: { ...DEFAULT_PREFERENCES, targetTitles: ["Frontend Engineer"] },
        presets: [],
        activePresetId: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      };
      (Preference.findOne as any).mockResolvedValue(mockDoc);

      const req = { user: { id: "user-123" } } as unknown as Request;
      const res = createMockRes();

      await getPreferences(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-123",
          preferences: expect.objectContaining({ targetTitles: ["Frontend Engineer"] }),
        }),
      });
    });

    it("creates and returns defaults if user has no preferences document", async () => {
      (Preference.findOne as any).mockResolvedValue(null);
      const createdDoc = {
        userId: "user-456",
        preferences: DEFAULT_PREFERENCES,
        presets: [],
        activePresetId: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      };
      (Preference.create as any).mockResolvedValue(createdDoc);

      const req = { user: { id: "user-456" } } as unknown as Request;
      const res = createMockRes();

      await getPreferences(req, res);

      expect(Preference.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-456",
          presets: [],
        }),
      });
    });
  });

  describe("updatePreferences", () => {
    it("updates preferences and returns updated document", async () => {
      const updatedDoc = {
        userId: "user-123",
        preferences: { ...DEFAULT_PREFERENCES, targetTitles: ["Backend Lead"] },
        presets: [],
        activePresetId: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      };
      (Preference.findOneAndUpdate as any).mockResolvedValue(updatedDoc);

      const req = {
        user: { id: "user-123" },
        body: {
          preferences: { ...DEFAULT_PREFERENCES, targetTitles: ["Backend Lead"] },
        },
      } as unknown as Request;
      const res = createMockRes();

      await updatePreferences(req, res);

      expect(Preference.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: "user-123" },
        expect.any(Object),
        expect.any(Object),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: expect.objectContaining({
          preferences: expect.objectContaining({ targetTitles: ["Backend Lead"] }),
        }),
      });
    });
  });

  describe("savePreset and deletePreset", () => {
    it("saves a new preset on existing document", async () => {
      const existingDoc = {
        userId: "user-123",
        preferences: DEFAULT_PREFERENCES,
        presets: [] as any[],
        activePresetId: null as string | null,
        save: vi.fn().mockResolvedValue(true),
      };
      (Preference.findOne as any).mockResolvedValue(existingDoc);

      const req = {
        user: { id: "user-123" },
        body: {
          name: "Remote AI Roles",
          preferences: { ...DEFAULT_PREFERENCES, targetTitles: ["AI Engineer"] },
        },
      } as unknown as Request;
      const res = createMockRes();

      await savePreset(req, res);

      expect(existingDoc.presets).toHaveLength(1);
      expect(existingDoc.presets[0].name).toBe("Remote AI Roles");
      expect(existingDoc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "Remote AI Roles" }),
        }),
      );
    });

    it("deletes a preset by id", async () => {
      const existingDoc = {
        userId: "user-123",
        presets: [{ id: "preset-to-del", name: "Preset 1" }],
        activePresetId: "preset-to-del",
        save: vi.fn().mockResolvedValue(true),
      };
      (Preference.findOne as any).mockResolvedValue(existingDoc);

      const req = {
        user: { id: "user-123" },
        params: { presetId: "preset-to-del" },
      } as unknown as Request;
      const res = createMockRes();

      await deletePreset(req, res);

      expect(existingDoc.presets).toHaveLength(0);
      expect(existingDoc.activePresetId).toBeNull();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("getSourceStatuses", () => {
    it("returns sources from aiClient if successful", async () => {
      (aiClient.get as any).mockResolvedValue({
        data: {
          sources: [
            { source: "remotive", name: "Remotive", available: true, supportedFilters: ["category"] },
          ],
        },
      });

      const req = {} as Request;
      const res = createMockRes();

      await getSourceStatuses(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ source: "remotive", available: true }),
        ],
      });
    });

    it("falls back gracefully if aiClient is down", async () => {
      (aiClient.get as any).mockRejectedValue(new Error("AI service connection refused"));

      const req = {} as Request;
      const res = createMockRes();

      await getSourceStatuses(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ source: "remotive" }),
          expect.objectContaining({ source: "arbeitnow" }),
        ]),
      });
    });
  });
});
