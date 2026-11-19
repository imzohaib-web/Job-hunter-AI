import { z } from "zod";

export const approveChangesSchema = z.object({
  approvedChangeIds: z.array(z.string()).optional(),
  decisions: z
    .array(
      z.object({
        changeId: z.string().optional(),
        id: z.string().optional(),
        section: z.string().optional(),
        index: z.number().int().optional(),
        accepted: z.boolean(),
      }),
    )
    .optional(),
});

export type ApproveChangesInput = z.infer<typeof approveChangesSchema>;

export const exportArtifactQuerySchema = z.object({
  format: z.enum(["docx", "pdf"]).default("docx"),
});

export type ExportArtifactQuery = z.infer<typeof exportArtifactQuerySchema>;
