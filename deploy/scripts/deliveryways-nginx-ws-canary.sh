#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DOMAIN="${DOMAIN:-api.delivery-way.de}"
VHOST="${VHOST:-/var/www/vhosts/system/${DOMAIN}/conf/vhost_nginx.conf}"
GLOBAL="${GLOBAL:-/etc/nginx/conf.d/deliveryway-ws-edge-limits.conf}"
UPSTREAM="${UPSTREAM:-http://127.0.0.1:5050}"
STATE="${STATE:-/root/deliveryway-ws-edge-canary}"
CANARY_PREFIX="/__dw_ws_canary__/socket.io/"
GLOBAL_CONN="${GLOBAL_CONN:-128}"
PER_IP_CONN="${PER_IP_CONN:-8}"
GLOBAL_RATE="${GLOBAL_RATE:-25r/s}"
PER_IP_RATE="${PER_IP_RATE:-3r/s}"
GLOBAL_BURST="${GLOBAL_BURST:-50}"
PER_IP_BURST="${PER_IP_BURST:-6}"
WATCH_SECONDS="${WATCH_SECONDS:-900}"
MAX_RSS_MIB="${MAX_RSS_MIB:-1536}"
mkdir -p "${STATE}/backups" "${STATE}/receipts"
chmod 700 "${STATE}" "${STATE}/backups" "${STATE}/receipts"

need(){ command -v "$1" >/dev/null || { echo "missing command: $1" >&2; exit 2; }; }
for x in nginx curl docker python3 sha256sum awk sed grep date; do need "$x"; done

container_id(){
  docker ps -q --filter label=com.docker.compose.project=deliveryway-prod --filter label=com.docker.compose.service=api | head -1
}
nginx_test(){ nginx -t; }
nginx_reload(){ systemctl reload nginx; }
backup_file(){
  local f="$1" ts="$2" out
  out="${STATE}/backups/${ts}${f////_}"
  if [[ -e "${f}" ]]; then cp -a -- "${f}" "${out}"; else : >"${out}.ABSENT"; fi
  printf '%s' "${out}"
}
api_health(){ curl -fsS --max-time 3 "https://${DOMAIN}/api/v1/health/live" >/dev/null; }
public_socket_code(){ curl -sk --http1.1 --max-time 3 -o /dev/null -w '%{http_code}' "https://${DOMAIN}/socket.io/?EIO=4&transport=websocket" -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: ZHctZWRnZS1wcm9iZS0xMg==' || true; }
canary_code(){
  local token; token="$(<"${STATE}/canary.token")"
  curl -sk --http1.1 --max-time 3 -o /dev/null -w '%{http_code}' "https://${DOMAIN}${CANARY_PREFIX}?EIO=4&transport=websocket" -H "X-DW-Canary-Token: ${token}" -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: MDEyMzQ1Njc4OWFiY2RlZg==' || true
}
inspect_api(){
  local cid; cid="$(container_id)"; [[ -n "${cid}" ]] || { echo 'production API container not found' >&2; return 1; }
  docker inspect -f 'id={{.Id}} image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} started={{.State.StartedAt}}' "${cid}"
  docker stats --no-stream --format 'memory={{.MemUsage}} cpu={{.CPUPerc}} pids={{.PIDs}}' "${cid}"
}
restore_token_from_global(){
  [[ -f "${GLOBAL}" ]] || return 0
  local token
  token="$(sed -n 's/.*"\([^"]*\)"[[:space:]]*1;.*/\1/p' "${GLOBAL}" | head -1)"
  [[ -n "${token}" ]] || return 0
  printf '%s\n' "${token}" >"${STATE}/canary.token"
  chmod 600 "${STATE}/canary.token"
}
write_global(){
  local token="$1" tmp; tmp="$(mktemp)"
  cat >"${tmp}" <<EOF
# Managed by deliveryways-nginx-ws-canary.sh. HTTP-context only.
map_hash_bucket_size 128;
limit_conn_zone \$binary_remote_addr zone=dw_ws_ip_conn:10m;
limit_conn_zone \$server_name zone=dw_ws_global_conn:1m;
limit_req_zone \$binary_remote_addr zone=dw_ws_ip_rate:10m rate=${PER_IP_RATE};
limit_req_zone \$server_name zone=dw_ws_global_rate:1m rate=${GLOBAL_RATE};
map \$http_upgrade \$dw_ws_connection_upgrade { default upgrade; '' close; }
map \$http_x_dw_canary_token \$dw_ws_canary_allowed { default 0; "${token}" 1; }
EOF
  install -o root -g root -m 600 "${tmp}" "${GLOBAL}"
  rm -f "${tmp}"
}
location_block(){
  local public="$1"
  if [[ "${public}" == yes ]]; then cat <<EOF
# DW_PUBLIC_SOCKETIO_BEGIN
location ^~ /socket.io/ {
    limit_conn dw_ws_global_conn ${GLOBAL_CONN};
    limit_conn dw_ws_ip_conn ${PER_IP_CONN};
    limit_conn_status 429;
    limit_req zone=dw_ws_global_rate burst=${GLOBAL_BURST} nodelay;
    limit_req zone=dw_ws_ip_rate burst=${PER_IP_BURST} nodelay;
    limit_req_status 429;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$dw_ws_connection_upgrade;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 65s;
    proxy_send_timeout 65s;
    proxy_buffering off;
    proxy_pass ${UPSTREAM};
}
# DW_PUBLIC_SOCKETIO_END
EOF
  else cat <<EOF
# DW_CANARY_SOCKETIO_BEGIN
location ^~ ${CANARY_PREFIX} {
    if (\$dw_ws_canary_allowed = 0) { return 404; }
    limit_conn dw_ws_global_conn ${GLOBAL_CONN};
    limit_conn dw_ws_ip_conn ${PER_IP_CONN};
    limit_conn_status 429;
    limit_req zone=dw_ws_global_rate burst=${GLOBAL_BURST} nodelay;
    limit_req zone=dw_ws_ip_rate burst=${PER_IP_BURST} nodelay;
    limit_req_status 429;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$dw_ws_connection_upgrade;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 65s;
    proxy_send_timeout 65s;
    proxy_buffering off;
    proxy_pass ${UPSTREAM}/socket.io/;
}
# DW_CANARY_SOCKETIO_END
EOF
  fi
}
strip_marked(){
  local file="$1" begin="$2" end="$3" out="$4"
  awk -v b="${begin}" -v e="${end}" '{if(index($0,b)){skip=1;next} if(index($0,e)){skip=0;next} if(!skip)print}' "${file}" >"${out}"
}
replace_public_503(){
  local file="$1" block="$2" out="$3"
  python3 - "${file}" "${block}" "${out}" <<'PY'
import pathlib,re,sys
src=pathlib.Path(sys.argv[1]).read_text(); block=pathlib.Path(sys.argv[2]).read_text(); out=pathlib.Path(sys.argv[3])
# Refuse ambiguous edits. Only a top-level location whose header targets /socket.io/ and whose body contains return 503 is eligible.
candidates=[]
for m in re.finditer(r'(?m)^[ \t]*location\s+[^\n{]*?/socket\.io/[^\n{]*\{',src):
    depth=1;i=m.end()
    while i<len(src) and depth:
        if src[i]=='{': depth+=1
        elif src[i]=='}': depth-=1
        i+=1
    if depth: raise SystemExit('unbalanced socket.io location')
    text=src[m.start():i]
    if re.search(r'\breturn\s+503\s*;', text): candidates.append((m.start(), i, text))
if len(candidates)!=1: raise SystemExit(f'expected exactly one blocked /socket.io/ location, found {len(candidates)}')
a,b,_=candidates[0]; out.write_text(src[:a]+block.rstrip()+"\n"+src[b:])
PY
}
watch_api(){
  local seconds="$1" cid start_restarts now rss status health oom deadline
  cid="$(container_id)"; [[ -n "${cid}" ]] || return 1
  start_restarts="$(docker inspect -f '{{.RestartCount}}' "${cid}")"; deadline=$((SECONDS+seconds))
  while (( SECONDS < deadline )); do
    read -r status health now oom < <(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.RestartCount}} {{.State.OOMKilled}}' "${cid}")
    rss="$(docker stats --no-stream --format '{{.MemUsage}}' "${cid}" | awk '{print $1}')"
    printf '%s status=%s health=%s restarts=%s oom=%s rss=%s
' "$(date -Is)" "${status}" "${health}" "${now}" "${oom}" "${rss}"
    [[ "${status}" == running && "${health}" == healthy && "${now}" == "${start_restarts}" && "${oom}" == false ]] || return 1
    api_health || return 1
    python3 - "${rss}" "${MAX_RSS_MIB}" <<'PY' || return 1
import re,sys
s=sys.argv[1]; limit=float(sys.argv[2]); m=re.match(r'([0-9.]+)([KMG]iB)',s)
if not m: raise SystemExit(1)
v=float(m.group(1))*({'KiB':1/1024,'MiB':1,'GiB':1024}[m.group(2)])
raise SystemExit(0 if v <= limit else 1)
PY
    sleep 5
  done
}

action="${1:-audit}"; ts="$(date -u +%Y%m%dT%H%M%SZ)"
case "${action}" in
  audit)
    echo "domain=${DOMAIN} vhost=${VHOST} upstream=${UPSTREAM}"
    [[ -f "${VHOST}" ]]
    echo '--- custom vhost ---'
    sed -n '1,240p' "${VHOST}"
    echo '--- nginx include and active domain references ---'
    nginx -T 2>&1 | grep -n -A45 -B8 -E "configuration file .*api\.delivery-way\.de|server_name .*api\.delivery-way\.de|location .*socket\.io|proxy_pass.*5050" | head -260 || true
    echo "api_health=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 3 https://${DOMAIN}/api/v1/health/live) public_socket=$(public_socket_code)"
    inspect_api
    ;;
  install-canary)
    [[ -f "${VHOST}" ]] || { echo "missing ${VHOST}" >&2; exit 1; }
    api_health
    [[ "$(public_socket_code)" == 503 ]] || { echo 'public /socket.io is not 503; refusing' >&2; exit 1; }
    [[ -f "${STATE}/canary.token" ]] || { python3 - <<'PY' >"${STATE}/canary.token"
import secrets
print(secrets.token_urlsafe(32))
PY
      chmod 600 "${STATE}/canary.token"; }
    vb="$(backup_file "${VHOST}" "${ts}")"; gb="$(backup_file "${GLOBAL}" "${ts}")"
    trap 'cp -a -- "${vb}" "${VHOST}"; if [[ -e "${gb}.ABSENT" ]]; then rm -f "${GLOBAL}"; else cp -a -- "${gb}" "${GLOBAL}"; fi; restore_token_from_global || true; nginx_test && nginx_reload || true' ERR
    write_global "$(<"${STATE}/canary.token")"
    tmp="$(mktemp)"; strip_marked "${VHOST}" '# DW_CANARY_SOCKETIO_BEGIN' '# DW_CANARY_SOCKETIO_END' "${tmp}"; printf '
%s
' "$(location_block no)" >>"${tmp}"; install -o root -g root -m 600 "${tmp}" "${VHOST}"; rm -f "${tmp}"
    nginx_test; nginx_reload; sleep 1; api_health
    [[ "$(public_socket_code)" == 503 ]] || { echo 'public block changed unexpectedly' >&2; false; }
    code="$(canary_code)"; [[ "${code}" == 101 ]] || { echo "canary handshake expected 101, got ${code}" >&2; false; }
    trap - ERR
    printf 'installed; token_file=%s public_socket=503 canary=101
' "${STATE}/canary.token"
    ;;
  verify-canary)
    evidence="${2:-}"; [[ -f "${evidence}" ]] || { echo 'usage: verify-canary /root/stress-evidence.json' >&2; exit 2; }
    python3 - "${evidence}" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); assert x['attempts'] >= 5000; assert x['source_ips'] >= 2; assert x['duration_seconds'] > 0
PY
    [[ "$(public_socket_code)" == 503 ]]; [[ "$(canary_code)" == 101 ]]; watch_api "${WATCH_SECONDS}"
    receipt="${STATE}/receipts/canary-${ts}.pass"; { echo "verified_at=${ts}"; sha256sum "${VHOST}" "${GLOBAL}" "${evidence}"; inspect_api; } >"${receipt}"
    ln -sfn "${receipt}" "${STATE}/canary-latest.pass"; echo "PASS ${receipt}"
    ;;
  stage-public)
    [[ -L "${STATE}/canary-latest.pass" ]] || { echo 'no verified canary receipt' >&2; exit 1; }
    api_health; [[ "$(public_socket_code)" == 503 ]]; [[ "$(canary_code)" == 101 ]]
    vb="$(backup_file "${VHOST}" "${ts}-pre-public")"; block="$(mktemp)"; out="$(mktemp)"; location_block yes >"${block}"
    replace_public_503 "${VHOST}" "${block}" "${out}"; install -o root -g root -m 600 "${out}" "${VHOST}"; rm -f "${block}" "${out}"
    if ! nginx_test || ! nginx_reload || ! sleep 1; then
      echo 'public stage failed before health watch; restoring exact pre-stage vhost' >&2; cp -a -- "${vb}" "${VHOST}"; nginx_test; nginx_reload; exit 1
    fi
    public_code="$(public_socket_code)"
    if [[ "${public_code}" != 101 && "${public_code}" != 429 ]] || ! watch_api "${WATCH_SECONDS}"; then
      echo "public stage failed (socket=${public_code}); restoring exact pre-stage vhost" >&2; cp -a -- "${vb}" "${VHOST}"; nginx_test; nginx_reload; exit 1
    fi
    echo "PASS public staged; rollback=${vb}"
    ;;
  rollback-public)
    b="${2:-}"; [[ -f "${b}" ]] || { echo 'usage: rollback-public BACKUP_FILE' >&2; exit 2; }
    cur="$(backup_file "${VHOST}" "${ts}-before-rollback")"; cp -a -- "${b}" "${VHOST}"; nginx_test || { cp -a -- "${cur}" "${VHOST}"; exit 1; }; nginx_reload; [[ "$(public_socket_code)" == 503 ]]; api_health; echo 'rollback PASS'
    ;;
  *) echo 'actions: audit | install-canary | verify-canary EVIDENCE.json | stage-public | rollback-public BACKUP' >&2; exit 2;;
esac
