#!/usr/bin/env bash
# Regression: run-from-target-sha.sh must parse the reuse condition, take the
# fresh archive branch, reuse a complete pin, and reject a scripts-only cache.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER="$ROOT/deploy/scripts/run-from-target-sha.sh"
PIN_LIB="$ROOT/deploy/scripts/lib/pin-target-deploy-scripts.sh"
DEPLOY_SH="$ROOT/deploy/scripts/deploy.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/audiolad-pin-reuse.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

fail() {
  echo "FAIL $*" >&2
  exit 1
}

REQUIRED_RECONCILE=(
  deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.service
  deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.timer
  deploy/logrotate/audiolad-author-appreciation-getcourse-reconcile
)

echo "== bash -n deploy/scripts =="
while IFS= read -r -d '' script; do
  bash -n "$script" || fail "bash -n failed for $script"
done < <(find "$ROOT/deploy/scripts" -type f -name '*.sh' -print0)

if ! awk '
  /if \[\[ -f "\$DEST\/deploy\/scripts\/deploy\.sh"/ { saw=1 }
  saw && /pin_has_reconcile_artifacts "\$DEST"/ { call=1 }
  saw && call && /then/ { found=1 }
  END { exit found ? 0 : 1 }
' "$LAUNCHER"; then
  fail "reuse condition must keep file/string tests in [[ ]] and call pin_has_reconcile_artifacts outside"
fi
if awk '
  /if \[\[ -f "\$DEST\/deploy\/scripts\/deploy\.sh"/ { in_br=1 }
  in_br && /pin_has_reconcile_artifacts/ && /\]\]/ { bad=1 }
  in_br && /\]\]/ { in_br=0 }
  END { exit bad ? 0 : 1 }
' "$LAUNCHER"; then
  fail "reuse condition still calls pin_has_reconcile_artifacts inside [[ ]]"
fi
if ! awk '
  /if \[\[ "\$marker" == "\$full_commit" \]\] && pin_has_reconcile_artifacts/ { found=1 }
  END { exit found ? 0 : 1 }
' "$PIN_LIB"; then
  fail "pin-target-deploy-scripts.sh must call pin_has_reconcile_artifacts outside [[ ]]"
fi

echo "== git archive at HEAD includes pin trees =="
SHA="$(git -C "$ROOT" rev-parse HEAD)"
ARCHIVE_LIST="$(git -C "$ROOT" archive "$SHA" deploy/scripts deploy/systemd deploy/logrotate | tar -t)"
for prefix in deploy/scripts/ deploy/systemd/ deploy/logrotate/; do
  printf '%s\n' "$ARCHIVE_LIST" | grep -q "^${prefix}" || fail "archive missing ${prefix}"
done
for rel in "${REQUIRED_RECONCILE[@]}" deploy/scripts/run-from-target-sha.sh deploy/scripts/deploy.sh; do
  printf '%s\n' "$ARCHIVE_LIST" | grep -q "^${rel}$" || fail "archive missing ${rel}"
  [[ -f "$ROOT/$rel" ]] || fail "working tree missing ${rel}"
done

echo "== mandatory reconcile / canonical path preserved =="
grep -q 'DEPLOY_TREE="$RELEASE_DIR/deploy"' "$DEPLOY_SH" ||
  fail "deploy.sh must point ensure at RELEASE_DIR/deploy"
grep -q 'assert_author_appreciation_reconcile_release_tree' "$DEPLOY_SH" ||
  fail "deploy.sh must keep the reconcile release-tree preflight"
grep -q 'author_appreciation_getcourse_reconcile_ensure_failed' "$DEPLOY_SH" ||
  fail "deploy.sh must fail-close on reconcile ensure"
grep -q 'archive "$FULL_COMMIT" deploy/scripts deploy/systemd deploy/logrotate' "$LAUNCHER" ||
  fail "launcher must archive deploy/scripts deploy/systemd deploy/logrotate"
grep -q 'missing reconcile systemd/logrotate artifacts' "$LAUNCHER" ||
  fail "launcher must fail-close when archive omits reconcile artifacts"
grep -q '/var/www/audiolad-deploy/current/deploy/scripts/deploy.sh' "$LAUNCHER" &&
  fail "launcher must not exec via /current"
grep -q 'run-from-target-sha.sh' "$ROOT/deploy/scripts/github-actions-deploy-wrapper.sh" ||
  fail "canonical GitHub Actions wrapper path must stay run-from-target-sha.sh"

echo "== execute fresh archive and reuse branches =="
REPO="$TMP/repo"
DEPLOY_ROOT="$TMP/deploy-root"
mkdir -p "$REPO"
git -C "$REPO" init -q
git -C "$REPO" config user.email "test@audiolad.local"
git -C "$REPO" config user.name "Pin Reuse Test"
mkdir -p "$REPO/deploy/scripts" "$REPO/deploy/systemd" "$REPO/deploy/logrotate"
cat > "$REPO/deploy/scripts/deploy.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "FIXTURE_DEPLOY_ECHO=TARGET_SHA"
echo "PINNED=${AUDIOLAD_DEPLOY_SCRIPTS_PINNED:-0}"
echo "PINNED_SHA=${AUDIOLAD_DEPLOY_SCRIPTS_PINNED_SHA:-}"
exit 0
EOF
chmod +x "$REPO/deploy/scripts/deploy.sh"
cp "$LAUNCHER" "$REPO/deploy/scripts/run-from-target-sha.sh"
chmod +x "$REPO/deploy/scripts/run-from-target-sha.sh"
: > "$REPO/deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.service"
: > "$REPO/deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.timer"
: > "$REPO/deploy/logrotate/audiolad-author-appreciation-getcourse-reconcile"
echo base > "$REPO/README.md"
git -C "$REPO" add README.md deploy
git -C "$REPO" commit -q -m "fixture-target"
TARGET_SHA="$(git -C "$REPO" rev-parse HEAD)"
DEST="$DEPLOY_ROOT/shared/deploy-scripts/${TARGET_SHA}"

fresh_out="$(
  GIT_WORKDIR="$REPO" DEPLOY_ROOT="$DEPLOY_ROOT" bash "$LAUNCHER" "$TARGET_SHA"
)"
printf '%s\n' "$fresh_out"
printf '%s\n' "$fresh_out" | grep -q 'FIXTURE_DEPLOY_ECHO=TARGET_SHA' ||
  fail "fresh archive must exec target deploy.sh"
printf '%s\n' "$fresh_out" | grep -q 'Reusing pinned deploy scripts' &&
  fail "fresh archive must not take the reuse branch"
[[ -f "$DEST/deploy/scripts/.pinned-commit" ]] || fail "fresh archive must write .pinned-commit"
[[ "$(tr -d '\n' < "$DEST/deploy/scripts/.pinned-commit")" == "$TARGET_SHA" ]] ||
  fail "pinned-commit must match target SHA"
for rel in "${REQUIRED_RECONCILE[@]}"; do
  [[ -f "$DEST/$rel" ]] || fail "fresh pin dest missing $rel"
done
echo reuse-marker > "$DEST/.reuse-marker"

reuse_out="$(
  GIT_WORKDIR="$REPO" DEPLOY_ROOT="$DEPLOY_ROOT" bash "$LAUNCHER" "$TARGET_SHA"
)"
printf '%s\n' "$reuse_out"
printf '%s\n' "$reuse_out" | grep -q 'Reusing pinned deploy scripts' ||
  fail "complete pin must take the reuse branch"
printf '%s\n' "$reuse_out" | grep -q 'FIXTURE_DEPLOY_ECHO=TARGET_SHA' ||
  fail "reuse branch must still exec target deploy.sh"
[[ -f "$DEST/.reuse-marker" ]] || fail "reuse must not replace a complete pin dest"

echo "== scripts-only cache is rejected =="
SCRIPTS_ONLY_ROOT="$TMP/scripts-only-root"
SCRIPTS_ONLY_DEST="$SCRIPTS_ONLY_ROOT/shared/deploy-scripts/${TARGET_SHA}"
mkdir -p "$SCRIPTS_ONLY_DEST/deploy/scripts"
printf '%s\n' "$TARGET_SHA" > "$SCRIPTS_ONLY_DEST/deploy/scripts/.pinned-commit"
cat > "$SCRIPTS_ONLY_DEST/deploy/scripts/deploy.sh" <<'EOF'
#!/usr/bin/env bash
echo "FIXTURE_DEPLOY_ECHO=SCRIPTS_ONLY_STALE"
exit 0
EOF
chmod +x "$SCRIPTS_ONLY_DEST/deploy/scripts/deploy.sh"
echo leftover > "$SCRIPTS_ONLY_DEST/.scripts-only-marker"

scripts_only_out="$(
  GIT_WORKDIR="$REPO" DEPLOY_ROOT="$SCRIPTS_ONLY_ROOT" bash "$LAUNCHER" "$TARGET_SHA"
)"
printf '%s\n' "$scripts_only_out"
printf '%s\n' "$scripts_only_out" | grep -q 'Reusing pinned deploy scripts' &&
  fail "scripts-only pin must not reuse"
printf '%s\n' "$scripts_only_out" | grep -q 'FIXTURE_DEPLOY_ECHO=TARGET_SHA' ||
  fail "scripts-only pin must re-archive and exec target deploy.sh"
printf '%s\n' "$scripts_only_out" | grep -q 'FIXTURE_DEPLOY_ECHO=SCRIPTS_ONLY_STALE' &&
  fail "scripts-only stale deploy.sh must not run"
[[ ! -f "$SCRIPTS_ONLY_DEST/.scripts-only-marker" ]] ||
  fail "scripts-only dest must be replaced by a fresh archive"
for rel in "${REQUIRED_RECONCILE[@]}"; do
  [[ -f "$SCRIPTS_ONLY_DEST/$rel" ]] || fail "re-archive dest missing $rel"
done

echo "run-from-target-sha-pin-reuse-unit: ok"
