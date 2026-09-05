import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.RUN_SUPABASE_INTEGRATION_TESTS === "1";

describe("production inquiry conversion RPC", { skip: !enabled }, () => {
  it("returns the same IDs on a repeated call without duplicate rows", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, "");
    const inquiryId = process.env.INQUIRY_CONVERSION_TEST_ID;
    assert.ok(url && inquiryId && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.ADMIN_ACCESS_TOKEN);

    const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${process.env.ADMIN_ACCESS_TOKEN}` } },
    });
    const payload = {
      p_inquiry_id: inquiryId,
      p_customer_name: "RPC integration test",
      p_customer_memo: "",
      p_project_name: "RPC integration test",
      p_contract_amount: null,
      p_expected_launch_date: null,
      p_project_memo: "",
    };

    const first = await supabase.rpc("convert_inquiry_to_project", payload);
    assert.equal(first.error, null, first.error?.message);
    const second = await supabase.rpc("convert_inquiry_to_project", payload);
    assert.equal(second.error, null, second.error?.message);
    assert.deepEqual(second.data, first.data);

    const customerId = first.data?.[0]?.customer_id;
    const projectId = first.data?.[0]?.project_id;
    assert.ok(customerId && projectId);
    const [customers, projects] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }).eq("inquiry_id", inquiryId),
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("inquiry_id", inquiryId),
    ]);
    assert.equal(customers.error, null, customers.error?.message);
    assert.equal(projects.error, null, projects.error?.message);
    assert.equal(customers.count, 1);
    assert.equal(projects.count, 1);
  });
});
