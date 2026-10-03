#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

release_dir="$tmp_dir/release"
deploy_root="$tmp_dir/deploy-root"
install_root="$tmp_dir/install"
env_file="$tmp_dir/.env.production"
fake_npm="$tmp_dir/fake-npm"
fake_systemctl="$tmp_dir/fake-systemctl"
systemctl_log="$tmp_dir/systemctl.log"

mkdir -p \
  "$release_dir/deploy/scripts" \
  "$release_dir/deploy/systemd" \
  "$release_dir/deploy/logrotate" \
  "$deploy_root" \
  "$install_root"

cp "$repo_root/deploy/scripts/run-application-email-outbox.sh" \
  "$release_dir/deploy/scripts/run-application-email-outbox.sh"
cp "$repo_root/deploy/scripts/ensure-application-email-outbox.sh" \
  "$release_dir/deploy/scripts/ensure-application-email-outbox.sh"
cp "$repo_root/deploy/systemd/audiolad-application-email-outbox.service" \
  "$release_dir/deploy/systemd/audiolad-application-email-outbox.service"
cp "$repo_root/deploy/systemd/audiolad-application-email-outbox.timer" \
  "$release_dir/deploy/systemd/audiolad-application-email-outbox.timer"
cp "$repo_root/deploy/logrotate/audiolad-application-email-outbox" \
  "$release_dir/deploy/logrotate/audiolad-application-email-outbox"
chmod 0755 "$release_dir/deploy/scripts/"*.sh
printf '{}\n' >"$release_dir/package.json"
printf '# test env only\n' >"$env_file"
ln -s "$release_dir" "$deploy_root/current"

cat >"$fake_npm" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "$*" != "run run:application-email-outbox" ]]; then
  printf 'unexpected npm command: %s\n' "$*" >&2
  exit 2
fi

case "${SCENARIO:?SCENARIO is required}" in
  success)
    printf '{"claimed":2,"sent":1,"failed":0,"suppressed":1}\n'
    ;;
  idle)
    printf '{"claimed":0,"sent":0,"failed":0,"suppressed":0}\n'
    ;;
  smtp-missing)
    printf 'authors_smtp_not_configured\n' >&2
    printf 'AUDIOLAD_SMTP_AUTHORS_PASS=super-secret author@example.test\n' >&2
    printf 'AUDIOLAD_EMAIL_UNSUBSCRIBE_SECRET=super-secret\n' >&2
    exit 1
    ;;
  *)
    printf 'unknown scenario\n' >&2
    exit 2
    ;;
esac
EOF
chmod 0755 "$fake_npm"

cat >"$fake_systemctl" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"${SYSTEMCTL_LOG:?SYSTEMCTL_LOG is required}"
if [[ "${1:-}" == "enable" && "${SYSTEMCTL_ENABLE_EXIT:-0}" != "0" ]]; then
  exit "$SYSTEMCTL_ENABLE_EXIT"
fi
if [[ "${1:-}" == "is-enabled" || "${1:-}" == "is-active" ]]; then
  exit 0
fi
exit 0
EOF
chmod 0755 "$fake_systemctl"

ensure_output="$(
  DEPLOY_TREE="$release_dir/deploy" \
  WRAPPER_DIR="$install_root/wrapper" \
  SYSTEMD_DIR="$install_root/systemd" \
  LOGROTATE_DIR="$install_root/logrotate" \
  LOG_DIR="$install_root/log" \
  SKIP_AS_ROOT=1 \
  SKIP_SYSTEMCTL=1 \
  "$release_dir/deploy/scripts/ensure-application-email-outbox.sh"
)"
grep -Fq 'application_email_outbox_installed skip_systemctl=1' <<<"$ensure_output"
cmp -s "$release_dir/deploy/scripts/run-application-email-outbox.sh" \
  "$install_root/wrapper/run-application-email-outbox.sh"
[[ -x "$install_root/wrapper/run-application-email-outbox.sh" ]]
cmp -s "$release_dir/deploy/systemd/audiolad-application-email-outbox.service" \
  "$install_root/systemd/audiolad-application-email-outbox.service"
cmp -s "$release_dir/deploy/systemd/audiolad-application-email-outbox.timer" \
  "$install_root/systemd/audiolad-application-email-outbox.timer"
cmp -s "$release_dir/deploy/logrotate/audiolad-application-email-outbox" \
  "$install_root/logrotate/audiolad-application-email-outbox"
[[ -d "$install_root/log" ]]
grep -Fq 'OnUnitActiveSec=2min' "$install_root/systemd/audiolad-application-email-outbox.timer"
grep -Fq 'TIMEOUT_SECONDS=90' "$install_root/systemd/audiolad-application-email-outbox.service"

: >"$systemctl_log"
enabled_output="$(
  DEPLOY_TREE="$release_dir/deploy" \
  WRAPPER_DIR="$install_root/wrapper" \
  SYSTEMD_DIR="$install_root/systemd" \
  LOGROTATE_DIR="$install_root/logrotate" \
  LOG_DIR="$install_root/log" \
  SKIP_AS_ROOT=1 \
  SKIP_SYSTEMCTL=0 \
  SYSTEMCTL="$fake_systemctl" \
  SYSTEMCTL_LOG="$systemctl_log" \
  SYSTEMCTL_ENABLE_EXIT=0 \
  "$release_dir/deploy/scripts/ensure-application-email-outbox.sh"
)"
grep -Fq 'application_email_outbox_timer_enabled' <<<"$enabled_output"
grep -Fxq 'daemon-reload' "$systemctl_log"
grep -Fxq 'enable --now audiolad-application-email-outbox.timer' "$systemctl_log"
grep -Fxq 'is-enabled audiolad-application-email-outbox.timer' "$systemctl_log"
grep -Fxq 'is-active audiolad-application-email-outbox.timer' "$systemctl_log"

set +e
failed_enable_output="$(
  DEPLOY_TREE="$release_dir/deploy" \
  WRAPPER_DIR="$install_root/wrapper" \
  SYSTEMD_DIR="$install_root/systemd" \
  LOGROTATE_DIR="$install_root/logrotate" \
  LOG_DIR="$install_root/log" \
  SKIP_AS_ROOT=1 \
  SKIP_SYSTEMCTL=0 \
  SYSTEMCTL="$fake_systemctl" \
  SYSTEMCTL_LOG="$systemctl_log" \
  SYSTEMCTL_ENABLE_EXIT=1 \
  "$release_dir/deploy/scripts/ensure-application-email-outbox.sh" 2>&1
)"
failed_enable_exit=$?
set -e
[[ "$failed_enable_exit" -eq 1 ]]
grep -Fq 'ERROR timer enable failed' <<<"$failed_enable_output"

missing_tree="$tmp_dir/missing"
mkdir -p "$missing_tree/scripts"
set +e
missing_output="$(
  DEPLOY_TREE="$missing_tree" \
  WRAPPER_DIR="$tmp_dir/unused-wrapper" \
  SYSTEMD_DIR="$tmp_dir/unused-systemd" \
  LOGROTATE_DIR="$tmp_dir/unused-logrotate" \
  LOG_DIR="$tmp_dir/unused-log" \
  SKIP_AS_ROOT=1 \
  SKIP_SYSTEMCTL=1 \
  "$release_dir/deploy/scripts/ensure-application-email-outbox.sh" 2>&1
)"
missing_exit=$?
set -e
[[ "$missing_exit" -eq 1 ]]
grep -Fq 'ERROR missing source file' <<<"$missing_output"

run_wrapper() {
  local scenario="$1"
  local expected_exit="$2"
  local log_file="$tmp_dir/${scenario}.log"
  local actual_exit=0

  set +e
  SCENARIO="$scenario" \
  DEPLOY_ROOT="$deploy_root" \
  ENV_FILE="$env_file" \
  LOG_FILE="$log_file" \
  LOCK_FILE="$tmp_dir/${scenario}.lock" \
  NPM_BIN="$fake_npm" \
  "$install_root/wrapper/run-application-email-outbox.sh" >/dev/null 2>&1
  actual_exit=$?
  set -e
  [[ "$actual_exit" -eq "$expected_exit" ]]
  printf '%s\n' "$log_file"
}

success_log="$(run_wrapper success 0)"
grep -Fq 'claimed=2 sent=1 failed=0 suppressed=1 exit=0' "$success_log"

idle_log="$(run_wrapper idle 0)"
grep -Fq 'claimed=0 sent=0 failed=0 suppressed=0 exit=0' "$idle_log"

smtp_log="$(run_wrapper smtp-missing 1)"
grep -Fq 'claimed=? sent=? failed=? suppressed=? exit=1' "$smtp_log"
grep -Fq 'authors_smtp_not_configured' "$smtp_log"
grep -Fq 'AUDIOLAD_SMTP_AUTHORS_PASS=***' "$smtp_log"
grep -Fq 'AUDIOLAD_EMAIL_UNSUBSCRIBE_SECRET=***' "$smtp_log"
if grep -Eq 'author@example\.test|super-secret|AUDIOLAD_SMTP_AUTHORS_PASS=[^*]|AUDIOLAD_EMAIL_UNSUBSCRIBE_SECRET=[^*]' "$smtp_log"; then
  echo "application email outbox failure was not sanitized" >&2
  exit 1
fi

deploy_source="$(<"$repo_root/deploy/scripts/deploy.sh")"
grep -Fq 'assert_application_email_outbox_release_tree' <<<"$deploy_source"
grep -Fq 'DEPLOY_TREE="$RELEASE_DIR/deploy" "$APPLICATION_EMAIL_OUTBOX_ENSURE"' <<<"$deploy_source"
grep -Fq 'application_email_outbox_ensure_failed' <<<"$deploy_source"
grep -Fq 'without rolling back a' <<<"$deploy_source"

# The new failure path must exit after cutover and must not call rollback.
ensure_block="$(
  awk '
    /APPLICATION_EMAIL_OUTBOX_ENSURE=/ { capture=1 }
    capture { print }
    capture && /application_email_outbox_ensure_failed/ { seen=1 }
    seen && /exit 1/ { exit }
  ' <<<"$deploy_source"
)"
grep -Fq 'application_email_outbox_ensure_failed' <<<"$ensure_block"
if grep -Fq 'rollback.sh' <<<"$ensure_block"; then
  echo "application email outbox ensure failure must not roll back the web release" >&2
  exit 1
fi

ensure_source="$(<"$repo_root/deploy/scripts/ensure-application-email-outbox.sh")"
grep -Fq 'enable --now' <<<"$ensure_source"
grep -Fq 'daemon-reload' <<<"$ensure_source"
if grep -Eq 'author-sale-email-outbox|author-product-moderation-email-outbox|partner_activation' <<<"$ensure_source"; then
  echo "application email outbox ensure must not touch other outbox cycles" >&2
  exit 1
fi

echo "application-email-outbox-timer-unit: ok"
