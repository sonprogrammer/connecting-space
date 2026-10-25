#!/usr/bin/env bash
set -euo pipefail

# An isolated project: never use linked/remote flags or an existing project's DB.
test_root=$(mktemp -d "${TMPDIR:-/tmp}/imweb-financial.XXXXXX")
mkdir -p "$test_root/supabase"
cp -R supabase/migrations "$test_root/supabase/migrations"
printf 'project_id = "imweb-financial-%s"\n[api]\nport = 56541\n[db]\nport = 56542\n[studio]\nport = 56543\n[inbucket]\nport = 56544\n[analytics]\nenabled = false\n' "$$" > "$test_root/supabase/config.toml"
cleanup() {
  supabase stop --workdir "$test_root" --no-backup >/dev/null
}
trap cleanup EXIT
supabase start --workdir "$test_root" --exclude storage-api,imgproxy,studio,edge-runtime,realtime >/dev/null
supabase db reset --workdir "$test_root" --local
# Local CLI credentials remain in this process; never echo or enable shell tracing.
local_env=$(supabase status --workdir "$test_root" --output env)
set -a
eval "$local_env"
set +a
./node_modules/.bin/tsc -p tsconfig.test.json
RUN_FINANCIAL_INTEGRATION_TESTS=1 node --test .test-dist/tests/admin-financial-summary.integration.test.js
