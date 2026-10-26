import { z } from "zod";
import type { NextRequest } from "next/server";
import { documentKindSchema, generationInputSchema, saveDocumentSchema } from "@/entities/document/schemas/document";
import { generateAndFinishDocument } from "@/entities/document/server/generation";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import type { Json } from "@/shared/types/database.generated";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const querySchema = z.object({ type: documentKindSchema, version: z.coerce.number().int().positive().optional(), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }).strict();
const privateHeaders = { "Cache-Control": "private, no-store" };

function dbError(error: { code?: string } | null) {
  const mapping: Record<string, [string, number]> = {
    "42501": ["DOCUMENT_ACCESS_DENIED", 403], P0002: ["DOCUMENT_NOT_FOUND", 404],
    "40001": ["DOCUMENT_REVISION_CONFLICT", 409], P0390: ["DOCUMENT_REVISION_CONFLICT", 409], "23505": ["DOCUMENT_REQUEST_CONFLICT", 409],
    "55P03": ["DOCUMENT_BUSY", 409], "53300": ["DOCUMENT_GENERATION_LIMIT", 429],
    P0001: ["DOCUMENT_RETRY_EXHAUSTED", 409], "22023": ["DOCUMENT_INPUT_INVALID", 400],
  };
  const [code, status] = mapping[error?.code ?? ""] ?? ["DOCUMENT_REQUEST_FAILED", 500];
  return jsonError(code, "Document request failed", status, undefined, status === 429 ? { "Retry-After": "60" } : undefined);
}

async function authorize(request: NextRequest, context: Context) {
  const admin = await getVerifiedAdminSupabase(request);
  if (!admin.ok) return { response: admin.response };
  const id = z.uuid().safeParse((await context.params).id);
  if (!id.success) return { response: jsonError("INVALID_PROJECT_ID", "Invalid project id", 400) };
  return { admin, id: id.data };
}

async function readBody(request: Request): Promise<{ value?: unknown; response?: Response }> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return { response: jsonError("UNSUPPORTED_MEDIA_TYPE", "JSON required", 415) };
  const reader = request.body?.getReader();
  if (!reader) return { value: null };
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.length;
    if (size > 32768) { await reader.cancel(); return { response: jsonError("REQUEST_BODY_TOO_LARGE", "Request body is too large", 413) }; }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return { value: JSON.parse(new TextDecoder().decode(bytes)) }; }
  catch { return { value: null }; }
}

export async function GET(request: NextRequest, context: Context) {
  const auth = await authorize(request, context); if (auth.response) return auth.response;
  const params = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success || [...params.keys()].length !== new Set(params.keys()).size) return jsonError("VALIDATION_ERROR", "Invalid document query", 400);
  const q = parsed.data;
  const result = await auth.admin!.supabase.rpc("read_project_document", { p_project_id: auth.id!, p_kind: q.type, p_version: q.version, p_page: q.page, p_page_size: q.pageSize });
  if (result.error) return dbError(result.error);
  if (q.version) return jsonOk(result.data, { headers: privateHeaders });
  const jobs = await auth.admin!.supabase.rpc("read_project_document_jobs", { p_project_id: auth.id!, p_kind: q.type });
  if (jobs.error) return dbError(jobs.error);
  return jsonOk({ ...(result.data as Record<string, Json>), jobs: jobs.data }, { headers: privateHeaders });
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await authorize(request, context); if (auth.response) return auth.response;
  const body = await readBody(request); if (body.response) return body.response;
  const parsed = generationInputSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid generation request", 400);
  const input = parsed.data;
  const claimed = await auth.admin!.supabase.rpc("claim_project_document", { p_project_id: auth.id!, p_kind: input.type, p_request_key: input.requestKey, p_retry: input.retry });
  if (claimed.error) return dbError(claimed.error);
  const claim = claimed.data as unknown as { execute: boolean; job: { id: string; status: string }; leaseToken: string; context: Json };
  if (!claim?.job) return dbError(null);
  if (!claim.execute) {
    if (claim.job.status === "failed") return jsonError("DOCUMENT_RETRY_REQUIRED", "Explicit retry required", 409, claim.job);
    return jsonOk(claim.job, { status: claim.job.status === "processing" ? 202 : 200, headers: privateHeaders });
  }
  const finished = await generateAndFinishDocument(auth.admin!.supabase, input.type, claim);
  if (finished.error) return dbError(finished.error);
  if (finished.failure) return jsonError(finished.failure, "Document generation failed", finished.failure === "AI_NOT_CONFIGURED" || finished.failure === "AI_CONFIGURATION_INVALID" ? 503 : 502, finished.data);
  return jsonOk(finished.data, { status: 201, headers: privateHeaders });
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await authorize(request, context); if (auth.response) return auth.response;
  const body = await readBody(request); if (body.response) return body.response;
  const parsed = saveDocumentSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid document input", 400);
  const input = parsed.data;
  const saved = await auth.admin!.supabase.rpc("save_project_document", { p_project_id: auth.id!, p_kind: input.type, p_request_key: input.requestKey, p_expected_revision: input.expectedRevision, p_content: input.content });
  if (saved.error) return dbError(saved.error);
  return jsonOk(saved.data, { headers: privateHeaders });
}
