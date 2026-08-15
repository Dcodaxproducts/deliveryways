#!/usr/bin/env bash

set -Eeuo pipefail

EXPECTED_IPV4="${EXPECTED_IPV4:-116.203.179.120}"
DB_CONTAINER="${DB_CONTAINER:-deliveryway-prod-postgres-1}"
PLESK_WEBSPACE="${PLESK_WEBSPACE:-delivery-way.de}"
PLESK_SYSTEM_DIR="${PLESK_SYSTEM_DIR:-/var/www/vhosts/system}"
LOCK_FILE="${LOCK_FILE:-/run/lock/deliveryway-custom-domains.lock}"
ALLOW_NON_ROOT="${ALLOW_NON_ROOT:-false}"
HTTPS_WAIT_ATTEMPTS="${HTTPS_WAIT_ATTEMPTS:-24}"
HTTPS_WAIT_DELAY_SECONDS="${HTTPS_WAIT_DELAY_SECONDS:-5}"

log() {
  printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    log "ERROR missing required command: $1"
    exit 1
  }
}

is_valid_hostname() {
  [[ "$1" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]]
}

dns_points_to_server() {
  dig +short A "$1" | awk '/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ { print }' | grep -Fxq "$EXPECTED_IPV4"
}

list_verified_domains() {
  local sql
  sql="SELECT custom_domain FROM restaurants WHERE custom_domain IS NOT NULL AND custom_domain_verified_at IS NOT NULL AND deleted_at IS NULL AND is_active = true ORDER BY custom_domain;"
  docker exec "$DB_CONTAINER" sh -lc \
    'exec psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' \
    sh "$sql"
}

write_proxy_config() {
  local hostname="$1"
  local redirect_hostname="${2:-}"
  local config_dir="$PLESK_SYSTEM_DIR/$hostname/conf"
  local config_file="$config_dir/vhost_nginx.conf"
  local candidate

  [[ -d "$config_dir" ]] || {
    log "ERROR [$hostname] Plesk did not create $config_dir"
    return 1
  }

  candidate="$(mktemp)"
  cat >"$candidate" <<'NGINX'
# Managed by DeliveryWays custom-domain provisioner.
# Plesk defines its own prefix location; this regex wins for storefront routes
# while leaving the ACME challenge path to Plesk/SSL It.
location ~ ^/(?!\.well-known/acme-challenge/) {
NGINX

  if [[ -n "$redirect_hostname" ]]; then
    cat >>"$candidate" <<NGINX
    if (\$host = $redirect_hostname) {
        return 301 https://$hostname\$request_uri;
    }
NGINX
  fi

  cat >>"$candidate" <<'NGINX'
    proxy_pass http://127.0.0.1:5053;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_buffering off;
}
NGINX

  if [[ -e "$config_file" ]] && ! grep -Fq 'Managed by DeliveryWays custom-domain provisioner.' "$config_file"; then
    log "ERROR [$hostname] refusing to replace unmanaged Plesk nginx configuration"
    rm -f "$candidate"
    return 1
  fi

  if [[ -e "$config_file" ]] && cmp -s "$candidate" "$config_file"; then
    rm -f "$candidate"
    return 0
  fi

  install -m 0644 "$candidate" "$config_file"
  rm -f "$candidate"
  plesk sbin httpdmng --reconfigure-domain "$hostname"
}

ensure_plesk_site() {
  local hostname="$1"

  if plesk bin site --info "$hostname" >/dev/null 2>&1; then
    return 0
  fi

  log "INFO [$hostname] creating Plesk site"
  if ! plesk bin site --create "$hostname" \
    -webspace-name "$PLESK_WEBSPACE" \
    -hosting true \
    -hst_type phys \
    -www false \
    -php false \
    -cgi false \
    -perl false \
    -python false \
    -ssi false \
    -ssl true \
    -ssl-redirect true \
    -mail_service false \
    -dns false \
    -notify false; then
    log "ERROR [$hostname] Plesk site creation failed"
    return 1
  fi

  if ! plesk bin site --info "$hostname" >/dev/null 2>&1; then
    log "ERROR [$hostname] Plesk did not register the site after creation"
    return 1
  fi
}

ensure_plesk_alias() {
  local alias_hostname="$1"
  local canonical_hostname="$2"

  if plesk bin domalias --info "$alias_hostname" >/dev/null 2>&1; then
    log "INFO [$alias_hostname] disabling Plesk SEO redirect for ACME compatibility"
    if ! plesk bin domalias --update "$alias_hostname" \
      -mail false \
      -web true \
      -dns false \
      -status enabled \
      -seo-redirect false; then
      log "ERROR [$alias_hostname] Plesk alias update failed"
      return 1
    fi
  else
    log "INFO [$alias_hostname] creating Plesk alias for $canonical_hostname"
    if ! plesk bin domalias --create "$alias_hostname" \
      -domain "$canonical_hostname" \
      -mail false \
      -web true \
      -dns false \
      -status enabled \
      -seo-redirect false; then
      log "ERROR [$alias_hostname] Plesk alias creation failed"
      return 1
    fi
  fi

  if ! plesk bin domalias --info "$alias_hostname" >/dev/null 2>&1; then
    log "ERROR [$alias_hostname] Plesk did not register the alias after creation"
    return 1
  fi
}

https_is_ready() {
  local hostname="$1"
  curl --silent --show-error --fail \
    --max-time 20 \
    --resolve "$hostname:443:$EXPECTED_IPV4" \
    --output /dev/null \
    "https://$hostname/"
}

wait_for_https() {
  local hostname="$1"
  local attempt

  for ((attempt = 1; attempt <= HTTPS_WAIT_ATTEMPTS; attempt += 1)); do
    if https_is_ready "$hostname"; then
      return 0
    fi

    if ((attempt < HTTPS_WAIT_ATTEMPTS)); then
      sleep "$HTTPS_WAIT_DELAY_SECONDS"
    fi
  done

  return 1
}

provision_domain() {
  local hostname="$1"
  local redirect_hostname=""

  if ! is_valid_hostname "$hostname"; then
    log "ERROR [$hostname] invalid hostname; skipping"
    return 1
  fi

  if ! dns_points_to_server "$hostname"; then
    log "PENDING [$hostname] DNS does not resolve to $EXPECTED_IPV4"
    return 0
  fi

  if [[ "$hostname" == www.* ]] && dns_points_to_server "${hostname#www.}"; then
    redirect_hostname="${hostname#www.}"
  fi

  ensure_plesk_site "$hostname" || return 1

  if [[ -n "$redirect_hostname" ]] && \
    plesk bin domalias --info "$redirect_hostname" >/dev/null 2>&1; then
    ensure_plesk_alias "$redirect_hostname" "$hostname" || return 1
  fi

  write_proxy_config "$hostname" "$redirect_hostname" || return 1

  if ! https_is_ready "$hostname"; then
    log "INFO [$hostname] issuing SSL certificate"
    if ! plesk ext sslit --certificate -issue -domain "$hostname" -secure-domain; then
      log "ERROR [$hostname] SSL certificate issuance failed"
      return 1
    fi
  fi

  if ! wait_for_https "$hostname"; then
    log "ERROR [$hostname] HTTPS smoke test failed"
    return 1
  fi

  log "ACTIVE [$hostname] Plesk proxy and HTTPS verified"
}

provision_apex_redirect() {
  local canonical_hostname="$1"
  local apex_hostname

  [[ "$canonical_hostname" == www.* ]] || return 0
  apex_hostname="${canonical_hostname#www.}"

  if ! is_valid_hostname "$apex_hostname"; then
    log "ERROR [$apex_hostname] invalid paired apex hostname; skipping"
    return 1
  fi

  if ! dns_points_to_server "$apex_hostname"; then
    log "PENDING [$apex_hostname] DNS does not resolve to $EXPECTED_IPV4"
    return 0
  fi

  ensure_plesk_alias "$apex_hostname" "$canonical_hostname" || return 1

  if ! https_is_ready "$apex_hostname"; then
    log "INFO [$apex_hostname] issuing SSL certificate"
    if ! plesk ext sslit --certificate -issue \
      -domain "$canonical_hostname" \
      -secure-domain \
      -aliases "$apex_hostname"; then
      log "ERROR [$apex_hostname] SSL certificate issuance failed"
      return 1
    fi
  fi

  if ! wait_for_https "$apex_hostname"; then
    log "ERROR [$apex_hostname] HTTPS redirect smoke test failed"
    return 1
  fi

  log "ACTIVE [$apex_hostname] redirects to https://$canonical_hostname"
}

main() {
  if [[ "$EUID" -ne 0 && "$ALLOW_NON_ROOT" != "true" ]]; then
    log "ERROR this provisioner must run as root"
    exit 1
  fi

  for command in awk cmp curl dig docker flock grep install mktemp plesk; do
    require_command "$command"
  done

  mkdir -p "$(dirname "$LOCK_FILE")"
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "INFO another provisioner run is active; exiting"
    exit 0
  fi

  local failed=0
  local hostname
  while IFS= read -r hostname; do
    [[ -n "$hostname" ]] || continue
    provision_domain "$hostname" || failed=1
    provision_apex_redirect "$hostname" || failed=1
  done < <(list_verified_domains)

  exit "$failed"
}

main "$@"
