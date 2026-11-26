#!/usr/bin/env bash
# Simulates deploy user: sudo rejects `test`, allows only narrow music-bulk sbin.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAKE_ROOT="$(mktemp -d /tmp/audiolad-mbs-ops-remote-test.XXXXXX)"
FAKE_SBIN="${FAKE_ROOT}/usr/local/sbin"
trap 'rm -rf "${FAKE_ROOT}"' EXIT

mkdir -p "$FAKE_SBIN"
for name in \
  audiolad-music-storage-bulk-ops-status \
  audiolad-music-storage-bulk-ops-pause \
  audiolad-music-storage-bulk-ops-resume \
  audiolad-music-storage-bulk-ops-start-copy \
  audiolad-music-storage-bulk-ops-stop \
  audiolad-music-storage-bulk-sudo-bootstrap; do
  install -m 0755 /bin/true "${FAKE_SBIN}/${name}"
done

WRAPPER_BIN="${FAKE_ROOT}/bin"
mkdir -p "$WRAPPER_BIN"
cat >"${WRAPPER_BIN}/sudo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cmd="${1:-}"
if [[ "$cmd" == "-n" ]]; then
  shift
  cmd="${1:-}"
fi
if [[ "$cmd" == "test" ]]; then
  printf 'Sorry, user deploy is not allowed to execute '\''test'\''\n' >&2
  exit 1
fi
case "$cmd" in
  */audiolad-music-storage-bulk-ops-status)
    echo "music_storage_bulk_ops_status_ok"
    exit 0
    ;;
  */audiolad-music-storage-bulk-ops-pause)
    echo "music_storage_bulk_ops_pause_ok"
    exit 0
    ;;
  */audiolad-music-storage-bulk-ops-resume)
    echo "music_storage_bulk_ops_resume_ok"
    exit 0
    ;;
  */audiolad-music-storage-bulk-ops-start-copy)
    echo "music_storage_bulk_ops_start_copy_ok"
    exit 0
    ;;
  */audiolad-music-storage-bulk-ops-stop)
    echo "music_storage_bulk_ops_stop_ok"
    exit 0
    ;;
  */audiolad-music-storage-bulk-sudo-bootstrap)
    echo "music_storage_bulk_sudo_bootstrap_ok"
    exit 0
    ;;
  *)
    printf 'Sorry, user deploy is not allowed to execute %s\n' "$1" >&2
    exit 1
    ;;
esac
EOF
chmod 0755 "${WRAPPER_BIN}/sudo"

export PATH="${WRAPPER_BIN}:/usr/bin:/bin"
export MUSIC_STORAGE_BULK_SBIN_ROOT="${FAKE_SBIN}"
OPS="${ROOT}/deploy/scripts/audiolad-music-storage-bulk-ops-remote.sh"

for action in status pause resume start_copy stop; do
  out="$(bash "$OPS" "$action")"
  case "$action" in
    status) [[ "$out" == *status_ok* ]] || exit 1 ;;
    pause) [[ "$out" == *pause_ok* ]] || exit 1 ;;
    resume) [[ "$out" == *resume_ok* ]] || exit 1 ;;
    start_copy) [[ "$out" == *start_copy_ok* ]] || exit 1 ;;
    stop) [[ "$out" == *stop_ok* ]] || exit 1 ;;
  esac
done

# Missing sbin: deploy-user sees not_found, not sudo test failure
rm -f "${FAKE_SBIN}/audiolad-music-storage-bulk-ops-status"
set +e
err="$(bash "$OPS" status 2>&1 >/dev/null)"
set -e
[[ "$err" == *privileged_ops_sbin_missing* ]] || exit 1
[[ "$err" == *not_found* ]] || exit 1

printf '%s\n' "music-storage-bulk-ops-remote-deploy-test: ok"