import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const enabled = process.env.RUN_QUOTE_CONTRACT_INTEGRATION_TESTS === "1";

describe("로컬 서명 확인 전환 PostgreSQL 통합", { skip: !enabled }, () => {
  test("동일 멱등 키는 기존 전환 결과를 반환하고 결제 row를 중복 생성하지 않는다", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, "");
    assert.ok(url);
    const host = new URL(url).hostname;
    assert.ok(host === "localhost" || host === "127.0.0.1", "integration test requires local Supabase");
    const versionId = process.env.QUOTE_CONTRACT_TEST_VERSION_ID;
    const accessToken = process.env.ADMIN_ACCESS_TOKEN;
    assert.ok(versionId && accessToken && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${accessToken}` } } });
    const hash = "a".repeat(64);
    const input = {
      p_confirmation_id: randomUUID(), p_quote_version_id: versionId,
      p_idempotency_key_hash: hash, p_confirmed_at: "2026-09-12T10:00:00+09:00",
      p_deposit_percentage: 30, p_balance_percentage: 70,
    };
    const first = await supabase.rpc("confirm_quote_contract", input);
    assert.equal(first.error, null, first.error?.message);
    const second = await supabase.rpc("confirm_quote_contract", { ...input, p_confirmation_id: randomUUID() });
    assert.equal(second.error, null, second.error?.message);
    assert.equal(second.data?.[0]?.result, "existing");
    assert.equal(second.data?.[0]?.confirmation?.id, first.data?.[0]?.confirmation?.id);
  });
});
