import { z } from "zod";

export const createApplicationSchema = z
  .object({
    matchId: z.string().optional(),
    jobId: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => data.matchId || data.jobId, {
    message: "Either matchId or jobId must be provided",
  });

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const updateApplicationSchema = z.object({
  status: z.enum(["saved", "applied", "interview", "offer", "rejected"]).optional(),
  notes: z.string().optional(),
  order: z.number().int().optional(),
  note: z.string().optional(),
});

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
