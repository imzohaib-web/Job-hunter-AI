import { z } from "zod";

export const createSearchSchema = z
  .object({
    keywords: z.string().trim().optional(),
    query: z.string().trim().optional(),
    location: z.string().trim().optional(),
    remoteOnly: z.boolean().optional().default(false),
    seniority: z.string().trim().optional(),
    sources: z.array(z.string()).optional(),
  })
  .refine(
    (data) =>
      Boolean((data.keywords && data.keywords.length > 0) || (data.query && data.query.length > 0)),
    {
      message: "Keywords are required",
      path: ["keywords"],
    },
  );

export type CreateSearchInput = z.infer<typeof createSearchSchema>;

export const matchesQuerySchema = z.object({
  searchId: z.string().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  remote: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  sort: z
    .enum(["score_desc", "score_asc", "date_desc", "date_asc"])
    .default("score_desc"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export type MatchesQueryParams = z.infer<typeof matchesQuerySchema>;
