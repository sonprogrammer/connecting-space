import { createInquirySchema } from "@/features/submit-inquiry/schemas/inquiry.schema";
import { jsonError, jsonOk } from "@/shared/api/response";
import { createSupabaseAdminClient } from "@/shared/lib/supabase/server";

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
  const inquiryId = crypto.randomUUID();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("inquiries")
    .insert({
      id: inquiryId,
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
    });

  if (error) {
    return jsonError("INQUIRY_CREATE_FAILED", error.message, 500);
  }

  return jsonOk({ id: inquiryId, status: "new" }, { status: 201 });
}
