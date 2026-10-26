export { documentKindSchema, generationInputSchema, saveDocumentSchema, reviewNotice } from "./schemas/document";
export type ProjectDocumentKind = "proposal" | "contract";
export type ProjectDocumentContent = ReturnType<typeof import("./schemas/document").makeReviewContent> & {
  references: { contractAmount: number; expectedStartDate: string | null; expectedLaunchDate: string | null; confirmed: false };
};
