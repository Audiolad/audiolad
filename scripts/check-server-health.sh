#!/usr/bin/env bash
# Read-only production health check. Safe to run manually or from cron.
# Exit 0 = OK, 1 = warning, 2 = critical
set -Eeuo pipefail

WARN=0
CRIT=0

note() { printf '%s\n' "$*"; }
warn() { note "WARN: $*"; WARN=1; }
crit() { note "CRIT: $*"; CRIT=1; }

ram_pct="$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')"
swap_pct="$(free | awk '/Swap:/ {if ($2==0) print 0; else printf "%.0f", $3/$2 * 100}')"
load="$(awk '{print $1}' /proc/loadavg)"

note "=== Server health $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
note "load_average: $load"
note "ram_used_pct: ${ram_pct}%"
note "swap_used_pct: ${swap_pct}%"

(( ram_pct > 80 )) && warn "RAM usage above 80%"
(( swap_pct > 50 )) && warn "Swap usage above 50%"

chrome_count="$(pgrep -c chrome-headless 2>/dev/null || true)"
chromium_count="$(pgrep -c -f 'chromium|playwright' 2>/dev/null || true)"
note "chrome_headless_count: $chrome_count"
note "chromium_playwright_count: $chromium_count"

if (( chrome_count > 0 )); then
  crit "chrome-headless running on production server"
fi

next_dev_count="$(pgrep -cf '/node_modules/\.bin/next dev' 2>/dev/null || true)"
note "next_dev_count: $next_dev_count"
if (( next_dev_count > 0 )); then
  crit "next dev process found"
fi

next_prod_pids="$(ss -tlnp 2>/dev/null | grep ':3000' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)"
next_prod_count=0
if [[ -n "$next_prod_pids" ]]; then
  next_prod_count="$(echo "$next_prod_pids" | wc -l | tr -d ' ')"
fi
note "listeners_on_3000: $next_prod_count"
if (( next_prod_count > 1 )); then
  crit "more than one process listening on port 3000"
elif (( next_prod_count == 0 )); then
  warn "no listener on port 3000"
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2_status="$(pm2 jlist 2>/dev/null | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try {
        const apps=JSON.parse(d);
        const a=apps.find(x=>x.name==='audiolad');
        if(!a){ console.log('missing'); process.exit(0); }
        console.log(a.pm2_env.status+' restarts='+a.pm2_env.restart_time);
      } catch { console.log('unknown'); }
    });
  " 2>/dev/null || echo "unknown")"
  note "pm2_audiolad: $pm2_status"
  if [[ "$pm2_status" != online* ]]; then
    crit "PM2 audiolad is not online ($pm2_status)"
  fi
fi

http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/api/health/build 2>/dev/null || echo "000")"
note "http_health_build: $http_code"
if [[ "$http_code" != "200" ]]; then
  crit "HTTP health check failed (HTTP $http_code)"
fi

if (( CRIT > 0 )); then
  exit 2
fi
if (( WARN > 0 )); then
  exit 1
fi
note "STATUS: OK"
exit 0
