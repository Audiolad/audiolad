#!/usr/bin/env bash
# Zero-downtime cutover helpers for Audiolad deploy/rollback.
# Candidate is verified on a standby loopback port; Nginx upstream switches
# only after readiness. The previous listener stays up until public smoke passes.

BLUE_PORT="${BLUE_PORT:-3000}"
GREEN_PORT="${GREEN_PORT:-3001}"
RUNTIME_STATE_FILE="${RUNTIME_STATE_FILE:-$DEPLOY_ROOT/shared/active-upstream.env}"
NGINX_UPSTREAM_CONF="${NGINX_UPSTREAM_CONF:-/etc/nginx/conf.d/audiolad-next-upstream.conf}"
NGINX_SITE_CONF="${NGINX_SITE_CONF:-/etc/nginx/sites-available/audiolad.ru}"
NGINX_UPSTREAM_NAME="${NGINX_UPSTREAM_NAME:-audiolad_next}"
READINESS_CONSECUTIVE="${READINESS_CONSECUTIVE:-3}"
CUTOVER_COMPLETED="${CUTOVER_COMPLETED:-0}"
CANDIDATE_PM2_APP="${CANDIDATE_PM2_APP:-}"
CANDIDATE_PORT_ACTIVE="${CANDIDATE_PORT_ACTIVE:-}"

pm2_app_for_port() {
  local port="$1"
  printf 'audiolad-p%s\n' "$port"
}

detect_pm2_app_on_port() {
  local port="$1"
  local preferred="${2:-}"
  local detected=""

  detected="$(
    pm2 jlist 2>/dev/null | node -e '
const port = String(process.argv[1] || "");
let raw = "";
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", () => {
  let apps = [];
  try { apps = JSON.parse(raw || "[]"); } catch { apps = []; }
  const match = apps.find((app) => {
    const env = app?.pm2_env?.env || {};
    const envPort = String(env.PORT ?? app?.pm2_env?.PORT ?? "");
    const status = app?.pm2_env?.status;
    return envPort === port && status === "online";
  });
  process.stdout.write(match?.name || "");
});
' "$port" || true
  )"

  if [[ -n "$detected" ]]; then
    printf '%s\n' "$detected"
    return 0
  fi

  if [[ -n "$preferred" ]]; then
    printf '%s\n' "$preferred"
    return 0
  fi

  return 1
}

standby_port_for() {
  local active="$1"
  if [[ "$active" == "$BLUE_PORT" ]]; then
    printf '%s\n' "$GREEN_PORT"
  else
    printf '%s\n' "$BLUE_PORT"
  fi
}

load_runtime_state() {
  ACTIVE_PORT="${ACTIVE_PORT:-}"
  ACTIVE_PM2_APP="${ACTIVE_PM2_APP:-}"

  if [[ -f "$RUNTIME_STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$RUNTIME_STATE_FILE"
  fi

  if [[ -z "${ACTIVE_PORT:-}" ]]; then
    if port_has_listener "$BLUE_PORT"; then
      ACTIVE_PORT="$BLUE_PORT"
    elif port_has_listener "$GREEN_PORT"; then
      ACTIVE_PORT="$GREEN_PORT"
    else
      ACTIVE_PORT="$BLUE_PORT"
    fi
  fi

  if [[ -z "${ACTIVE_PM2_APP:-}" ]]; then
    if pm2 describe "$(pm2_app_for_port "$ACTIVE_PORT")" >/dev/null 2>&1; then
      ACTIVE_PM2_APP="$(pm2_app_for_port "$ACTIVE_PORT")"
    elif pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
      ACTIVE_PM2_APP="$PM2_APP_NAME"
    else
      ACTIVE_PM2_APP="$(pm2_app_for_port "$ACTIVE_PORT")"
    fi
  fi

  STANDBY_PORT="$(standby_port_for "$ACTIVE_PORT")"
  PRODUCTION_PORT="$ACTIVE_PORT"
  PM2_APP_NAME="$ACTIVE_PM2_APP"

  log_info "Runtime state: ACTIVE_PORT=${ACTIVE_PORT} ACTIVE_PM2_APP=${ACTIVE_PM2_APP} STANDBY_PORT=${STANDBY_PORT}"
}

save_runtime_state() {
  local port="$1"
  local app="$2"
  local tmp="${RUNTIME_STATE_FILE}.tmp.$$"

  mkdir -p "$(dirname "$RUNTIME_STATE_FILE")"
  cat >"$tmp" <<EOF
# Managed by Audiolad deploy — do not edit while deploy/rollback is running
ACTIVE_PORT=${port}
ACTIVE_PM2_APP=${app}
BLUE_PORT=${BLUE_PORT}
GREEN_PORT=${GREEN_PORT}
UPDATED_AT_UTC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
  mv -Tf "$tmp" "$RUNTIME_STATE_FILE"
  ACTIVE_PORT="$port"
  ACTIVE_PM2_APP="$app"
  STANDBY_PORT="$(standby_port_for "$port")"
  PRODUCTION_PORT="$port"
  PM2_APP_NAME="$app"
  log_info "Saved runtime state: ACTIVE_PORT=${port} ACTIVE_PM2_APP=${app}"
}

render_nginx_upstream_conf() {
  local port="$1"
  cat <<EOF
# Managed by Audiolad deploy/rollback — do not edit by hand
# Active Next.js upstream on loopback only.
upstream ${NGINX_UPSTREAM_NAME} {
    server 127.0.0.1:${port};
}
EOF
}

nginx_site_uses_named_upstream() {
  [[ -f "$NGINX_SITE_CONF" ]] || return 1
  grep -q "proxy_pass http://${NGINX_UPSTREAM_NAME};" "$NGINX_SITE_CONF"
}

ensure_nginx_named_upstream_site() {
  require_command sudo

  if [[ ! -f "$NGINX_SITE_CONF" ]]; then
    log_error "Nginx site config missing: $NGINX_SITE_CONF"
    return 1
  fi

  if nginx_site_uses_named_upstream; then
    log_info "Nginx site already proxies to ${NGINX_UPSTREAM_NAME}"
    return 0
  fi

  if ! grep -q 'proxy_pass http://127.0.0.1:3000;' "$NGINX_SITE_CONF"; then
    log_error "Nginx site does not use expected Next.js upstream pattern"
    return 1
  fi

  local backup="${NGINX_SITE_CONF}.backup-$(date -u +"%Y%m%d-%H%M%S")-zdt-upstream"
  log_info "Migrating Nginx site Next.js proxy_pass to ${NGINX_UPSTREAM_NAME}"
  log_info "Nginx site backup: $backup"
  sudo cp -a "$NGINX_SITE_CONF" "$backup"

  local tmp
  tmp="$(mktemp)"
  sed 's#proxy_pass http://127\.0\.0\.1:3000;#proxy_pass http://'"${NGINX_UPSTREAM_NAME}"';#g' \
    "$NGINX_SITE_CONF" >"$tmp"

  if ! grep -q "proxy_pass http://${NGINX_UPSTREAM_NAME};" "$tmp"; then
    log_error "Failed to rewrite Nginx site proxy_pass targets"
    rm -f "$tmp"
    return 1
  fi

  if grep -q 'proxy_pass http://127.0.0.1:3000;' "$tmp"; then
    log_error "Nginx site still contains direct :3000 Next.js proxy_pass after rewrite"
    rm -f "$tmp"
    return 1
  fi

  sudo cp "$tmp" "$NGINX_SITE_CONF"
  rm -f "$tmp"
  log_info "Nginx site migrated to named upstream ${NGINX_UPSTREAM_NAME}"
}

write_nginx_upstream_file() {
  local port="$1"
  local tmp
  tmp="$(mktemp)"
  render_nginx_upstream_conf "$port" >"$tmp"

  if [[ "${AUDIOLAD_NGINX_DRY_RUN:-0}" == "1" ]]; then
    log_info "NGINX dry-run: would write upstream port=${port} to ${NGINX_UPSTREAM_CONF}"
    cat "$tmp"
    rm -f "$tmp"
    return 0
  fi

  require_command sudo
  sudo mkdir -p "$(dirname "$NGINX_UPSTREAM_CONF")"
  sudo cp "$tmp" "$NGINX_UPSTREAM_CONF"
  rm -f "$tmp"
  log_info "Wrote Nginx upstream ${NGINX_UPSTREAM_NAME} -> 127.0.0.1:${port}"
}

nginx_test_and_reload() {
  if [[ "${AUDIOLAD_NGINX_DRY_RUN:-0}" == "1" ]]; then
    log_info "NGINX dry-run: skip nginx -t / reload"
    return 0
  fi

  require_command sudo
  if ! sudo nginx -t; then
    log_error "nginx -t failed after upstream update"
    return 1
  fi
  sudo systemctl reload nginx
  log_info "Nginx reloaded with new upstream"
}

ensure_nginx_upstream_bootstrap() {
  local port="${1:-$ACTIVE_PORT}"

  ensure_nginx_named_upstream_site || return 1

  if [[ ! -f "$NGINX_UPSTREAM_CONF" ]]; then
    log_info "Bootstrapping Nginx upstream file on port ${port}"
    write_nginx_upstream_file "$port" || return 1
    nginx_test_and_reload || return 1
    return 0
  fi

  if ! grep -q "server 127.0.0.1:${port};" "$NGINX_UPSTREAM_CONF"; then
    log_warn "Nginx upstream file does not match ACTIVE_PORT=${port}; aligning before deploy"
    write_nginx_upstream_file "$port" || return 1
    nginx_test_and_reload || return 1
  fi
}

cutover_nginx_to_port() {
  local port="$1"
  log_info "cutover_started target_port=${port}"
  write_nginx_upstream_file "$port" || return 1
  nginx_test_and_reload || return 1
  log_info "cutover_completed target_port=${port}"
}

write_ecosystem_for_active() {
  local release_dir="$1"
  local port="$2"
  local app_name="$3"
  local eco_file="${4:-$DEPLOY_ROOT/ecosystem.config.cjs}"
  local tmp="${eco_file}.tmp.$$"

  cat >"$tmp" <<EOF
module.exports = {
  apps: [
    {
      name: "${app_name}",
      cwd: "${release_dir}",
      // Run Next directly so PM2 signal handling releases the port cleanly.
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "${port}",
        HOSTNAME: "127.0.0.1",
        AUDIOLAD_PRODUCTION_SERVER: "1",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      listen_timeout: 10000,
      kill_timeout: 15000,
      restart_delay: 2000,
      treekill: true,
    },
  ],
};
EOF
  mv -Tf "$tmp" "$eco_file"
  log_info "Updated ecosystem config: app=${app_name} port=${port} cwd=${release_dir}"
}

start_release_on_port() {
  local release_dir="$1"
  local port="$2"
  local app_name="$3"
  # PM2 only treats *.config.cjs / ecosystem.config.* as ecosystem files.
  # A name like ecosystem-audiolad-p3001.cjs is started as a raw script and
  # never binds Next.js to the candidate port.
  local eco_file="$DEPLOY_ROOT/shared/ecosystem.candidate.config.cjs"

  if [[ ! -d "$release_dir/.next" ]]; then
    log_error "Release missing .next: $release_dir"
    return 1
  fi

  if [[ ! -f "$release_dir/node_modules/next/dist/bin/next" ]]; then
    log_error "Next.js binary missing in release: $release_dir/node_modules/next/dist/bin/next"
    return 1
  fi

  if port_has_listener "$port"; then
    log_error "Port ${port} already has a listener; refusing to start ${app_name}"
    ss -lntp 2>/dev/null | grep ":${port} " || true
    return 1
  fi

  write_ecosystem_for_active "$release_dir" "$port" "$app_name" "$eco_file"

  if pm2 describe "$app_name" >/dev/null 2>&1; then
    log_warn "Removing stale PM2 app ${app_name} before candidate start"
    pm2 delete "$app_name" >/dev/null 2>&1 || true
    wait_for_port_free "$port" 20 1 || true
  fi

  # Clean any previous mis-started ecosystem script process from older builds.
  if pm2 describe "ecosystem-${app_name}" >/dev/null 2>&1; then
    log_warn "Removing legacy mis-started PM2 process ecosystem-${app_name}"
    pm2 delete "ecosystem-${app_name}" >/dev/null 2>&1 || true
  fi

  log_info "candidate_process_started app=${app_name} port=${port} release=${release_dir}"
  pm2 start "$eco_file" --only "$app_name"

  if ! pm2 describe "$app_name" >/dev/null 2>&1; then
    log_error "PM2 did not register candidate app ${app_name} after start"
    pm2 status || true
    return 1
  fi

  CANDIDATE_PM2_APP="$app_name"
  CANDIDATE_PORT_ACTIVE="$port"
}

stop_pm2_app_safe() {
  local app_name="$1"
  local port="${2:-}"

  if [[ -z "$app_name" ]]; then
    return 0
  fi

  if pm2 describe "$app_name" >/dev/null 2>&1; then
    log_info "Stopping PM2 app ${app_name}"
    pm2 delete "$app_name" >/dev/null 2>&1 || pm2 stop "$app_name" >/dev/null 2>&1 || true
  fi

  if [[ -n "$port" ]]; then
    if ! wait_for_port_free "$port" 20 1; then
      log_warn "Port ${port} still busy after stopping ${app_name}; clearing listeners"
      fuser -k "${port}/tcp" >/dev/null 2>&1 || true
      wait_for_port_free "$port" 10 1 || true
    fi
    cleanup_orphan_next_servers "$ACTIVE_PORT"
  fi
}

cleanup_failed_candidate() {
  if [[ "${CUTOVER_COMPLETED}" == "1" ]]; then
    return 0
  fi
  if [[ -n "${CANDIDATE_PM2_APP:-}" ]]; then
    log_warn "Cleaning failed candidate ${CANDIDATE_PM2_APP} (cutover not completed)"
    stop_pm2_app_safe "$CANDIDATE_PM2_APP" "${CANDIDATE_PORT_ACTIVE:-}"
    CANDIDATE_PM2_APP=""
    CANDIDATE_PORT_ACTIVE=""
  fi
}
