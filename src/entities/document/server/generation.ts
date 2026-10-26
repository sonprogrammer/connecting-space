import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/types/database.generated";
import { assertAiEnv } from "@/shared/config/env";
import { generateProjectDocument } from "./ai";

export async function generateAndFinishDocument(
  client: SupabaseClient<Database>,
  type: "proposal" | "contract",
  claim: { job: { id: string }; leaseToken: string; context: Json },
  dependencies: { config?: typeof assertAiEnv; generate?: typeof generateProjectDocument } = {},
) {
  let config: ReturnType<typeof assertAiEnv> | undefined;
  let result: Awaited<ReturnType<typeof generateProjectDocument>> | undefined;
  let failure: string | null = null;
  try { config = (dependencies.config ?? assertAiEnv)(); }
  catch { failure = "AI_NOT_CONFIGURED"; }
  if (config) {
    try { result = await (dependencies.generate ?? generateProjectDocument)(type, claim.context, config); }
    catch (error) {
      failure = error instanceof Error && ["AI_CONFIGURATION_INVALID", "AI_OUTPUT_INVALID"].includes(error.message) ? error.message : "AI_PROVIDER_FAILED";
    }
  }
  const content = result?.content;
  const finished = await client.rpc("finish_project_document", {
    p_job_id: claim.job.id, p_lease_token: claim.leaseToken,
    p_content: content ? { title: content.title, summary: content.summary, scopeItems: content.scopeItems } : null,
    p_error: failure, p_provider: config?.provider ?? null, p_model: config?.model ?? null,
    p_input_tokens: result?.inputTokens ?? null, p_output_tokens: result?.outputTokens ?? null,
  });
  return { ...finished, failure };
}
