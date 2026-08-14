#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROVISIONER="$SCRIPT_DIR/provision-custom-domains.sh"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

mkdir -p "$TEST_ROOT/bin" "$TEST_ROOT/vhosts" "$TEST_ROOT/state"

cat >"$TEST_ROOT/bin/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "${MOCK_DOMAINS:-orders.example.com}"
MOCK

cat >"$TEST_ROOT/bin/dig" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "${MOCK_DNS_IP:-116.203.179.120}"
MOCK

cat >"$TEST_ROOT/bin/plesk" <<'MOCK'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >>"$MOCK_LOG"
if [[ "$1 $2 $3" == "bin site --info" ]]; then
  [[ -d "$PLESK_SYSTEM_DIR/$4/conf" ]]
elif [[ "$1 $2 $3" == "bin site --create" ]]; then
  mkdir -p "$PLESK_SYSTEM_DIR/$4/conf"
fi
MOCK

cat >"$TEST_ROOT/bin/curl" <<'MOCK'
#!/usr/bin/env bash
count=0
[[ ! -f "$MOCK_CURL_COUNT" ]] || count="$(cat "$MOCK_CURL_COUNT")"
count=$((count + 1))
printf '%s' "$count" >"$MOCK_CURL_COUNT"
[[ "$count" -gt 1 ]]
MOCK

chmod +x "$TEST_ROOT/bin/"*

run_provisioner() {
  PATH="$TEST_ROOT/bin:$PATH" \
  ALLOW_NON_ROOT=true \
  LOCK_FILE="$TEST_ROOT/provisioner.lock" \
  MOCK_CURL_COUNT="$TEST_ROOT/state/curl-count" \
  MOCK_LOG="$TEST_ROOT/state/plesk.log" \
  PLESK_SYSTEM_DIR="$TEST_ROOT/vhosts" \
  "$PROVISIONER"
}

run_provisioner
grep -Fq 'bin site --create orders.example.com' "$TEST_ROOT/state/plesk.log"
grep -Fq 'sbin httpdmng --reconfigure-domain orders.example.com' "$TEST_ROOT/state/plesk.log"
grep -Fq 'ext sslit --certificate -issue -domain orders.example.com -secure-domain' "$TEST_ROOT/state/plesk.log"
grep -Fq 'proxy_pass http://127.0.0.1:5053;' "$TEST_ROOT/vhosts/orders.example.com/conf/vhost_nginx.conf"
grep -Fq 'location ~ ^/(?!\.well-known/acme-challenge/)' "$TEST_ROOT/vhosts/orders.example.com/conf/vhost_nginx.conf"

issue_count_before="$(grep -Fc 'ext sslit --certificate -issue' "$TEST_ROOT/state/plesk.log")"
run_provisioner
issue_count_after="$(grep -Fc 'ext sslit --certificate -issue' "$TEST_ROOT/state/plesk.log")"
[[ "$issue_count_before" == "$issue_count_after" ]]

line_count_before="$(wc -l <"$TEST_ROOT/state/plesk.log")"
MOCK_DOMAINS=waiting.example.com MOCK_DNS_IP=203.0.113.10 run_provisioner
line_count_after="$(wc -l <"$TEST_ROOT/state/plesk.log")"
[[ "$line_count_before" == "$line_count_after" ]]

MOCK_DOMAINS='bad;hostname' run_provisioner && {
  printf '%s\n' 'expected invalid hostname run to fail' >&2
  exit 1
}

printf '%s\n' 'custom-domain provisioner tests passed'
