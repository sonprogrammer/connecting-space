import { z } from "zod";

export const projectIdSchema = z.uuid();

export const projectStatusSchema = z.enum([
  "planning",
  "in_progress",
  "review",
  "completed",
  "paused",
  "cancelled",
]);

export const createProjectSchema = z.object({
  customerId: z.uuid(),
  inquiryId: z.uuid().optional().nullable(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  status: projectStatusSchema.optional(),
  contractAmount: z.number().int().nonnegative().optional(),
  expectedStartDate: z.iso.date().optional().or(z.literal("")),
  expectedLaunchDate: z.iso.date().optional().or(z.literal("")),
  launchedAt: z.iso.date().optional().or(z.literal("")),
  memo: z.string().trim().max(4000).optional().or(z.literal("")),
});

export const updateProjectSchema = createProjectSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one project field is required",
);

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
