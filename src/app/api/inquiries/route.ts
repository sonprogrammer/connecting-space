import { createInquirySchema } from "@/features/submit-inquiry/schemas/inquiry.schema";
import { jsonError, jsonOk } from "@/shared/api/response";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/server";
import { processAutomationJobs } from "@/shared/lib/automation/processor";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createInquirySchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(
      "VALIDATION_ERROR",
      "Invalid inquiry payload",
      400,
      parsed.error.flatten(),
    );
  }

  const input = parsed.data;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("create_inquiry_with_automation", {
    p_inquiry: {
      customer_name: input.customerName,
      email: input.email || null,
      phone: input.phone || null,
      company_name: input.companyName || null,
      website_url: input.websiteUrl || null,
      service_type: input.serviceType,
      budget_min: input.budgetMin ?? null,
      budget_max: input.budgetMax ?? null,
      desired_launch_date: input.desiredLaunchDate || null,
      message: input.message,
      source: input.source || null,
    },
  });

  const created = data?.[0];
  if (error || !created) {
    return jsonError("INQUIRY_CREATE_FAILED", "Failed to create inquiry", 500);
  }

  after(async () => {
    await processAutomationJobs({ limit: 1 }).catch(() => undefined);
  });
  return jsonOk({ id: created.id, status: created.status }, { status: 201 });
}
import { after } from "next/server";
