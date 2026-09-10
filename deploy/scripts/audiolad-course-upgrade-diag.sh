#!/usr/bin/env bash
# Read-only course-upgrade / L2 checkout diagnostic for operators / GHA
# confirm=OPS_COURSE_UPGRADE_DIAG. This file is the sole implementation.
# Never invokes audiolad-deploy / deploy.sh, never does nginx or
# current/previous symlink cutover, never restarts PM2, never POSTs
# checkout, never calls Tochka, never writes orders / payments /
# entitlements / DB / Storage. No arbitrary remote command input.
# Auto-discovers production audiolad-p30xx PM2 layout (does not assume only
# p3000 or only p3001). Proves live web PID from public /api/health/build
# only (positive integer; safe process fields; parent chain <= 6). Distinguishes
# PM2/log-dir states PRESENT_READABLE / PRESENT_NOT_READABLE / ABSENT_PROVEN /
# UNKNOWN_PERMISSION_DENIED. Never treats /root/.pm2/logs exists=NO as proof
# of absence when /root is not traversable. Never switches an unreadable
# root PM2 home into the pm2 command unless that home is PRESENT_READABLE.
# Privileged logdiag wrapper is Draft
# only and is not installed by this job. Inspects active logs, rotated .log.*,
# .gz, and orphaned logs of deleted PM2 apps. Optional read-only DB
# correlation uses current release loadEnvConfig + supabase-js service role.
# Do not source .env.production in this shell. Never print env values, JWT,
# tokens, payment_url, Authorization, cookies, emails, user_id, or
# service-role material. Log scan is streaming and memory-bounded.
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

if ! declare -F redact_stream >/dev/null 2>&1; then
  redact_stream() {
    sed -E \
      -e 's/(GETCOURSE_API_KEY=).*/\1***/g' \
      -e 's/(GETCOURSE_CALLBACK_SECRET=).*/\1***/g' \
      -e 's/(SUPABASE_SERVICE_ROLE_KEY=).*/\1***/g' \
      -e 's/(TOCHKA_[A-Z0-9_]+=).*/\1***/g' \
      -e 's/(Authorization:[[:space:]]*).*/\1[redacted-authorization]/Ig' \
      -e 's/(Bearer[[:space:]]+)[A-Za-z0-9._~+/-]+=*/\1[redacted-token]/g' \
      -e 's/has_checkout_token=/__SAFE_HAS_CHECKOUT_FLAG=/g' \
      -e 's/has_payment_url=/__SAFE_HAS_PAYMENT_URL=/g' \
      -e 's/has_provider_metadata=/__SAFE_HAS_PROVIDER_METADATA=/g' \
      -e 's/has_provider_payment_id=/__SAFE_HAS_PROVIDER_PAYMENT_ID=/g' \
      -e 's/(^|[^[:alnum:]_])((access_token|refresh_token|checkout_token|provider_token|[A-Za-z0-9_]*_token|token)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?)[^[:space:],;"'"'"'}]+/\1\2[redacted-token]/Ig' \
      -e 's/(^|[^[:alnum:]_])((payment_url)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?)[^[:space:]"'"'"']+/\1\2[redacted-payment-url]/Ig' \
      -e 's/(^|[^[:alnum:]_])((user_id)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?)[^[:space:],;"'"'"'}]+/\1\2[redacted-user-id]/Ig' \
      -e 's/(^|[^[:alnum:]_])((cookie|cookies)["'"'"']?[[:space:]]*[:=][[:space:]]*)[^[:space:]]+/\1\2[redacted-cookie]/Ig' \
      -e 's/(^|[^[:alnum:]_])((password|passwd|secret|api_key|service_role)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?)[^[:space:]"'"'"']+/\1\2[redacted-secret]/Ig' \
      -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g' \
      -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[redacted-jwt]/g' \
      -e 's#https?://[^[:space:]\"'"'"']+#[redacted-url]#g' \
      -e 's/__SAFE_HAS_CHECKOUT_FLAG=/has_checkout_token=/g' \
      -e 's/__SAFE_HAS_PAYMENT_URL=/has_payment_url=/g' \
      -e 's/__SAFE_HAS_PROVIDER_METADATA=/has_provider_metadata=/g' \
      -e 's/__SAFE_HAS_PROVIDER_PAYMENT_ID=/has_provider_payment_id=/g'
  }
fi

if ! declare -F section >/dev/null 2>&1; then
  section() {
    printf '\n===== %s =====\n' "$1"
  }
fi

# Test seams only. Production uses /proc, real sudo, and the fixed wrapper path.
PROC_ROOT="${AUDIOLAD_COURSE_UPGRADE_DIAG_PROC_ROOT:-/proc}"
PRIVILEGED_WRAPPER="${AUDIOLAD_COURSE_UPGRADE_LOGDIAG_WRAPPER:-/usr/local/sbin/audiolad-course-upgrade-logdiag}"
SUDO_BIN="${AUDIOLAD_COURSE_UPGRADE_DIAG_SUDO:-sudo}"
MAX_PARENTS=6
PID_MAX=4194304

classify_path_state() {
  local helper=""
  helper="$(mktemp /tmp/audiolad-course-upgrade-path.XXXXXX.py)"
  cat >"${helper}" <<'PY'
import errno
import os
import stat
import sys

def classify(path):
    path = os.path.abspath(path)
    try:
        st = os.stat(path)
    except FileNotFoundError:
        parent = os.path.dirname(path)
        if parent == path:
            return "ABSENT_PROVEN"
        parent_state = classify(parent)
        if parent_state in ("PRESENT_READABLE", "ABSENT_PROVEN"):
            return "ABSENT_PROVEN"
        return "UNKNOWN_PERMISSION_DENIED"
    except PermissionError:
        return "UNKNOWN_PERMISSION_DENIED"
    except OSError as err:
        if err.errno in (errno.EACCES, errno.EPERM):
            return "UNKNOWN_PERMISSION_DENIED"
        return "UNKNOWN_PERMISSION_DENIED"
    readable = os.access(path, os.R_OK)
    if stat.S_ISDIR(st.st_mode):
        if readable and os.access(path, os.X_OK):
            return "PRESENT_READABLE"
        return "PRESENT_NOT_READABLE"
    if readable:
        return "PRESENT_READABLE"
    return "PRESENT_NOT_READABLE"

print(classify(sys.argv[1]))
PY
  local state=""
  set +e
  state="$(python3 "${helper}" "$1" 2>/dev/null)"
  set -e
  rm -f "${helper}"
  if [[ -z "${state}" ]]; then
    echo "UNKNOWN_PERMISSION_DENIED"
  else
    printf '%s\n' "${state}"
  fi
}

extract_health_pid() {
  local helper=""
  helper="$(mktemp /tmp/audiolad-course-upgrade-pid.XXXXXX.py)"
  cat >"${helper}" <<'PY'
import json
import re
import sys

PID_MAX = 4194304
raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception:
    print("WEB_PID_STATUS=REJECTED")
    print("web_pid_reason=health_json_unreadable")
    raise SystemExit(0)

if not isinstance(data, dict):
    print("WEB_PID_STATUS=REJECTED")
    print("web_pid_reason=health_json_not_object")
    raise SystemExit(0)

pid = data.get("pid")
if isinstance(pid, bool) or pid is None:
    print("WEB_PID_STATUS=REJECTED")
    print("web_pid_reason=pid_missing_or_not_integer")
    raise SystemExit(0)

if isinstance(pid, int):
    value = pid
elif isinstance(pid, str) and re.fullmatch(r"[1-9][0-9]{0,9}", pid):
    value = int(pid)
else:
    print("WEB_PID_STATUS=REJECTED")
    print("web_pid_reason=pid_not_positive_integer")
    raise SystemExit(0)

if value <= 0 or value > PID_MAX:
    print("WEB_PID_STATUS=REJECTED")
    print("web_pid_reason=pid_out_of_range")
    raise SystemExit(0)

print("WEB_PID_STATUS=OK")
print("web_pid=%s" % value)
PY
  local out=""
  set +e
  out="$(python3 "${helper}" 2>/dev/null)"
  set -e
  rm -f "${helper}"
  if [[ -z "${out}" ]]; then
    echo "WEB_PID_STATUS=REJECTED"
    echo "web_pid_reason=pid_parser_failed"
  else
    printf '%s\n' "${out}"
  fi
}

print_safe_process_chain() {
  local helper=""
  helper="$(mktemp /tmp/audiolad-course-upgrade-proc.XXXXXX.py)"
  cat >"${helper}" <<'PY'
import os
import pwd
import re
import sys
from datetime import datetime, timezone

proc_root = sys.argv[1]
raw_pid = sys.argv[2]
max_parents = int(sys.argv[3])
pid_max = int(sys.argv[4])

if not re.fullmatch(r"[1-9][0-9]{0,9}", raw_pid):
    print("WEB_PROCESS_STATUS=REJECTED")
    print("web_pid_reason=pid_not_positive_integer")
    raise SystemExit(0)

pid = int(raw_pid)
if pid <= 0 or pid > pid_max:
    print("WEB_PROCESS_STATUS=REJECTED")
    print("web_pid_reason=pid_out_of_range")
    raise SystemExit(0)


def read_text(path):
    with open(path, "r", errors="replace") as handle:
        return handle.read()


def euser_for(uid):
    try:
        return pwd.getpwuid(uid).pw_name
    except (KeyError, OverflowError, OSError):
        return "uid_%s" % uid


def parse_start(pid_s):
    try:
        stat_raw = read_text(os.path.join(proc_root, pid_s, "stat"))
        close = stat_raw.rfind(")")
        if close < 0:
            return "unknown"
        fields = stat_raw[close + 1 :].split()
        if len(fields) < 20:
            return "unknown"
        start_ticks = int(fields[19])
        btime = None
        for line in read_text(os.path.join(proc_root, "stat")).splitlines():
            if line.startswith("btime "):
                btime = int(line.split()[1])
                break
        hz = os.sysconf("SC_CLK_TCK") or 100
        if btime is None:
            return "unknown"
        epoch = btime + (start_ticks / float(hz))
        return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return "unknown"


def safe_fields(pid_s):
    status_path = os.path.join(proc_root, pid_s, "status")
    try:
        status = read_text(status_path)
    except OSError as err:
        return None, "unreadable:%s" % err.__class__.__name__
    name = ""
    ppid = 0
    euid = None
    for line in status.splitlines():
        if line.startswith("Name:"):
            name = re.sub(r"[\r\n]+", " ", line.split(":", 1)[1].strip())[:64]
        elif line.startswith("PPid:"):
            try:
                ppid = int(line.split(":", 1)[1].strip())
            except ValueError:
                ppid = 0
        elif line.startswith("Uid:"):
            parts = line.split(":", 1)[1].split()
            try:
                euid = int(parts[1] if len(parts) > 1 else parts[0])
            except ValueError:
                euid = None
    comm = name
    try:
        comm = read_text(os.path.join(proc_root, pid_s, "comm")).strip().split("\n", 1)[0][:64]
    except OSError:
        pass
    exe_name = "unknown"
    try:
        exe = os.readlink(os.path.join(proc_root, pid_s, "exe"))
        exe_name = os.path.basename(exe).replace("\n", " ")[:64] or "unknown"
    except OSError:
        pass
    if euid is None:
        euser = "unknown"
        uid_s = "unknown"
    else:
        euser = euser_for(euid)
        uid_s = str(euid)
    return {
        "pid": pid_s,
        "ppid": str(ppid),
        "euser": euser,
        "uid": uid_s,
        "comm": comm or name or "unknown",
        "exe": exe_name,
        "start": parse_start(pid_s),
        "ppid_int": ppid,
        "euser_raw": euser,
        "uid_raw": uid_s,
    }, None


print("WEB_PROCESS_STATUS=OK")
print("note=safe fields only; environ and cmdline are not read")
current = str(pid)
seen = set()
fields, err = safe_fields(current)
if fields is None:
    print("WEB_PROCESS_STATUS=UNREADABLE")
    print("web_process_reason=%s" % err)
    raise SystemExit(0)

print(
    "WEB_PROCESS pid=%s ppid=%s euser=%s uid=%s comm=%s exe=%s start=%s"
    % (
        fields["pid"],
        fields["ppid"],
        fields["euser"],
        fields["uid"],
        fields["comm"],
        fields["exe"],
        fields["start"],
    )
)
print("LIVE_WEB_OWNER=%s" % fields["euser"])
print("LIVE_WEB_UID=%s" % fields["uid"])
if fields["uid"] == "0" or fields["euser"] == "root":
    derived_home = "/root/.pm2"
else:
    derived_home = "/home/%s/.pm2" % fields["euser"]
print("LIVE_WEB_PM2_HOME=%s" % derived_home)

parent_count = 0
nxt = fields["ppid_int"]
seen.add(current)
while nxt > 0 and parent_count < max_parents:
    parent_s = str(nxt)
    if parent_s in seen:
        print("parent_chain_stop=cycle")
        break
    parent, parent_err = safe_fields(parent_s)
    parent_count += 1
    if parent is None:
        print("PARENT depth=%s pid=%s unreadable=%s" % (parent_count, parent_s, parent_err))
        break
    print(
        "PARENT depth=%s pid=%s ppid=%s euser=%s uid=%s comm=%s exe=%s start=%s"
        % (
            parent_count,
            parent["pid"],
            parent["ppid"],
            parent["euser"],
            parent["uid"],
            parent["comm"],
            parent["exe"],
            parent["start"],
        )
    )
    seen.add(parent_s)
    nxt = parent["ppid_int"]

print("PARENT_CHAIN_COUNT=%s" % parent_count)
print("PARENT_CHAIN_BOUND=%s" % max_parents)
PY
  local out=""
  set +e
  out="$(python3 "${helper}" "${PROC_ROOT}" "$1" "${MAX_PARENTS}" "${PID_MAX}" 2>/dev/null)"
  set -e
  rm -f "${helper}"
  if [[ -z "${out}" ]]; then
    echo "WEB_PROCESS_STATUS=UNREADABLE"
    echo "web_process_reason=proc_parser_failed"
  else
    printf '%s\n' "${out}"
  fi
}

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
import gzip
import re
import sys
from collections import deque
from datetime import datetime, timezone

path = sys.argv[1]
priority_start = sys.argv[2]
priority_end = sys.argv[3]
PRIORITY_MAX = 40
RECENT_MAX = 20
LOOKAHEAD = 16

EVENT_RE = re.compile(
    r"(?<![A-Za-z0-9_])("
    r"course_upgrade_failed|"
    r"create_payment_tochka_error|"
    r"create_payment_tochka_http_error|"
    r"course_upgrade_auth_error|"
    r"course_upgrade_order_invalid_row|"
    r"course_upgrade_order_reload_error|"
    r"create_payment_metadata_update_error|"
    r"provider_checkout_failed|"
    r"createTochkaPaymentOperation|"
    r"startTochkaCheckoutForPendingOrder"
    r")(?![A-Za-z0-9_])"
)
FIELD_VALUE_PREFIX_RE = re.compile(
    r"(FAILED_STAGE|ACTUAL_API_ERROR|ACTUAL_HTTP_STATUS)\s*[:=]\s*"
)
WINDOW_RE = re.compile(
    r"20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?"
)
FIELD_RE = re.compile(
    r"(FAILED_STAGE|ACTUAL_API_ERROR|ACTUAL_HTTP_STATUS|order_id|practice_id|target_access_level)"
    r"""["']?\s*[:=]\s*["']?([^\s,"'}]+)"""
)
HTTP_ERR_RE = re.compile(
    r"create_payment_tochka_http_error(?:\s+|:)(\d{3})(?:\s+([A-Za-z0-9_.-]{1,64}))?"
)
STAGE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,79}$")
ERROR_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,79}$")
STATUS_RE = re.compile(r"^\d{3}$")
UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
LEVEL_RE = re.compile(r"^-?\d{1,4}$")
CODE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")


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


def classify(line):
    match = WINDOW_RE.search(line)
    if not match or start is None or end is None:
        return "unknown", ""
    ts = parse_ts(match.group(0))
    if ts is None:
        return "unknown", match.group(0)
    if start <= ts <= end:
        return "priority", match.group(0)
    return "recent", match.group(0)


def sanitize(key, value):
    raw = value.strip().strip("'\"")
    if key == "FAILED_STAGE":
        return raw if STAGE_RE.fullmatch(raw) else None
    if key == "ACTUAL_API_ERROR":
        return raw if ERROR_RE.fullmatch(raw) else None
    if key == "ACTUAL_HTTP_STATUS":
        return raw if STATUS_RE.fullmatch(raw) else None
    if key in ("order_id", "practice_id"):
        return raw.lower() if UUID_RE.fullmatch(raw) else None
    if key == "target_access_level":
        return raw if LEVEL_RE.fullmatch(raw) else None
    if key == "provider_http_status":
        return raw if STATUS_RE.fullmatch(raw) else None
    if key == "provider_error_code":
        return raw if CODE_RE.fullmatch(raw) else None
    return None


def extract_allowlisted(line, fields):
    for match in FIELD_RE.finditer(line):
        cleaned = sanitize(match.group(1), match.group(2))
        if cleaned is not None:
            fields[match.group(1)] = cleaned
    http = HTTP_ERR_RE.search(line)
    if http:
        status = sanitize("provider_http_status", http.group(1))
        if status:
            fields["provider_http_status"] = status
        if http.group(2):
            code = sanitize("provider_error_code", http.group(2))
            if code:
                fields["provider_error_code"] = code


def detect_event(line):
    match = EVENT_RE.search(line)
    if not match:
        return None
    prefix = line[: match.start()]
    if FIELD_VALUE_PREFIX_RE.search(prefix):
        return None
    return match.group(1)


def is_object_close(line):
    stripped = line.strip()
    return stripped in ("}", "};", "},") or stripped.endswith("}")


def open_log(log_path):
    if log_path.endswith(".gz"):
        return gzip.open(log_path, "rt", errors="replace")
    return open(log_path, "r", errors="replace")


def emit(bucket, window, lineno, event, ts, fields):
    item = {
        "window": window,
        "line": lineno,
        "event": event or "unknown",
        "ts": ts,
        "fields": dict(fields),
    }
    bucket.append(item)


priority = deque(maxlen=PRIORITY_MAX)
recent = deque(maxlen=RECENT_MAX)
match_count = 0
priority_count = 0
other_count = 0

handle = None
try:
    handle = open_log(path)
except gzip.BadGzipFile as err:
    print("compressed_log_error path=%s" % path)
    print("scan_error_class=%s" % err.__class__.__name__)
    raise SystemExit(0)
except OSError as err:
    kind = "compressed_log_error" if path.endswith(".gz") else "log_unreadable"
    print("%s path=%s" % (kind, path))
    print("scan_error_class=%s" % err.__class__.__name__)
    raise SystemExit(0)

try:
    lineno = 0
    pending = None
    while True:
        if pending is not None:
            raw = pending
            pending = None
        else:
            raw = handle.readline()
            if raw == "":
                break
        lineno += 1
        line = raw.rstrip("\n")
        event = detect_event(line)
        if event is None:
            continue
        fields = {}
        extract_allowlisted(line, fields)
        window, ts = classify(line)
        if (event == "course_upgrade_failed" or "{" in line) and not is_object_close(line):
            for _ in range(LOOKAHEAD):
                nxt = handle.readline()
                if nxt == "":
                    break
                lineno += 1
                nxt_line = nxt.rstrip("\n")
                extract_allowlisted(nxt_line, fields)
                if is_object_close(nxt_line):
                    break
                nxt_event = detect_event(nxt_line)
                if nxt_event and WINDOW_RE.match(nxt_line.lstrip()):
                    pending = nxt
                    lineno -= 1
                    break
        match_count += 1
        if window == "priority":
            priority_count += 1
            emit(priority, window, lineno, event, ts, fields)
        else:
            other_count += 1
            emit(recent, window, lineno, event, ts, fields)
except (OSError, EOFError, gzip.BadGzipFile) as err:
    kind = "compressed_log_error" if path.endswith(".gz") else "log_unreadable"
    print("%s path=%s" % (kind, path))
    print("scan_error_class=%s" % err.__class__.__name__)
    raise SystemExit(0)
finally:
    if handle is not None:
        try:
            handle.close()
        except Exception:
            pass

print("match_count=%s" % match_count)
print("priority_match_count=%s" % priority_count)
print("other_match_count=%s" % other_count)
print("printed_match_count=%s" % (len(priority) + len(recent)))
wanted = (
    "FAILED_STAGE",
    "ACTUAL_API_ERROR",
    "ACTUAL_HTTP_STATUS",
    "provider_http_status",
    "provider_error_code",
    "order_id",
    "practice_id",
    "target_access_level",
)
for item in list(priority) + list(recent):
    parts = [
        "SAFE_SUMMARY",
        "window=%s" % item["window"],
        "line=%s" % item["line"],
        "event=%s" % item["event"],
    ]
    if item["ts"]:
        parts.append("ts=%s" % item["ts"])
    for key in wanted:
        if key in item["fields"]:
            parts.append("%s=%s" % (key, item["fields"][key]))
    print(" ".join(parts))
PY
  python3 "${helper}" "$1" "${PRIORITY_START}" "${PRIORITY_END}"
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
    echo "scanner_unavailable reason=python3_not_found"
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

const SAFE_METADATA_KEYS = new Set([
  "payment_url",
  "payment_link_id",
  "provider_status",
  "create_response",
  "checkout_token",
  "error",
]);

function supabaseUrlHost(raw) {
  try {
    return raw ? new URL(raw).host : "";
  } catch {
    return "";
  }
}

function field(value) {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").slice(0, 80);
}

function yesNo(value) {
  return value ? "YES" : "NO";
}

function metadataInfo(raw) {
  const meta = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  const keys = meta ? Object.keys(meta) : [];
  const safeKeys = keys.filter((name) => SAFE_METADATA_KEYS.has(name)).sort();
  return {
    present: Boolean(meta) && keys.length > 0,
    keyCount: keys.length,
    keys: safeKeys.join(","),
    unknownKeyCount: keys.length - safeKeys.length,
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
  const text = String(err.message || err.code || "error");
  if (/token|secret|password|bearer|eyJ|service.role|payment_url/i.test(text)) {
    return "redacted_error";
  }
  return field(text);
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
  const entitlementPresent = Boolean(entitlement);
  console.log("entitlement_query_error=" + errorText(entitlementRes.error));
  console.log("entitlement_present=" + yesNo(entitlementPresent));
  console.log("access_level=" + field(entitlement && entitlement.access_level));
  console.log("access_source=" + field(entitlement && entitlement.access_source));
  console.log("canonical_user_practices=" + (entitlementPresent ? "PRESENT" : "MISSING"));

  const baseOrderRes = await service
    .from("orders")
    .select("id, status, order_kind, target_access_level, created_at, paid_at")
    .eq("user_id", profile.id)
    .eq("practice_id", practice.id)
    .eq("order_kind", "product_purchase")
    .order("created_at", { ascending: false })
    .limit(10);
  const baseOrders = Array.isArray(baseOrderRes.data) ? baseOrderRes.data : [];
  const paidBaseOrders = baseOrders.filter((row) => row && row.status === "paid" && row.paid_at);
  console.log("base_order_query_error=" + errorText(baseOrderRes.error));
  console.log("paid_base_order_count=" + paidBaseOrders.length);

  const linkRes = await service
    .from("practice_access_links")
    .select("id, status, target_access_level, redeemed_at, practice_id")
    .eq("practice_id", practice.id)
    .eq("redeemed_by_user_id", profile.id)
    .eq("status", "redeemed")
    .order("redeemed_at", { ascending: false })
    .limit(10);
  const links = Array.isArray(linkRes.data) ? linkRes.data : [];
  const l1Links = links.filter((row) => {
    const level = Number(row && row.target_access_level);
    return Number.isFinite(level) && level >= 1;
  });
  console.log("access_link_query_error=" + errorText(linkRes.error));
  console.log("redeemed_access_link_count=" + l1Links.length);
  console.log("note=no dedicated entitlement audit/history table; finance_audit_log is payment-only and not queried");

  const mechanisms = [];
  if (paidBaseOrders.length > 0) mechanisms.push("purchase");
  if (l1Links.length > 0) mechanisms.push("access_link");
  const historical = mechanisms.length > 0;
  const provenTimes = []
    .concat(paidBaseOrders.map((row) => row.paid_at).filter(Boolean))
    .concat(l1Links.map((row) => row.redeemed_at).filter(Boolean))
    .map((value) => field(value))
    .filter(Boolean)
    .sort();
  console.log("HISTORICAL_L1_EVIDENCE=" + (historical ? "YES" : "NO"));
  console.log("HISTORICAL_L1_MECHANISMS=" + (mechanisms.join(",") || "none"));
  console.log("HISTORICAL_L1_LAST_PROVEN_AT=" + (provenTimes.length ? provenTimes[provenTimes.length - 1] : "none"));
  if (entitlementPresent) {
    console.log("ENTITLEMENT_STATE_MISMATCH=NO");
  } else if (historical) {
    console.log("ENTITLEMENT_STATE_MISMATCH=YES");
  } else {
    console.log("ENTITLEMENT_STATE_MISMATCH=UNPROVEN");
  }

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
        "metadata_unknown_key_count=" + meta.unknownKeyCount,
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
  echo "note=no_tokens_no_payment_url_no_env_values_no_user_id"

  section "PUBLIC_HEALTH_BUILD"
  local health_json=""
  local health_code=0
  set +e
  health_json="$(curl -fsS --max-time 8 "${AUDIOLAD_COURSE_UPGRADE_DIAG_HEALTH_URL:-https://audiolad.ru/api/health/build}" 2>/dev/null)"
  health_code=$?
  set -e
  if [[ "${health_code}" -ne 0 || -z "${health_json}" ]]; then
    echo "health_build_fetch_failed"
    health_json=""
  else
    printf '%s\n' "${health_json}" | redact_stream
  fi

  section "WEB_PROCESS"
  echo "note=PID taken only from public /api/health/build JSON field pid"
  echo "note=environ and cmdline are never read or printed"
  local web_pid=""
  local web_pid_status="REJECTED"
  local live_pm2_home=""
  if [[ -z "${health_json}" ]]; then
    echo "WEB_PID_STATUS=REJECTED"
    echo "web_pid_reason=health_unavailable"
  elif command -v python3 >/dev/null 2>&1; then
    local pid_info=""
    pid_info="$(printf '%s\n' "${health_json}" | extract_health_pid)"
    printf '%s\n' "${pid_info}"
    if [[ "${pid_info}" == *WEB_PID_STATUS=OK* ]]; then
      web_pid="$(printf '%s\n' "${pid_info}" | awk -F= '/^web_pid=/{print substr($0, index($0,"=")+1); exit}')"
      web_pid_status="OK"
    fi
  else
    echo "WEB_PID_STATUS=REJECTED"
    echo "web_pid_reason=python3_not_found"
  fi
  if [[ "${web_pid_status}" == "OK" && -n "${web_pid}" ]]; then
    local proc_info=""
    proc_info="$(print_safe_process_chain "${web_pid}")"
    printf '%s\n' "${proc_info}"
    live_pm2_home="$(printf '%s\n' "${proc_info}" | awk -F= '/^LIVE_WEB_PM2_HOME=/{print substr($0, index($0,"=")+1); exit}')"
  else
    echo "WEB_PROCESS_STATUS=SKIPPED"
    echo "note=parent chain not walked because pid was rejected"
  fi

  section "PM2_NAMESPACE"
  echo "ssh_user=$(id -un)"
  echo "ssh_uid=$(id -u)"
  echo "env_PM2_HOME=${PM2_HOME:-unset}"
  echo "ssh_user_pm2_home=${HOME}/.pm2"
  echo "pm2_jlist_namespace=ssh_user"
  echo "note=ACTIVE_P30_COUNT below is SSH-user pm2 jlist only"
  echo "note=ACTIVE_P30_COUNT=0 may be true for this namespace and false globally if web runs under another user PM2"
  echo "note=unreadable root PM2 home is never passed to pm2"

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

  local live_pm2_state=""
  if [[ -n "${live_pm2_home}" ]]; then
    live_pm2_state="$(classify_path_state "${live_pm2_home}")"
    echo "LIVE_WEB_PM2_HOME_STATE=${live_pm2_state}"
    echo "ssh_user_pm2_home_state=$(classify_path_state "${HOME}/.pm2")"
    if [[ "${live_pm2_state}" == "PRESENT_READABLE" && "${live_pm2_home}" != "${HOME}/.pm2" && "${live_pm2_home}" != "${PM2_HOME:-}" ]]; then
      echo "note=live web PM2 home is PRESENT_READABLE and differs from SSH-user home; probing that namespace only"
      if command -v pm2 >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
        local live_pm2_safe=""
        set +e
        live_pm2_safe="$(env PM2_HOME="${live_pm2_home}" pm2 jlist 2>/dev/null | print_pm2_layout)"
        set -e
        if [[ -n "${live_pm2_safe}" ]]; then
          echo "pm2_jlist_namespace=live_web_owner"
          printf '%s\n' "${live_pm2_safe}" | redact_stream
          pm2_safe="${pm2_safe}"$'\n'"${live_pm2_safe}"
        else
          echo "live_web_pm2_jlist_failed"
        fi
      fi
    elif [[ -n "${live_pm2_state}" && "${live_pm2_state}" != "PRESENT_READABLE" ]]; then
      echo "note=live web PM2 home is not PRESENT_READABLE; not switching PM2_HOME"
    fi
  fi

  log_dirs="$(
    {
      printf '%s\n' "${PM2_HOME:-}/logs"
      printf '%s\n' "${HOME}/.pm2/logs"
      printf '%s\n' "/home/deploy/.pm2/logs"
      printf '%s\n' "/root/.pm2/logs"
      if [[ -n "${live_pm2_home}" ]]; then
        printf '%s\n' "${live_pm2_home}/logs"
      fi
      printf '%s\n' "${pm2_safe}" | awk -F= '/^(out_log|error_log|pid_path)=/{print substr($0, index($0,"=")+1)}' \
        | while IFS= read -r path; do
            [[ "${path}" == /* ]] || continue
            dirname "${path}"
          done
    } | awk 'NF && $0 ~ /^\// && $0 != "/logs" {print}' | collect_unique_paths
  )"

  section "PM2_LOG_DIRS"
  echo "note=exists=NO is not used when the SSH user cannot traverse a parent (e.g. /root)"
  echo "note=states: PRESENT_READABLE|PRESENT_NOT_READABLE|ABSENT_PROVEN|UNKNOWN_PERMISSION_DENIED"
  if [[ -z "${log_dirs}" ]]; then
    echo "log_dirs=none"
  else
    while IFS= read -r dir; do
      local dir_state=""
      dir_state="$(classify_path_state "${dir}")"
      echo "log_dir path=${dir} state=${dir_state}"
    done <<< "${log_dirs}"
  fi

  section "PM2_HOME_STATES"
  for dir in "${HOME}/.pm2" "/home/deploy/.pm2" "/root/.pm2" ${live_pm2_home:+"${live_pm2_home}"}; do
    [[ -n "${dir}" ]] || continue
    echo "pm2_home path=${dir} state=$(classify_path_state "${dir}")"
  done

  section "PRIVILEGED_LOGDIAG"
  echo "existing_web_pm2_log_read_contract=NONE"
  echo "discovery=audiolad-deploy is deploy-only; audiolad-maintenance.sh is disk cleanup; audiolad-reconcile-diagnose is GetCourse"
  echo "discovery=no existing narrow read-only sudo contract for Audiolad web PM2 logs"
  echo "wrapper_path=${PRIVILEGED_WRAPPER}"
  echo "note=Draft wrapper is not installed by this job"
  if [[ ! -e "${PRIVILEGED_WRAPPER}" ]]; then
    echo "PRIVILEGED_LOGDIAG=MISSING"
    echo "NEED_INSTALL=YES"
  elif [[ ! -x "${PRIVILEGED_WRAPPER}" ]]; then
    echo "PRIVILEGED_LOGDIAG=NOT_EXECUTABLE"
    echo "NEED_INSTALL=YES"
  elif ! command -v "${SUDO_BIN}" >/dev/null 2>&1; then
    echo "PRIVILEGED_LOGDIAG=NEED_INSTALL"
    echo "privileged_invoke=sudo_not_found"
    echo "NEED_INSTALL=YES"
  else
    local priv_out=""
    local priv_code=0
    set +e
    priv_out="$("${SUDO_BIN}" -n "${PRIVILEGED_WRAPPER}" 2>/dev/null)"
    priv_code=$?
    set -e
    if [[ "${priv_code}" -eq 0 ]]; then
      echo "PRIVILEGED_LOGDIAG=OK"
      printf '%s\n' "${priv_out}" | redact_stream
    else
      echo "PRIVILEGED_LOGDIAG=NEED_INSTALL"
      echo "privileged_invoke=denied_or_failed exit=${priv_code}"
      echo "NEED_INSTALL=YES"
    fi
  fi

  section "LOG_CANDIDATES"
  {
    printf '%s\n' "${pm2_safe}" | awk -F= '/^(out_log|error_log)=/{print substr($0, index($0,"=")+1)}'
    while IFS= read -r dir; do
      [[ -d "${dir}" ]] || continue
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
      *.gz) kind="${kind}_gz" ;;
      *.log.[0-9]*|*.log.*[0-9]*) kind="${kind}_rotated" ;;
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
  if command -v journalctl >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    local journal_tmp=""
    journal_tmp="$(mktemp /tmp/audiolad-course-upgrade-journal.XXXXXX.log)"
    set +e
    journalctl --no-pager --since "${PRIORITY_START}" --until "${PRIORITY_END}" -n 400 >"${journal_tmp}" 2>/dev/null
    local journal_code=$?
    set -e
    if [[ "${journal_code}" -eq 0 && -s "${journal_tmp}" ]]; then
      section "JOURNAL_PRIORITY_MATCHES"
      scan_log_file "${journal_tmp}" | redact_stream
    else
      echo "journal_match_scan_blocked_or_empty exit=${journal_code}"
    fi
    rm -f "${journal_tmp}"
  elif command -v journalctl >/dev/null 2>&1; then
    echo "journal_scanner_unavailable reason=python3_not_found"
  else
    echo "journalctl_not_found"
  fi

  section "DB_CORRELATION"
  echo "mode=read_only"
  echo "note=hardcoded QA listener + kody course; email and user_id never printed"
  echo "note=no order/payment/entitlement writes"
  unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY
  run_course_upgrade_db_probe

  section "COURSE_UPGRADE_DIAG_END"
  echo "CUTOVER = NO"
  echo "audiolad_deploy = NOT_INVOKED"
  echo "checkout_post = NOT_INVOKED"
  echo "tochka_calls = NOT_INVOKED"
  echo "entitlement_writes = NOT_INVOKED"
  echo "privileged_wrapper_install = NOT_INVOKED"
  echo "MODE = read_only_course_upgrade_diag"
  echo "note=live WEB_PROCESS / PM2 owner / privileged SAFE_SUMMARY stay UNKNOWN until an authorized OPS run after merge+install"
  return 0
}

run_course_upgrade_diag
