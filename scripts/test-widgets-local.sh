#!/usr/bin/env bash
set -euo pipefail
test_root=$(mktemp -d "${TMPDIR:-/tmp}/imweb-widgets.XXXXXX")
mkdir -p "$test_root/supabase"
cp -R supabase/migrations "$test_root/supabase/migrations"
printf 'project_id = "imweb-widgets-%s"\n[api]\nport = 56941\n[db]\nport = 56942\n[studio]\nport = 56943\n[inbucket]\nport = 56944\n[analytics]\nenabled = false\n' "$$" > "$test_root/supabase/config.toml"
cleanup() { supabase stop --workdir "$test_root" --no-backup >/dev/null; }
trap cleanup EXIT
supabase start --workdir "$test_root" --exclude storage-api,imgproxy,studio,edge-runtime,realtime >/dev/null
supabase db reset --workdir "$test_root" --local
local_env=$(supabase status --workdir "$test_root" --output env)
set -a
eval "$local_env"
set +a
./node_modules/.bin/tsc -p tsconfig.test.json
RUN_WIDGET_INTEGRATION_TESTS=1 RUN_DOCUMENT_INTEGRATION_TESTS=1 node --test .test-dist/tests/widgets.integration.test.js .test-dist/tests/project-documents.integration.test.js
