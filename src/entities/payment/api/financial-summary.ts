import { z } from "zod";
import { projectStatusSchema } from "@/entities/project/schemas/project.schema";

export const financialSummaryQuerySchema = z.object({
  status: z.union([projectStatusSchema, z.enum(["active", "all"])]).default("active"),
}).strict();

const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const financialSummarySchema = z.object({
  asOf: z.iso.datetime({ offset: true }),
  status: financialSummaryQuerySchema.shape.status,
  includedStatuses: z.array(projectStatusSchema),
  projectCount: amount,
  expectedRevenue: amount,
  confirmedRevenue: amount,
  receivedTotal: amount,
  outstanding: amount,
});

export type AdminFinancialSummaryResponse = z.infer<typeof financialSummarySchema>;
