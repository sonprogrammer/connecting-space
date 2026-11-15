export { documentKindSchema, generationInputSchema, saveDocumentSchema, reviewNotice } from "./schemas/document";
export type ProjectDocumentKind = "proposal" | "contract";
export type ProjectDocumentContent = ReturnType<typeof import("./schemas/document").makeReviewContent> & {
  references: { contractAmount: number; expectedStartDate: string | null; expectedLaunchDate: string | null; confirmed: false };
};
export {
  adminProjectDocumentQueryKeys,
  fetchAdminProjectDocument,
  fetchAdminProjectDocumentVersion,
  generateAdminProjectDocument,
  saveAdminProjectDocument,
  AdminDocumentQueryError,
} from "./model/admin-document-queries";
export type {
  AdminProjectDocument,
  AdminProjectDocumentGenerationInput,
  AdminProjectDocumentJob,
  AdminProjectDocumentResponse,
  AdminProjectDocumentSaveInput,
  AdminProjectDocumentVersion,
  AdminProjectDocumentVersionSummary,
} from "./model/admin-document-queries";
