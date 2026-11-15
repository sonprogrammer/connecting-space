import { z } from "zod";
import type { NextRequest } from "next/server";
import { widgetInputSchema, compileWidget } from "@/entities/widget/schemas/widget";
import { generateAndFinishWidget } from "@/entities/widget/server/generation";
import { jsonError, jsonOk } from "@/shared/api/response";
import { getVerifiedAdminSupabase } from "@/shared/lib/auth/admin-api";
import type { Json } from "@/shared/types/database.generated";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const querySchema = z.object({ version: z.coerce.number().int().positive().optional(), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }).strict();
const privateHeaders = { "Cache-Control": "private, no-store" };

function dbError(error: { code?: string } | null) {
  const mapping: Record<string, [string, number]> = {
    "42501": ["WIDGET_ACCESS_DENIED", 403], P0002: ["WIDGET_NOT_FOUND", 404],
    "40001": ["WIDGET_REVISION_CONFLICT", 409], P0390: ["WIDGET_REVISION_CONFLICT", 409], "23505": ["WIDGET_REQUEST_CONFLICT", 409],
    "55P03": ["WIDGET_BUSY", 409], "53300": ["WIDGET_GENERATION_LIMIT", 429],
    P0001: ["WIDGET_RETRY_EXHAUSTED", 409], "22023": ["WIDGET_INPUT_INVALID", 400],
  };
  const [code, status] = mapping[error?.code ?? ""] ?? ["WIDGET_REQUEST_FAILED", 500];
  return jsonError(code, "Widget request failed", status, undefined, status === 429 ? { "Retry-After": "60" } : undefined);
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
    if (size > 16384) { await reader.cancel(); return { response: jsonError("REQUEST_BODY_TOO_LARGE", "Request body is too large", 413) }; }
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
  if (!parsed.success || [...params.keys()].length !== new Set(params.keys()).size) return jsonError("VALIDATION_ERROR", "Invalid widget query", 400);
  const q = parsed.data;
  const result = await auth.admin!.supabase.rpc("read_project_widget", { p_project_id: auth.id!, p_kind: "widget", p_version: q.version, p_page: q.page, p_page_size: q.pageSize });
  if (result.error) return dbError(result.error);
  try {
    if (q.version) {
      const version = result.data as Record<string, Json>;
      return jsonOk({ ...version, code: compileWidget(version.content, auth.id!) }, { headers: privateHeaders });
    }
    const data = result.data as Record<string, Json>;
    const widget = data.widget as Record<string, Json> | null;
    if (widget?.content) data.widget = { ...widget, code: compileWidget(widget.content, auth.id!) };
  } catch { return jsonError("WIDGET_STORED_CONTENT_INVALID", "Stored widget requires review", 500); }
  const jobs = await auth.admin!.supabase.rpc("read_project_widget_jobs", { p_project_id: auth.id!, p_kind: "widget" });
  if (jobs.error) return dbError(jobs.error);
  return jsonOk({ ...(result.data as Record<string, Json>), jobs: jobs.data }, { headers: privateHeaders });
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await authorize(request, context); if (auth.response) return auth.response;
  const body = await readBody(request); if (body.response) return body.response;
  const parsed = widgetInputSchema.safeParse(body.value);
  if (!parsed.success) return jsonError("VALIDATION_ERROR", "Invalid generation request", 400);
  const input = parsed.data;
  const claimed = await auth.admin!.supabase.rpc("claim_project_widget", { p_project_id: auth.id!, p_kind: "widget", p_request_key: input.requestKey, p_retry: input.retry, p_requirements: input.requirements });
  if (claimed.error) return dbError(claimed.error);
  const claim = claimed.data as unknown as { execute: boolean; job: { id: string; status: string }; leaseToken: string; context: Json };
  if (!claim?.job) return dbError(null);
  if (!claim.execute) {
    if (claim.job.status === "failed") return jsonError("WIDGET_RETRY_REQUIRED", "Explicit retry required", 409, claim.job);
    return jsonOk(claim.job, { status: claim.job.status === "processing" ? 202 : 200, headers: privateHeaders });
  }
  const finished = await generateAndFinishWidget(auth.admin!.supabase, claim);
  if (finished.error) return dbError(finished.error);
  if (finished.failure) return jsonError(finished.failure, "Widget generation failed", finished.failure === "AI_NOT_CONFIGURED" || finished.failure === "AI_CONFIGURATION_INVALID" ? 503 : 502, finished.data);
  return jsonOk(finished.data, { status: 201, headers: privateHeaders });
}
