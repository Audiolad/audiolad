#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

release_dir="$tmp_dir/release"
deploy_root="$tmp_dir/deploy-root"
wrapper_dir="$tmp_dir/host-wrapper"
env_file="$tmp_dir/.env.production"
fake_npm="$tmp_dir/fake-npm"

mkdir -p "$release_dir/deploy/scripts" "$deploy_root"
cp "$repo_root/deploy/scripts/run-author-sale-email-outbox.sh" \
  "$release_dir/deploy/scripts/run-author-sale-email-outbox.sh"
cp "$repo_root/deploy/scripts/ensure-author-sale-email-outbox.sh" \
  "$release_dir/deploy/scripts/ensure-author-sale-email-outbox.sh"
chmod 0755 "$release_dir/deploy/scripts/"*.sh
printf '{}\n' >"$release_dir/package.json"
printf '# test env only\n' >"$env_file"
ln -s "$release_dir" "$deploy_root/current"

cat >"$fake_npm" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

case "${SCENARIO:?SCENARIO is required}" in
  success)
    printf 'partner_activation_email_outbox {"claimed":1,"sent":1,"failed":0}\n' >&2
    printf '{"claimed":1,"sent":1,"failed":0}\n'
    ;;
  idle)
    printf 'partner_activation_email_outbox {"claimed":0,"sent":0,"failed":0}\n' >&2
    printf '{"claimed":0,"sent":0,"failed":0}\n'
    ;;
  partner-error)
    printf 'partner_activation_email_outbox_failed partner_db_down recipient@example.test\n' >&2
    printf '{"claimed":1,"sent":1,"failed":0}\n'
    ;;
  sale-error)
    printf 'partner_activation_email_outbox {"claimed":1,"sent":1,"failed":0}\n' >&2
    printf 'author_sale_email_outbox_claim_failed SUPABASE_SERVICE_ROLE_KEY=super-secret recipient@example.test\n' >&2
    exit 1
    ;;
  *)
    printf 'unknown scenario\n' >&2
    exit 2
    ;;
esac
EOF
chmod 0755 "$fake_npm"

ensure_output="$(
  DEPLOY_TREE="$release_dir/deploy" \
  WRAPPER_DIR="$wrapper_dir" \
  SKIP_AS_ROOT=1 \
  "$release_dir/deploy/scripts/ensure-author-sale-email-outbox.sh"
)"
grep -Fq 'author_sale_email_outbox_wrapper_installed' <<<"$ensure_output"
cmp -s "$release_dir/deploy/scripts/run-author-sale-email-outbox.sh" \
  "$wrapper_dir/run-author-sale-email-outbox.sh"
[[ -x "$wrapper_dir/run-author-sale-email-outbox.sh" ]]

first_checksum="$(sha256sum "$wrapper_dir/run-author-sale-email-outbox.sh")"
ensure_repeat_output="$(
  DEPLOY_TREE="$release_dir/deploy" \
  WRAPPER_DIR="$wrapper_dir" \
  SKIP_AS_ROOT=1 \
  "$release_dir/deploy/scripts/ensure-author-sale-email-outbox.sh"
)"
grep -Fq 'author_sale_email_outbox_wrapper_unchanged' <<<"$ensure_repeat_output"
[[ "$first_checksum" == "$(sha256sum "$wrapper_dir/run-author-sale-email-outbox.sh")" ]]

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
  "$wrapper_dir/run-author-sale-email-outbox.sh" >/dev/null 2>&1
  actual_exit=$?
  set -e
  [[ "$actual_exit" -eq "$expected_exit" ]]
  printf '%s\n' "$log_file"
}

success_log="$(run_wrapper success 0)"
grep -Fq 'claimed=1 sent=1 failed=0 exit=0' "$success_log"
grep -Fq 'partner_activation_email_outbox {"claimed":1,"sent":1,"failed":0}' "$success_log"

idle_log="$(run_wrapper idle 0)"
grep -Fq 'claimed=0 sent=0 failed=0 exit=0' "$idle_log"
grep -Fq 'partner_activation_email_outbox {"claimed":0,"sent":0,"failed":0}' "$idle_log"

partner_error_log="$(run_wrapper partner-error 0)"
grep -Fq 'claimed=1 sent=1 failed=0 exit=0' "$partner_error_log"
grep -Fq 'partner_activation_email_outbox_failed partner_db_down [redacted-email]' "$partner_error_log"
if grep -Eq 'recipient@example\.test|super-secret|SUPABASE_SERVICE_ROLE_KEY=[^*]' "$partner_error_log"; then
  echo "partner runtime error was not sanitized" >&2
  exit 1
fi

sale_error_log="$(run_wrapper sale-error 1)"
grep -Fq 'claimed=? sent=? failed=? exit=1' "$sale_error_log"
grep -Fq 'partner_activation_email_outbox {"claimed":1,"sent":1,"failed":0}' "$sale_error_log"
if grep -Eq 'recipient@example\.test|super-secret|SUPABASE_SERVICE_ROLE_KEY=[^*]' "$sale_error_log"; then
  echo "sale runtime error was not sanitized" >&2
  exit 1
fi

# The production deploy invokes the candidate-release ensure script and does
# not create or enable any replacement timer/service for this observability fix.
deploy_source="$(<"$repo_root/deploy/scripts/deploy.sh")"
grep -Fq 'assert_author_sale_email_outbox_release_tree' <<<"$deploy_source"
grep -Fq 'DEPLOY_TREE="$RELEASE_DIR/deploy" "$SALE_EMAIL_OUTBOX_ENSURE"' <<<"$deploy_source"
ensure_source="$(<"$repo_root/deploy/scripts/ensure-author-sale-email-outbox.sh")"
grep -Fq 'WRAPPER_SRC="$DEPLOY_TREE/scripts/run-author-sale-email-outbox.sh"' <<<"$ensure_source"
if grep -Eq 'systemctl|enable --now|daemon-reload' <<<"$ensure_source"; then
  echo "sale outbox ensure must not alter the existing timer" >&2
  exit 1
fi

echo "author-sale-email-outbox-wrapper-unit: ok"
