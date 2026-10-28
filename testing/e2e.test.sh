#!/usr/bin/env bash
# TIER 2 — the product a bootstrap produces builds, deploys (dry) and serves.
#
# placement.test.sh proves the tree a bootstrap ends with is the right tree.
# This proves it WORKS, by doing to it what its own pipelines will:
#
#   1. at the 01-product landing (the commit its one pull request merges),
#      install with the lockfile the product ships, render the wrangler
#      fixture and check the committed config IS that render, typecheck,
#      lint, test, build. The landing's own PR runs `plan` alone (an
#      `orun/BASE-*` branch), so THIS is where a product those steps refuse
#      is caught: before the tag, not after a build has merged it;
#   2. the stage lane's own steps, rendered by `orun plan` in the product for
#      a pull request (the verify profile: the deploy profile has no dry run)
#      — `verify-app-structure` (which checks the wrangler config exists
#      BEFORE anything is built), `build-app` (the component's buildCommand:
#      the live wiring render, then the build), `verify-build-output` and
#      `deploy-dry-run` (`wrangler deploy --dry-run --name <reponame>-web-stage`).
#      They run IN THE TREE THE RUNNER STAGES for the job
#      (testing/lib/stage-job.py), with the dependency layout the pinned
#      composition produces, and with the stage wiring document in the job's
#      environment as the platform resolves it (the component's secretEnv) —
#      so the bucket name in the built config is asserted to be the
#      document's, not the fixture's;
#   3. serve the built Worker with `wrangler dev` (a local R2 bucket and local
#      Durable Objects) and run the component's OWN `smokeCommand` against it,
#      verbatim — the check the real deploy ends with — and then do what a
#      visitor does on a fresh deploy with NO Salesforce store: `/` says
#      "Connect your Salesforce Commerce Cloud store" under the product's name; every
#      storefront page answers empty with the connect note, never a 500;
#      `/api/health` says not connected; revalidation is off;
#   4. CONNECT A STORE, as the owner does: the same lane's build again, with
#      the environment's four `SFCC_*` coordinates (client id, organization,
#      short code, site; the component's optionalSecretEnv) pointed at a
#      stand-in SCAPI + SLAS (tests/web/fake-sfcc.mjs — the public client's
#      PKCE guest login and the Shopper Products, Search and Baskets calls the
#      storefront makes, answered offline) and the revalidation secret as a
#      Worker secret; then browse as a shopper — the home grid and carousel,
#      search, a category, a product — and prove the cache: a second visit
#      reads Salesforce not at all (no catalogue read, no guest login), a
#      change in the store does not show until the secret-checked revalidation
#      drops its tag, and then the products are read again but not the
#      categories; a missing or wrong secret drops nothing.
#
# What it cannot do is the platform's half: create the repository, mint the
# brokered Cloudflare tokens, apply the bucket, deploy for real and probe
# workers.dev — or reach a real Salesforce instance: the stand-in answers the
# SCAPI's and SLAS's shapes for a three-product catalogue, not a real shop's
# data. The R2 root is verified to `terraform validate` and its plan is part
# of every pull request's lanes; the apply needs an account.
#
# Needs: orun, node, pnpm, python3 (+PyYAML), git, curl, and the network for
# `pnpm install` (or a warm store). Several minutes: two installs and three
# builds of the storefront.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
# shellcheck source=lib/bootstrap.sh
source "$here/lib/bootstrap.sh"

for bin in orun node pnpm python3 git curl; do
  command -v "$bin" >/dev/null || { echo "e2e.test.sh needs $bin on PATH" >&2; exit 1; }
done

scratch="$(mktemp -d)"
dev_pid=""
fake_pid=""
# wrangler dev runs under pnpm, node and two workerd processes; a TERM to the
# first does not reach the rest, and waiting on it then never returns. So it is
# started as its own process group (setsid) and the whole group is stopped.
cleanup() {
  if [ -n "$dev_pid" ]; then
    kill -TERM -- "-$dev_pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$dev_pid" 2>/dev/null || break; sleep 0.5; done
    kill -KILL -- "-$dev_pid" 2>/dev/null || true
  fi
  [ -z "$fake_pid" ] || kill -TERM -- "-$fake_pid" 2>/dev/null || true
  rm -rf "$scratch"
}
trap cleanup EXIT
values="$here/fixtures/acme.json"
repo="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['reponame'])" "$values")"
export CI=1 WRANGLER_SEND_METRICS=false NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1

# The landing's own checks, step for step — the ones the product's retired
# Checks workflow ran, run here at once on the whole tree. A product's pull
# requests verify through ci.yml's lanes (the storefront built — Next's build
# type-checks it — and dry-deployed per environment, the R2 root planned),
# which neither lint nor run the tests, so before a tag THIS is where those
# are held.
LANDING_CHECKS=(
  "pnpm install --frozen-lockfile"
  "pnpm run wire:fixture"
  "git diff --exit-code"
  "pnpm typecheck"
  "pnpm lint"
  "pnpm test"
  "pnpm build"
)
checks() { # DIR LOG
  local dir="$1" log="$2" cmd
  for cmd in "${LANDING_CHECKS[@]}"; do
    echo "   \$ $cmd" | tee -a "$log"
    if ! (cd "$dir" && bash -c "$cmd") >> "$log" 2>&1; then
      echo "FAIL: \`$cmd\` failed in $dir" >&2; tail -40 "$log" >&2; return 1
    fi
  done
}

echo "── the offline bootstrap (testing/lib/bootstrap.sh)"
tree="$scratch/$repo"
bootstrap_offline "$root" "$tree" "$values" "$scratch/logs" > "$scratch/bootstrap.log" 2>&1 || {
  echo "FAIL: the offline bootstrap stopped" >&2; tail -40 "$scratch/bootstrap.log" >&2; exit 1; }
echo "   2 phases placed and landed"
s01="$(git -C "$tree" rev-parse HEAD~1)"

# ── 1. the product's one pull request ──────────────────────────────────────
echo "── 01-product's landing: install, the fixture render, typecheck, lint, test, build"
git -C "$tree" worktree add -q "$scratch/at-01" "$s01"
checks "$scratch/at-01" "$scratch/checks-01.log"
# The landing's build is done; its tree is not needed again, and the disk is shared.
git -C "$tree" worktree remove --force "$scratch/at-01"

# ── 2. the stage lane's steps, in the job's own tree ──────────────────────
echo "── the stage lane: verify-app-structure, build-app, verify-build-output, deploy-dry-run"
# A pull request that changes the page: the lane `orun plan` gives it.
git -C "$tree" checkout -q -b e2e-pr
echo "<!-- a change to the page's component -->" >> "$tree/apps/web/README.md"
git -C "$tree" -c user.email=e2e@example.invalid -c user.name=e2e commit -qam "a pull request"
(cd "$tree" && orun plan --intent intent.yaml --trigger github-pull-request --changed \
   --base main --head HEAD --env stage --output "$scratch/plan.json") > "$scratch/plan.log" 2>&1 \
  || { echo "FAIL: orun plan" >&2; tail -15 "$scratch/plan.log" >&2; exit 1; }
python3 - "$scratch/plan.json" "$scratch/steps" <<'PY'
import json, pathlib, sys
plan = json.load(open(sys.argv[1]))
out = pathlib.Path(sys.argv[2]); out.mkdir()
job = next(j for j in plan["jobs"] if j["component"] == "web" and j["environment"] == "stage")
for s in job["steps"]:
    if s["id"] in ("verify-app-structure", "build-app", "verify-build-output", "deploy-dry-run"):
        (out / f"{s['id']}.sh").write_text(s.get("run") or "")
    if s["id"] == "install-workspace-dependencies":
        (out / "install.sh").write_text(s.get("run") or "")
        (out / "install.wd").write_text(s.get("working-directory") or ".")
        (out / "install.scope").write_text(s.get("scope") or "job")
(out / "path").write_text(job.get("path") or "apps/web")
for k, v in (job.get("env") or {}).items():
    (out / "env").open("a").write(f"export {k}={json.dumps(v)}\n")
(out / "secrets").write_text("\n".join(r["asEnv"] for r in job.get("secretRefs") or []))
PY
# The job's private tree, staged as orun stages it. The source checkout
# carries no build output (nothing was built in it), and its dependencies are
# what the pinned composition says: a lane-scoped install ran once in the
# source tree and is linked in, or the job installs its own.
work="$tree/.orun/runs/e2e/web.stage.verify-deploy/work"
[ -f "$scratch/steps/install.sh" ] || { echo "FAIL: the stage lane has no install step" >&2; exit 1; }
if [ "$(cat "$scratch/steps/install.scope")" = lane ]; then
  (cd "$tree" && bash -e "$scratch/steps/install.sh") > "$scratch/install.log" 2>&1 \
    || { echo "FAIL: the lane's install step" >&2; tail -30 "$scratch/install.log" >&2; exit 1; }
  python3 "$here/lib/stage-job.py" "$tree" "$work" --shared-deps
  [ -L "$work/node_modules" ] || { echo "FAIL: the staged tree's node_modules is not the lane's symlink" >&2; exit 1; }
  echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: lane — node_modules → the source tree's"
else
  python3 "$here/lib/stage-job.py" "$tree" "$work"
  echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: job — installing inside it"
  echo "   ▸ install-workspace-dependencies"
  (cd "$work/$(cat "$scratch/steps/path")/$(cat "$scratch/steps/install.wd")" && bash -e "$scratch/steps/install.sh") \
    > "$scratch/install.log" 2>&1 || { echo "FAIL: the lane's install step" >&2; tail -30 "$scratch/install.log" >&2; exit 1; }
  [ -d "$work/node_modules" ] && [ ! -L "$work/node_modules" ] \
    || { echo "FAIL: the job's install did not land inside its own tree" >&2; exit 1; }
fi
[ ! -e "$work/apps/web/.open-next" ] || { echo "FAIL: the staged tree carries build output" >&2; exit 1; }
# What the platform resolves into the job before its first step: the wiring
# documents the R2 root lease-published (the component's secretEnv), shaped as
# its `wiring` output — `{r2_bucket_name}`. Names no fixture carries, so the
# built config proves which one it was rendered from.
for env in stage prod; do
  key="WIRING_CLOUDFLARE_R2_$(echo "$env" | tr a-z A-Z)"
  grep -qx "$key" "$scratch/steps/secrets" || { echo "FAIL: the stage lane does not resolve $key" >&2; exit 1; }
done
export WIRING_CLOUDFLARE_R2_STAGE='{"r2_bucket_name":"stg-'"$repo"'-stage-applied"}'
export WIRING_CLOUDFLARE_R2_PROD='{"r2_bucket_name":"prod-'"$repo"'-prod-applied"}'
for step in verify-app-structure build-app verify-build-output deploy-dry-run; do
  [ -f "$scratch/steps/$step.sh" ] || { echo "FAIL: the stage verify lane has no $step step" >&2; exit 1; }
  echo "   ▸ $step"
  # The runner's per-job environment: the job's env (intent environment
  # `env:`), its resolved secrets, and ORUN_ENVIRONMENT; the step runs in the
  # component's directory.
  if ! (cd "$work/$(cat "$scratch/steps/path")" && \
        { [ -f "$scratch/steps/env" ] && source "$scratch/steps/env"; true; } && \
        export ORUN_ENVIRONMENT=stage && bash -e "$scratch/steps/$step.sh") > "$scratch/$step.log" 2>&1; then
    echo "FAIL: the deploy lane's $step step" >&2; tail -40 "$scratch/$step.log" >&2; exit 1
  fi
done
grep -q "\"stg-$repo-stage-applied\"" "$work/apps/web/wrangler.jsonc" \
  || { echo "FAIL: the lane's build did not render the stage bucket name from its wiring document" >&2; exit 1; }
grep -q 'NEXT_INC_CACHE_R2_BUCKET' "$scratch/deploy-dry-run.log" && grep -q "stg-$repo-stage-applied" "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run does not bind NEXT_INC_CACHE_R2_BUCKET to the stage bucket" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
grep -q 'NEXT_TAG_CACHE_DO_SHARDED' "$scratch/deploy-dry-run.log" && grep -q "WORKER_SELF_REFERENCE" "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run lost the Durable Object or self-reference bindings" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
echo "   the built config binds NEXT_INC_CACHE_R2_BUCKET to the stage document's bucket; the dry run accepts it"
# The store is the owner's, after the build: the lane names its two settings
# and the revalidation secret as OPTIONAL, so a fresh product's build — this
# one — has none.
python3 - "$scratch/plan.json" "$repo" <<'PY' || exit 1
import json, sys
plan, repo = json.load(open(sys.argv[1])), sys.argv[2]
job = next(j for j in plan["jobs"] if j["component"] == "web" and j["environment"] == "stage")
refs = {r["asEnv"]: r for r in job.get("secretRefs") or []}
KEYS = ("SFCC_CLIENT_ID", "SFCC_ORGANIZATIONID", "SFCC_SHORTCODE", "SFCC_SITEID",
        "SFCC_SECRET", "SFCC_REVALIDATION_SECRET")
for key in KEYS:
    r = refs.get(key)
    if not r or not str(r.get("ref", r.get("uri", ""))).endswith(f"/{repo}/stage/{key}"):
        sys.exit(f"FAIL: the stage lane does not resolve {key} from the product's own secret: {r}")
    if not r.get("optional"):
        sys.exit(f"FAIL: the stage lane requires {key}; a fresh product has no Salesforce store yet")
print("   the lane resolves " + ", ".join(KEYS) + " as optional")
PY

# ── 3. serve it as born, and smoke it as the deploy does ───────────────────
serve() { # PERSIST-DIR → url; serves the staged tree's built Worker
  local port
  port=$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")
  (cd "$work/apps/web" && exec setsid pnpm exec wrangler dev --config wrangler.jsonc --ip 127.0.0.1 --port "$port" \
     --name "$repo-web-stage" --persist-to "$1" --show-interactive-dev-session=false) > "$scratch/dev.log" 2>&1 < /dev/null &
  dev_pid=$!
  url="http://127.0.0.1:$port"
  for _ in $(seq 1 120); do
    curl -s -o /dev/null "$url/favicon.ico" && return 0
    kill -0 "$dev_pid" 2>/dev/null || { echo "FAIL: wrangler dev exited" >&2; tail -30 "$scratch/dev.log" >&2; exit 1; }
    sleep 1
  done
  echo "FAIL: wrangler dev never answered" >&2; tail -30 "$scratch/dev.log" >&2; exit 1
}
stop_serving() {
  [ -n "$dev_pid" ] || return 0
  kill -TERM -- "-$dev_pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$dev_pid" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$dev_pid" 2>/dev/null || true
  dev_pid=""
}

echo "── wrangler dev over the built Worker, as born (no Salesforce store)"
serve "$scratch/state-born"
echo "   ▸ the component's own smokeCommand, DEPLOYED_URL=$url"
smoke="$(python3 -c "import yaml,sys;print(yaml.safe_load(open(sys.argv[1]))['spec']['parameters']['smokeCommand'])" "$tree/apps/web/component.yaml")"
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the store" >&2; exit 1; }

echo "   ▸ a visitor on a fresh deploy: asked to connect a store, never a 500"
python3 "$here/lib/e2e-visit.py" born "$url" "$values" || exit 1
stop_serving

# ── 4. connect a store: the owner's secrets, the lane's build again ────────
echo "── connecting a Salesforce store: the stand-in SCAPI + SLAS, its coordinates for stage, the lane's build again"
api_port=$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()")
client_id="e2e0c11e-0000-4000-8000-00000000c11e"
org_id="f_ecom_e2e_001"
short_code="e2e00001"
site_id="E2ESite"
(exec setsid node "$root/tests/web/fake-sfcc.mjs" --port "$api_port" --client "$client_id" --org "$org_id" --site "$site_id") \
  > "$scratch/fake-sfcc.log" 2>&1 < /dev/null &
fake_pid=$!
api="http://127.0.0.1:$api_port"
for _ in $(seq 1 30); do curl -s -o /dev/null "$api/__calls" && break; sleep 0.5; done
curl -s -o /dev/null "$api/__calls" || { echo "FAIL: the stand-in SCAPI never answered" >&2; cat "$scratch/fake-sfcc.log" >&2; exit 1; }
# What the platform resolves into the job once the owner has set the
# environment's four SFCC_* coordinates (the component's optionalSecretEnv).
# SFCC_SECRET and SFCC_REVALIDATION_SECRET are resolved too: the build must
# not carry them (`env -u`), which the bundle is checked for. SFCC_API_ORIGIN
# is this test's alone — the stand-in's origin, in place of
# https://<short code>.api.commercecloud.salesforce.com.
client_secret="e2e-slas-private-client-secret-fedcba9876543210"
secret="e2e-revalidate-secret-0123456789abcdef"
for step in build-app verify-build-output; do
  echo "   ▸ $step"
  if ! (cd "$work/$(cat "$scratch/steps/path")" && \
        { [ -f "$scratch/steps/env" ] && source "$scratch/steps/env"; true; } && \
        export ORUN_ENVIRONMENT=stage SFCC_CLIENT_ID="$client_id" SFCC_ORGANIZATIONID="$org_id" \
               SFCC_SHORTCODE="$short_code" SFCC_SITEID="$site_id" SFCC_API_ORIGIN="$api" \
               SFCC_SECRET="$client_secret" SFCC_REVALIDATION_SECRET="$secret" && \
        bash -e "$scratch/steps/$step.sh") > "$scratch/$step-connected.log" 2>&1; then
    echo "FAIL: the lane's $step with a store connected" >&2; tail -40 "$scratch/$step-connected.log" >&2; exit 1
  fi
done
for leaked in "$client_secret" "$secret"; do
  if grep -rqF "$leaked" "$work/apps/web/.open-next" "$work/apps/web/.next" 2>/dev/null; then
    echo "FAIL: a server-side secret reached the build output" >&2; exit 1
  fi
done
grep -rqF "$client_id" "$work/apps/web/.open-next/worker.js" "$work/apps/web/.open-next/server-functions" 2>/dev/null \
  || { echo "FAIL: the store's client id is not in the build" >&2; exit 1; }
grep -q "no Cloudflare credential" "$scratch/build-app-connected.log" \
  || { echo "FAIL: a verify lane's build tried to push Worker secrets" >&2; tail -20 "$scratch/build-app-connected.log" >&2; exit 1; }
echo "   the store's coordinates are in the build; SFCC_SECRET and the revalidation secret are not, and a verify lane pushes none"
# The revalidation secret is a Worker secret (the deploy lane pushes it);
# wrangler dev reads it from .dev.vars beside the config. SFCC_SECRET is left
# unset here, so the storefront logs in through the public client's PKCE flow.
printf 'SFCC_REVALIDATION_SECRET=%s\n' "$secret" > "$work/apps/web/.dev.vars"
serve "$scratch/state-connected"
DEPLOYED_URL="$url" bash -c "$smoke" || { echo "FAIL: the deploy's smoke refused the connected store" >&2; exit 1; }
echo "   ▸ a shopper: browse the catalogue; the cache reused, then revalidated by the secret-checked route"
E2E_API="$api" E2E_SECRET="$secret" python3 "$here/lib/e2e-visit.py" connected "$url" "$values" || exit 1
stop_serving

echo "e2e.test.sh: ok"
