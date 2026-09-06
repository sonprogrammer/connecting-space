import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

test("project payment manager keeps mutations project-scoped and exposes QA-critical states", async () => {
  const source = await readFile(resolve("src/widgets/admin-customer-projects/ui/project-payment-manager.tsx"), "utf8");
  assert.match(source, /adminProjectPaymentQueryKeys\.detail\(projectId\)/);
  assert.match(source, /invalidateQueries\(\{ queryKey: adminProjectPaymentQueryKeys\.detail\(projectId\) \}\)/);
  assert.match(source, /결제 예정 추가/);
  assert.match(source, /입금 등록/);
  assert.match(source, /다시 시도/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-label="입금액"/);
  assert.match(source, /aria-invalid=\{Boolean\(error\)\}/);
  assert.match(source, /aria-busy=\{saving\}/);
  assert.match(source, /if \(succeeded\) \{/);
  assert.match(source, /idempotencyKey: form\.idempotencyKey/);
  assert.match(source, /resolveReceiptIdempotencyKey/);
  assert.match(source, /formatSeoulDate\(receipt\.received_at\)/);
  assert.match(source, /updatePaymentReceipt/);
  assert.match(source, /updatePaymentReceipt/);
});

test("project panel mounts payment management for the selected project", async () => {
  const source = await readFile(resolve("src/widgets/admin-customer-projects/ui/admin-customer-project-manager.tsx"), "utf8");
  assert.match(source, /<ProjectPaymentManager key=\{selectedId\} projectId=\{selectedId\} \/>/);
});
