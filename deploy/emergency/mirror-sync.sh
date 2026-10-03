#!/usr/bin/env bash
# Push a full Git mirror of configured Audiolad repos to a non-GitHub target.
# While a repo is in mode=mirror, this updates every ref (branches and tags).
# After promote-mirror.sh, this refuses to move the emergency primary branch.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

MANIFEST=""
WORK_DIR=""
TARGET_BASE="${AUDIOLAD_EMERGENCY_GIT_TARGET_BASE:-}"
ONLY_REPO=""
SOURCE_URL_OVERRIDE=""
TRACK_GITHUB=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest)
      MANIFEST="${2:-}"
      shift 2
      ;;
    --work-dir)
      WORK_DIR="${2:-}"
      shift 2
      ;;
    --target-base)
      TARGET_BASE="${2:-}"
      shift 2
      ;;
    --repo)
      ONLY_REPO="${2:-}"
      shift 2
      ;;
    --source-url)
      SOURCE_URL_OVERRIDE="${2:-}"
      shift 2
      ;;
    --track-github)
      TRACK_GITHUB=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      emergency_die "unknown argument: $1"
      ;;
  esac
done

[[ -n "$MANIFEST" && -f "$MANIFEST" ]] || emergency_die "--manifest file is required"
[[ -n "$WORK_DIR" ]] || emergency_die "--work-dir is required"
[[ -n "$TARGET_BASE" ]] || emergency_die "--target-base or AUDIOLAD_EMERGENCY_GIT_TARGET_BASE is required"
if [[ -n "$SOURCE_URL_OVERRIDE" && -z "$ONLY_REPO" ]]; then
  emergency_die "--source-url requires --repo"
fi
validate_remote_url "$TARGET_BASE"
refuse_github_target "$TARGET_BASE"

mkdir -p "$WORK_DIR/cache" "$WORK_DIR/state"
REPORT="$WORK_DIR/sync-report.txt"
: >"$REPORT"

write_askpass() {
  local path="$1"
  cat >"$path" <<'EOF'
#!/bin/sh
case "$1" in
  *sername*) printf '%s\n' "${AUDIOLAD_EMERGENCY_GIT_USERNAME:-git}" ;;
  *) printf '%s\n' "${AUDIOLAD_EMERGENCY_GIT_TOKEN:-}" ;;
esac
EOF
  chmod 700 "$path"
}

target_with_user() {
  local url="$1"
  local user="${AUDIOLAD_EMERGENCY_GIT_USERNAME:-}"
  if [[ -z "$user" || "$url" == /* || "$url" == ssh://* || "$url" == git://* ]]; then
    printf '%s\n' "$url"
    return 0
  fi
  [[ "$user" =~ ^[A-Za-z0-9._-]+$ ]] || emergency_die "git username is not a plain token"
  node -e '
    const url = process.argv[1];
    const user = process.argv[2];
    const parsed = new URL(url);
    parsed.username = user;
    parsed.password = "";
    process.stdout.write(parsed.href);
  ' "$url" "$user"
}

sync_one() {
  local name="$1"
  local source="$2"
  local target_path="$3"
  local primary="$4"
  local required="$5"
  local cache="$WORK_DIR/cache/${name}.git"
  local mode_file="$WORK_DIR/state/${name}.mode"
  local mode="mirror"
  local target
  target="$(join_target "$TARGET_BASE" "$target_path")"
  validate_remote_url "$source"
  validate_remote_url "$target"
  refuse_github_target "$target"

  if [[ -f "$mode_file" ]]; then
    mode="$(tr -d '[:space:]' <"$mode_file")"
  fi

  if [[ "$mode" == "primary" && "$TRACK_GITHUB" != "1" ]]; then
    emergency_log "repo=${name} status=skipped_promoted_to_primary"
    printf '%s skipped_promoted_to_primary\n' "$name" >>"$REPORT"
    return 0
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    emergency_log "repo=${name} status=dry_run target=$(printf '%s' "$target" | redact_text)"
    printf '%s dry_run\n' "$name" >>"$REPORT"
    return 0
  fi

  local auth=()
  case "$source" in
    http://*|https://*)
      if [[ -n "${AUDIOLAD_MIRROR_SOURCE_TOKEN:-}" ]]; then
        auth=(-c "http.extraHeader=Authorization: Bearer ${AUDIOLAD_MIRROR_SOURCE_TOKEN}")
      fi
      ;;
  esac

  if ! git "${auth[@]}" ls-remote "$source" HEAD >/dev/null 2>"$WORK_DIR/cache/${name}.ls-remote.err"; then
    if [[ "$required" == "1" ]]; then
      emergency_die "source unreachable for required repo ${name}"
    fi
    emergency_log "repo=${name} status=skipped_source_unreachable"
    printf '%s skipped_source_unreachable\n' "$name" >>"$REPORT"
    return 0
  fi

  if [[ ! -d "$cache" ]]; then
    git "${auth[@]}" clone --mirror "$source" "$cache"
  else
    git --git-dir="$cache" remote set-url origin "$source"
    git "${auth[@]}" --git-dir="$cache" remote update --prune
  fi

  local askpass=""
  local push_target="$target"
  if [[ "$target" == http://* || "$target" == https://* ]]; then
    if [[ -z "${AUDIOLAD_EMERGENCY_GIT_TOKEN:-}" ]]; then
      emergency_die "AUDIOLAD_EMERGENCY_GIT_TOKEN is required for an http(s) mirror target"
    fi
    push_target="$(target_with_user "$target")"
    askpass="$(mktemp)"
    write_askpass "$askpass"
  fi
  if [[ "$target" == /* && ! -d "$target" ]]; then
    mkdir -p "$(dirname "$target")"
    git init --bare --initial-branch="$primary" "$target"
  fi

  local use_ssh=0
  if [[ "$target" == ssh://* || "$target" == git@* ]]; then
    [[ -n "${AUDIOLAD_EMERGENCY_SSH_KEY:-}" && -f "${AUDIOLAD_EMERGENCY_SSH_KEY}" ]] || emergency_die "AUDIOLAD_EMERGENCY_SSH_KEY file is required for SSH targets"
    [[ -n "${AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS:-}" && -f "${AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS}" ]] || emergency_die "AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS file is required for SSH targets"
    use_ssh=1
  fi

  set +e
  if [[ "$mode" == "primary" && "$TRACK_GITHUB" == "1" ]]; then
    if [[ -n "$askpass" ]]; then
      GIT_ASKPASS="$askpass" GIT_TERMINAL_PROMPT=0 \
        git --git-dir="$cache" push "$push_target" "+refs/heads/${primary}:refs/heads/github-main"
    elif [[ "$use_ssh" == "1" ]]; then
      GIT_SSH_COMMAND="ssh -i ${AUDIOLAD_EMERGENCY_SSH_KEY} -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS}" \
        git --git-dir="$cache" push "$push_target" "+refs/heads/${primary}:refs/heads/github-main"
    else
      git --git-dir="$cache" push "$push_target" "+refs/heads/${primary}:refs/heads/github-main"
    fi
    status=$?
    result="tracked_github_main"
  else
    if [[ -n "$askpass" ]]; then
      GIT_ASKPASS="$askpass" GIT_TERMINAL_PROMPT=0 \
        git --git-dir="$cache" push --mirror "$push_target"
    elif [[ "$use_ssh" == "1" ]]; then
      GIT_SSH_COMMAND="ssh -i ${AUDIOLAD_EMERGENCY_SSH_KEY} -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${AUDIOLAD_EMERGENCY_SSH_KNOWN_HOSTS}" \
        git --git-dir="$cache" push --mirror "$push_target"
    else
      git --git-dir="$cache" push --mirror "$push_target"
    fi
    status=$?
    result="mirrored"
  fi
  set -e
  if [[ -n "$askpass" ]]; then
    rm -f "$askpass"
  fi
  if [[ "$status" != "0" ]]; then
    emergency_die "mirror push failed for ${name}"
  fi
  if [[ ! -f "$mode_file" ]]; then
    printf 'mirror\n' >"$mode_file"
  fi
  local head
  head="$(git --git-dir="$cache" rev-parse "refs/heads/${primary}")"
  emergency_log "repo=${name} status=${result} primary=${primary} sha=${head}"
  printf '%s %s %s\n' "$name" "$result" "$head" >>"$REPORT"
}

found=0
while IFS=$'\t' read -r name github source target_path primary required; do
  [[ -n "$name" ]] || continue
  if [[ -n "$ONLY_REPO" && "$name" != "$ONLY_REPO" ]]; then
    continue
  fi
  found=1
  if [[ -n "$SOURCE_URL_OVERRIDE" ]]; then
    source="$SOURCE_URL_OVERRIDE"
  fi
  sync_one "$name" "$source" "$target_path" "$primary" "$required"
done < <(node "$ROOT/manifest.mjs" "$MANIFEST")

[[ "$found" == "1" ]] || emergency_die "no manifest repo matched"
emergency_log "report=${REPORT}"
