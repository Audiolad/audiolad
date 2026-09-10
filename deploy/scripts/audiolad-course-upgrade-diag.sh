#!/usr/bin/env bash
# Read-only course-upgrade / L2 checkout diagnostic for operators / GHA
# confirm=OPS_COURSE_UPGRADE_DIAG. Never invokes audiolad-deploy / deploy.sh,
# never does nginx or current/previous symlink cutover, never restarts PM2,
# never POSTs checkout, never calls Tochka, never writes orders / payments /
# entitlements / DB / Storage. No arbitrary remote command input.
# Auto-discovers production audiolad-p30xx PM2 layout (does not assume only
# p3000 or only p3001). Inspects active logs, rotated .log.*, and orphaned
# logs of deleted PM2 apps. Optional read-only DB correlation uses current
# release loadEnvConfig + supabase-js service role, same as other OPS diags.
# Do not source .env.production in this shell. Never print env values, JWT,
# tokens, payment_url, Authorization, cookies, or service-role material.
set -Eeuo pipefail

TARGET_SHA="${1:-${TARGET_SHA:-}}"
ORIGIN_MAIN_SHA="${2:-${ORIGIN_MAIN_SHA:-}}"

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/audiolad-deploy}"
CURRENT_LINK="${DEPLOY_ROOT}/current"
SHARED_ENV_PRODUCTION="${DEPLOY_ROOT}/shared/.env.production"
DEPLOY_COMMIT_FILE="${CURRENT_LINK}/.deploy-commit"

QA_COURSE_SLUG="${AUDIOLAD_COURSE_UPGRADE_DIAG_SLUG:-kody-zhenskoy-prityagatelnosti}"
QA_AUTHOR_SLUG="${AUDIOLAD_COURSE_UPGRADE_DIAG_AUTHOR_SLUG:-sergey-and-zoya}"
QA_LISTENER_EMAIL="${AUDIOLAD_COURSE_UPGRADE_DIAG_EMAIL:-petpovss@yandex.ru}"
PRIORITY_START="${AUDIOLAD_COURSE_UPGRADE_DIAG_WINDOW_START:-2026-09-10T04:25:00Z}"
PRIORITY_END="${AUDIOLAD_COURSE_UPGRADE_DIAG_WINDOW_END:-2026-09-10T04:50:00Z}"

CUTOVER="NO"
AUDIOLAD_DEPLOY="NOT_INVOKED"
MODE="read_only_course_upgrade_diag"

SEARCH_PATTERN='course_upgrade_failed|FAILED_STAGE|ACTUAL_API_ERROR|ACTUAL_HTTP_STATUS|create_payment_tochka_error|create_payment_tochka_http_error|provider_checkout_failed|createTochkaPaymentOperation|startTochkaCheckoutForPendingOrder|course_upgrade_auth_error|course_upgrade_order_invalid_row|course_upgrade_order_reload_error|create_payment_metadata_update_error'

if ! declare -F redact_stream >/dev/null 2>&1; then
  redact_stream() {
    sed -E \
      -e 's/(GETCOURSE_API_KEY=).*/\1***/g' \
      -e 's/(GETCOURSE_CALLBACK_SECRET=).*/\1***/g' \
      -e 's/(SUPABASE_SERVICE_ROLE_KEY=).*/\1***/g' \
      -e 's/(TOCHKA_[A-Z0-9_]+=).*/\1***/g' \
      -e 's/(Authorization:[[:space:]]*).*/\1[redacted-authorization]/Ig' \
      -e 's/(Bearer[[:space:]]+)[A-Za-z0-9._~+/-]+=*/\1[redacted-token]/g' \
      -e 's/(^|[^[:alnum:]_])(payment_url["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?)[^[:space:]"'"'"']+/\1\2[redacted-payment-url]/Ig' \
      -e 's/(cookie[s]?["'"'"']?[[:space:]]*[:=][[:space:]]*)[^[:space:]]+/\1[redacted-cookie]/Ig' \
      -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g' \
      -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[redacted-jwt]/g' \
      -e 's#https?://[^[:space:]\"'"'"']+#[redacted-url]#g'
  }
fi

if ! declare -F section >/dev/null 2>&1; then
  section() {
    printf '\n===== %s =====\n' "$1"
  }
fi

if ! declare -F try_cmd >/dev/null 2>&1; then
  try_cmd() {
    local label="$1"
    shift
    section "${label}"
    if "$@" 2>&1 | redact_stream; then
      return 0
    fi
    local code=$?
    printf 'BLOCKED exit=%s label=%s\n' "${code}" "${label}"
    return 0
  }
fi

print_pm2_layout() {
  local helper=""
  helper="$(mktemp /tmp/audiolad-course-upgrade-pm2.XXXXXX.py)"
  cat >"${helper}" <<'PY'
import json, os, sys

def field(value):
    if value is None:
        return ""
    return str(value).replace("\n", " ").replace("\r", " ")

try:
    procs = json.load(sys.stdin)
except Exception:
    print("pm2_jlist_unreadable")
    raise SystemExit(0)

if not isinstance(procs, list):
    print("pm2_jlist_unreadable")
    raise SystemExit(0)

print("pm2_process_count=%s" % len(procs))
active_p30 = []
for proc in procs:
    if not isinstance(proc, dict):
        continue
    name = field(proc.get("name"))
    env = proc.get("pm2_env") if isinstance(proc.get("pm2_env"), dict) else {}
    status = field(env.get("status"))
    print(
        "pm2_app name=%s status=%s restarts=%s pid=%s cwd=%s out_log=%s error_log=%s pid_path=%s"
        % (
            name,
            status,
            field(env.get("restart_time")),
            field(proc.get("pid")),
            field(env.get("pm_cwd")),
            field(env.get("pm_out_log_path")),
            field(env.get("pm_err_log_path")),
            field(env.get("pm_pid_path")),
        )
    )
    out_log = field(env.get("pm_out_log_path"))
    error_log = field(env.get("pm_err_log_path"))
    pid_path = field(env.get("pm_pid_path"))
    if name.startswith("audiolad-p30"):
        active_p30.append(name)
        print("ACTIVE_P30_APP name=%s status=%s" % (name, status))
        if out_log.startswith("/"):
            print("out_log=%s" % out_log)
        if error_log.startswith("/"):
            print("error_log=%s" % error_log)
        if pid_path.startswith("/"):
            print("pid_path=%s" % pid_path)

print("ACTIVE_P30_COUNT=%s" % len(active_p30))
print("ACTIVE_P30_NAMES=%s" % (",".join(active_p30) if active_p30 else "none"))
print("env_PM2_HOME=%s" % field(os.environ.get("PM2_HOME", "unset")))
PY
  python3 "${helper}"
  rm -f "${helper}"
}

scan_log_file() {
  local helper=""
  helper="$(mktemp /tmp/audiolad-course-upgrade-scan.XXXXXX.py)"
  cat >"${helper}" <<'PY'
import re, sys
from datetime import datetime, timezone

path = sys.argv[1]
priority_start = sys.argv[2]
priority_end = sys.argv[3]
pattern = re.compile(sys.argv[4])
window_re = re.compile(
    r"20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?"
)

def parse_ts(raw):
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    if re.search(r"[+-]\d{4}$", text):
        text = text[:-5] + text[-5:-2] + ":" + text[-2:]
    if "T" not in text and " " in text:
        text = text.replace(" ", "T", 1)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", text):
        text += "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

start = parse_ts(priority_start)
end = parse_ts(priority_end)
field_re = re.compile(
    r"(FAILED_STAGE|ACTUAL_API_ERROR|ACTUAL_HTTP_STATUS|order_id|practice_id|target_access_level)"
    r"""["']?\s*[:=]\s*["']?([^\s,"'}]+)"""
)

def classify(line):
    match = window_re.search(line)
    if not match or start is None or end is None:
        return "unknown"
    ts = parse_ts(match.group(0))
    if ts is None:
        return "unknown"
    if start <= ts <= end:
        return "priority"
    return "recent"

def extract(line):
    found = {}
    for match in field_re.finditer(line):
        found[match.group(1)] = match.group(2)
    return found

try:
    with open(path, "r", errors="replace") as handle:
        lines = handle.readlines()
except OSError:
    print("log_unreadable path=%s" % path)
    raise SystemExit(0)

priority = []
other = []
for idx, raw in enumerate(lines):
    block = raw.rstrip("\n")
    if not pattern.search(block):
        continue
    look = 1
    while idx + look < len(lines) and look <= 8:
        nxt = lines[idx + look].rstrip("\n")
        if pattern.search(nxt):
            break
        stripped = nxt.strip()
        if (
            stripped.startswith("{")
            or "FAILED_STAGE" in nxt
            or "ACTUAL_" in nxt
            or stripped.startswith("}")
        ):
            block += " " + stripped
            look += 1
            continue
        break
    window = classify(block)
    item = (window, idx + 1, block)
    if window == "priority":
        priority.append(item)
    else:
        other.append(item)

selected = priority[-40:] + other[-20:]
print("match_count=%s" % (len(priority) + len(other)))
print("priority_match_count=%s" % len(priority))
print("other_match_count=%s" % len(other))
print("printed_match_count=%s" % len(selected))
wanted = (
    "FAILED_STAGE",
    "ACTUAL_API_ERROR",
    "ACTUAL_HTTP_STATUS",
    "order_id",
    "practice_id",
    "target_access_level",
)
for window, lineno, block in selected:
    fields = extract(block)
    parts = ["SAFE_SUMMARY", "window=%s" % window, "line=%s" % lineno]
    for key in wanted:
        if key in fields:
            parts.append("%s=%s" % (key, fields[key]))
    print(" ".join(parts))
    snippet = block.replace("\t", " ")
    if len(snippet) > 400:
        snippet = snippet[:400] + "...[truncated]"
    print("MATCH_LINE window=%s line=%s text=%s" % (window, lineno, snippet))
PY
  python3 "${helper}" "$1" "${PRIORITY_START}" "${PRIORITY_END}" "${SEARCH_PATTERN}"
  rm -f "${helper}"
}

describe_log_candidate() {
  local path="$1"
  local kind="$2"
  local size="unreadable"
  local mtime="unreadable"
  local readable="NO"
  if [[ -r "${path}" ]]; then
    readable="YES"
    size="$(wc -c < "${path}" | tr -d '[:space:]')"
    if epoch="$(stat -c '%Y' "${path}" 2>/dev/null)"; then
      mtime="$(date -u -d "@${epoch}" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)"
    fi
  elif [[ -e "${path}" ]]; then
    if STAT="$(stat -c 'size=%s mtime_epoch=%Y' "${path}" 2>/dev/null)"; then
      size="${STAT}"
    fi
  fi
  printf 'log_candidate kind=%s readable=%s size=%s mtime=%s path=%s\n' \
    "${kind}" "${readable}" "${size}" "${mtime}" "${path}"
}

scan_candidate() {
  local path="$1"
  local kind="$2"
  describe_log_candidate "${path}" "${kind}"
  if [[ ! -r "${path}" ]]; then
    echo "log_unreadable kind=${kind} path=${path}"
    return 0
  fi
  echo "log_matches kind=${kind} path=${path} <<"
  if command -v python3 >/dev/null 2>&1; then
    scan_log_file "${path}" | redact_stream
  else
    grep -E -n "${SEARCH_PATTERN}" "${path}" | tail -n 40 | redact_stream \
      || echo "grep_no_matches"
  fi
  echo ">>log_matches"
}

collect_unique_paths() {
  local seen=""
  local path=""
  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    case "${seen}" in
      *"|${path}|"*) continue ;;
    esac
    seen="${seen}|${path}|"
    printf '%s\n' "${path}"
  done
}

run_course_upgrade_db_probe() {
  local dir="${CURRENT_LINK}"
  local probe=""
  local output=""
  local code=0
  if [[ ! -d "${dir}" ]]; then
    echo "DB_CORRELATION=DEFERRED"
    echo "db_reason=current_release_missing"
    return 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "DB_CORRELATION=DEFERRED"
    echo "db_reason=node_not_found"
    return 0
  fi
  probe="$(mktemp /tmp/audiolad-course-upgrade-diag.XXXXXX.js)"
  cat >"${probe}" <<'JS'
const silent = { info() {}, error() {} };
const dir = process.argv[2];
const courseSlug = process.argv[3];
const authorSlug = process.argv[4];
const listenerEmail = process.argv[5];
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(dir, false, silent, true);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseUrlHost(raw) {
  try {
    return raw ? new URL(raw).host : "";
  } catch {
    return "";
  }
}

function field(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").slice(0, 120);
}

function yesNo(value) {
  return value ? "YES" : "NO";
}

function metadataInfo(raw) {
  const meta = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  const keys = meta ? Object.keys(meta).sort() : [];
  return {
    present: Boolean(meta) && keys.length > 0,
    keyCount: keys.length,
    keys: keys.join(","),
    hasPaymentUrl: Boolean(meta && meta.payment_url),
    hasCheckoutToken: Boolean(meta && meta.checkout_token),
  };
}

function printDeferred(reason) {
  console.log("DB_CORRELATION=DEFERRED");
  console.log("db_reason=" + reason);
}

if (!url || !key) {
  console.log("supabase_url_host=" + supabaseUrlHost(url));
  printDeferred("missing_env");
  process.exit(0);
}

const { createClient } = require("@supabase/supabase-js");
const service = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const timer = setTimeout(() => {
  printDeferred("timeout");
  process.exit(0);
}, 45000);

function errorText(err) {
  if (!err) return "none";
  return field(err.message || err.code || "error");
}

(async () => {
  console.log("supabase_url_host=" + supabaseUrlHost(url));
  console.log("qa_course_slug=" + field(courseSlug));
  console.log("qa_author_slug=" + field(authorSlug));
  console.log("qa_listener=hardcoded_redacted");
  console.log("loadEnvConfig=service_role_read_only");

  const authorRes = await service
    .from("authors")
    .select("id, slug")
    .eq("slug", authorSlug)
    .maybeSingle();
  const author = authorRes.data;
  console.log("author_query_error=" + errorText(authorRes.error));
  console.log("author_matched=" + yesNo(Boolean(author && author.id)));

  let practiceRes = { data: null, error: null };
  if (author && author.id) {
    practiceRes = await service
      .from("practices")
      .select("id, slug, author_id")
      .eq("slug", courseSlug)
      .eq("author_id", author.id)
      .maybeSingle();
  } else {
    practiceRes = await service
      .from("practices")
      .select("id, slug, author_id")
      .eq("slug", courseSlug)
      .maybeSingle();
  }
  const practice = practiceRes.data;
  console.log("practice_query_error=" + errorText(practiceRes.error));
  console.log("practice_matched=" + yesNo(Boolean(practice && practice.id)));
  console.log("practice_id=" + field(practice && practice.id));

  const profileRes = await service
    .from("profiles")
    .select("id")
    .eq("email", listenerEmail)
    .maybeSingle();
  const profile = profileRes.data;
  console.log("listener_query_error=" + errorText(profileRes.error));
  console.log("listener_matched=" + yesNo(Boolean(profile && profile.id)));
  console.log("user_id=" + field(profile && profile.id));

  if (!practice || !practice.id || !profile || !profile.id) {
    printDeferred("missing_practice_or_listener");
    clearTimeout(timer);
    return;
  }

  const entitlementRes = await service
    .from("user_practices")
    .select("access_level, access_source, granted_at")
    .eq("user_id", profile.id)
    .eq("practice_id", practice.id)
    .maybeSingle();
  const entitlement = entitlementRes.data;
  console.log("entitlement_query_error=" + errorText(entitlementRes.error));
  console.log("entitlement_present=" + yesNo(Boolean(entitlement)));
  console.log("access_level=" + field(entitlement && entitlement.access_level));
  console.log("access_source=" + field(entitlement && entitlement.access_source));
  console.log("granted_at=" + field(entitlement && entitlement.granted_at));

  const orderRes = await service
    .from("orders")
    .select(
      "id, status, order_kind, target_access_level, amount_minor, currency, created_at, paid_at, practice_id, practice_slug_snapshot",
    )
    .eq("user_id", profile.id)
    .eq("practice_id", practice.id)
    .eq("order_kind", "course_upgrade")
    .order("created_at", { ascending: false })
    .limit(10);
  const orders = Array.isArray(orderRes.data) ? orderRes.data : [];
  console.log("order_query_error=" + errorText(orderRes.error));
  console.log("course_upgrade_order_count=" + orders.length);
  for (const order of orders) {
    console.log(
      [
        "ORDER",
        "id=" + field(order.id),
        "status=" + field(order.status),
        "order_kind=" + field(order.order_kind),
        "target_access_level=" + field(order.target_access_level),
        "amount_minor=" + field(order.amount_minor),
        "currency=" + field(order.currency),
        "created_at=" + field(order.created_at),
        "paid_at=" + field(order.paid_at),
        "practice_slug_snapshot=" + field(order.practice_slug_snapshot),
      ].join(" "),
    );
  }

  const orderIds = orders.map((row) => row.id).filter(Boolean);
  if (orderIds.length === 0) {
    console.log("payment_query_error=none");
    console.log("course_upgrade_payment_count=0");
    console.log("DB_CORRELATION=OK");
    clearTimeout(timer);
    return;
  }

  const paymentRes = await service
    .from("payments")
    .select(
      "id, order_id, status, provider, amount_minor, currency, created_at, confirmed_at, failed_at, provider_payment_id, provider_metadata",
    )
    .in("order_id", orderIds)
    .order("created_at", { ascending: false })
    .limit(20);
  const payments = Array.isArray(paymentRes.data) ? paymentRes.data : [];
  console.log("payment_query_error=" + errorText(paymentRes.error));
  console.log("course_upgrade_payment_count=" + payments.length);
  for (const payment of payments) {
    const meta = metadataInfo(payment.provider_metadata);
    console.log(
      [
        "PAYMENT",
        "id=" + field(payment.id),
        "order_id=" + field(payment.order_id),
        "status=" + field(payment.status),
        "provider=" + field(payment.provider),
        "amount_minor=" + field(payment.amount_minor),
        "currency=" + field(payment.currency),
        "created_at=" + field(payment.created_at),
        "confirmed_at=" + field(payment.confirmed_at),
        "failed_at=" + field(payment.failed_at),
        "has_provider_payment_id=" + yesNo(Boolean(payment.provider_payment_id)),
        "has_provider_metadata=" + yesNo(meta.present),
        "has_payment_url=" + yesNo(meta.hasPaymentUrl),
        "has_checkout_token=" + yesNo(meta.hasCheckoutToken),
        "metadata_key_count=" + meta.keyCount,
        "metadata_keys=" + field(meta.keys),
      ].join(" "),
    );
  }
  console.log("DB_CORRELATION=OK");
  clearTimeout(timer);
})().catch((err) => {
  clearTimeout(timer);
  printDeferred("probe_error");
  console.log("probe_error=" + errorText(err));
});
JS
  set +e
  output="$(
    unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
    export NODE_ENV=production
    export NODE_PATH="${dir}/node_modules${NODE_PATH:+:${NODE_PATH}}"
    cd "${dir}"
    node "${probe}" "${dir}" "${QA_COURSE_SLUG}" "${QA_AUTHOR_SLUG}" "${QA_LISTENER_EMAIL}" 2>/dev/null
  )"
  code=$?
  set -e
  rm -f "${probe}"
  output="$(printf '%s\n' "${output}" | redact_stream)"
  if [[ -n "${output}" ]]; then
    printf '%s\n' "${output}"
  fi
  if [[ "${output}" != *DB_CORRELATION=* ]]; then
    echo "DB_CORRELATION=DEFERRED"
    echo "db_reason=probe_silent_or_failed exit=${code}"
  fi
  return 0
}

run_course_upgrade_diag() {
  local current_real=""
  local pm2_safe=""
  local log_dirs=""
  local path=""
  local dir=""

  section "COURSE_UPGRADE_DIAG"
  echo "mode=${MODE}"
  echo "confirm=OPS_COURSE_UPGRADE_DIAG"
  echo "audiolad_deploy=NOT_INVOKED"
  echo "CUTOVER=NO"
  echo "checkout_post=NOT_INVOKED"
  echo "tochka_calls=NOT_INVOKED"
  echo "entitlement_writes=NOT_INVOKED"
  echo "ssh_user=$(id -un)"
  echo "priority_window_start=${PRIORITY_START}"
  echo "priority_window_end=${PRIORITY_END}"
  echo "qa_course_slug=${QA_COURSE_SLUG}"
  echo "qa_author_slug=${QA_AUTHOR_SLUG}"
  echo "qa_listener=hardcoded_redacted"

  if [[ -n "${TARGET_SHA}" || -n "${ORIGIN_MAIN_SHA}" ]]; then
    section "REQUESTED_SHAS"
    echo "workflow_target_sha=${TARGET_SHA}"
    echo "workflow_origin_main_sha=${ORIGIN_MAIN_SHA}"
  fi

  section "PRODUCTION_RELEASE"
  if current_real="$(readlink -f "${CURRENT_LINK}")" && [[ -n "${current_real}" ]]; then
    echo "current_link=${CURRENT_LINK}"
    echo "current_realpath=${current_real}"
    echo "CURRENT RELEASE=$(basename "${current_real}")"
  else
    echo "current_link=${CURRENT_LINK}"
    echo "current_realpath=BROKEN"
    echo "CURRENT RELEASE=UNKNOWN"
  fi
  if [[ -r "${DEPLOY_COMMIT_FILE}" ]]; then
    echo -n "deploy_commit="
    tr -d '[:space:]' < "${DEPLOY_COMMIT_FILE}"
    echo
  else
    echo "deploy_commit_unreadable path=${DEPLOY_COMMIT_FILE}"
  fi
  echo "shared_env_path=${SHARED_ENV_PRODUCTION} exists=$([[ -e "${SHARED_ENV_PRODUCTION}" ]] && echo YES || echo NO)"
  echo "note=shared_env_production_loaded_via_current_loadEnvConfig"
  echo "note=no_tokens_no_payment_url_no_env_values"

  section "PUBLIC_HEALTH_BUILD"
  curl -fsS --max-time 8 "${AUDIOLAD_COURSE_UPGRADE_DIAG_HEALTH_URL:-https://audiolad.ru/api/health/build}" 2>&1 | redact_stream || echo "health_build_fetch_failed"

  section "PM2_LAYOUT"
  echo "env_PM2_HOME=${PM2_HOME:-unset}"
  echo "home_pm2=${HOME}/.pm2"
  if command -v pm2 >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    set +e
    pm2_safe="$(pm2 jlist 2>/dev/null | print_pm2_layout)"
    set -e
    if [[ -n "${pm2_safe}" ]]; then
      printf '%s\n' "${pm2_safe}" | redact_stream
    else
      echo "pm2_jlist_failed"
    fi
  else
    echo "pm2_or_python3_not_found"
  fi

  log_dirs="$(
    {
      printf '%s\n' "${PM2_HOME:-}/logs"
      printf '%s\n' "${HOME}/.pm2/logs"
      printf '%s\n' "/home/deploy/.pm2/logs"
      printf '%s\n' "/root/.pm2/logs"
      printf '%s\n' "${pm2_safe}" | awk -F= '/^(out_log|error_log|pid_path)=/{print substr($0, index($0,"=")+1)}' \
        | while IFS= read -r path; do
            [[ "${path}" == /* ]] || continue
            dirname "${path}"
          done
    } | awk 'NF && $0 ~ /^\// && $0 != "/logs" {print}' | collect_unique_paths
  )"

  section "PM2_LOG_DIRS"
  if [[ -z "${log_dirs}" ]]; then
    echo "log_dirs=none"
  else
    while IFS= read -r dir; do
      if [[ -d "${dir}" ]]; then
        echo "log_dir path=${dir} exists=YES readable=$([[ -r "${dir}" ]] && echo YES || echo NO)"
      else
        echo "log_dir path=${dir} exists=NO readable=NO"
      fi
    done <<< "${log_dirs}"
  fi

  section "LOG_CANDIDATES"
  {
    printf '%s\n' "${pm2_safe}" | awk -F= '/^(out_log|error_log)=/{print substr($0, index($0,"=")+1)}'
    while IFS= read -r dir; do
      [[ -d "${dir}" ]] || continue
      # Active, orphaned, and rotated names for both blue/green slots plus
      # any other discovered audiolad-p30xx files. Globs stay read-only.
      shopt -s nullglob
      for path in \
        "${dir}"/audiolad-p3000*out* \
        "${dir}"/audiolad-p3000*error* \
        "${dir}"/audiolad-p3001*out* \
        "${dir}"/audiolad-p3001*error* \
        "${dir}"/audiolad-p30*-out* \
        "${dir}"/audiolad-p30*-error* \
        "${dir}"/audiolad-p3000*.log* \
        "${dir}"/audiolad-p3001*.log*
      do
        printf '%s\n' "${path}"
      done
      shopt -u nullglob
    done <<< "${log_dirs}"
  } | collect_unique_paths | while IFS= read -r path; do
    [[ "${path}" == /* ]] || continue
    kind="discovered"
    case "${path}" in
      *audiolad-p3000*) kind="p3000" ;;
      *audiolad-p3001*) kind="p3001" ;;
      *audiolad-p30*) kind="p30xx" ;;
    esac
    case "${path}" in
      *.log.[0-9]*|*.log.[0-9]*.gz|*.log.*[0-9]*) kind="${kind}_rotated" ;;
    esac
    if ! printf '%s\n' "${pm2_safe}" | grep -F -q -- "${path}"; then
      kind="${kind}_orphaned_or_unlisted"
    else
      kind="${kind}_active"
    fi
    scan_candidate "${path}" "${kind}"
  done

  section "JOURNAL_OPTIONAL"
  echo "note=app output usually goes to PM2 files; journal is optional fallback"
  if command -v journalctl >/dev/null 2>&1; then
    local journal_helper=""
    journal_helper="$(mktemp /tmp/audiolad-course-upgrade-journal.XXXXXX.py)"
    cat >"${journal_helper}" <<'PY'
import re, sys
pattern = re.compile(sys.argv[1])
count = 0
for line in sys.stdin:
    if pattern.search(line):
        count += 1
        text = line.rstrip()[:400]
        print("JOURNAL_MATCH %s" % text)
        if count >= 40:
            break
print("journal_priority_match_count=%s" % count)
PY
    section "JOURNAL_PRIORITY_MATCHES"
    set +e
    journalctl --no-pager --since "${PRIORITY_START}" --until "${PRIORITY_END}" -n 400 2>/dev/null \
      | python3 "${journal_helper}" "${SEARCH_PATTERN}" \
      | redact_stream
    local journal_code=${PIPESTATUS[0]}
    set -e
    rm -f "${journal_helper}"
    if [[ "${journal_code}" -ne 0 ]]; then
      echo "journal_match_scan_blocked_or_empty exit=${journal_code}"
    fi
  else
    echo "journalctl_not_found"
  fi

  section "DB_CORRELATION"
  echo "mode=read_only"
  echo "note=hardcoded QA listener + kody course; email never printed"
  echo "note=no order/payment/entitlement writes"
  unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
  run_course_upgrade_db_probe

  section "COURSE_UPGRADE_DIAG_END"
  echo "CUTOVER = NO"
  echo "audiolad_deploy = NOT_INVOKED"
  echo "checkout_post = NOT_INVOKED"
  echo "tochka_calls = NOT_INVOKED"
  echo "entitlement_writes = NOT_INVOKED"
  echo "MODE = read_only_course_upgrade_diag"
  return 0
}

run_course_upgrade_diag
