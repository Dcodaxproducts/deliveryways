#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
CUSTOMER_SHA=e8b0e5fef876564e26a079bd0382309f2f10eb8c
CUSTOMER_BASE=762c0f2f4d758b1ce3201fa99d94600189d1ede8
CUSTOMER_BRANCH=fix/customer-rest-polling-20261012
ADMIN_SHA=e1409c0e309cd9b0afd987f6443e87090d49379c
ADMIN_BASE=4c6e51cf833e6a37924e590e3c82ee7cbe760df3
ADMIN_BRANCH=fix/admin-visibility-polling-production-20261012
API_REPO=/opt/deliveryway/source/deliveryways
CUSTOMER_REPO=/opt/deliveryway/source/deliveryway-customer-website
ADMIN_REPO=/opt/deliveryway/source/deliveryway-restaurant-admin
ENV_FILE=/opt/deliveryway/env/.env.development
PROJECT=deliveryway-development
OVERRIDE=deploy/compose.development.yml
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
PROOF=/opt/deliveryway/releases/development/${STAMP}-rest-polling-proof
BACKUP=/opt/deliveryway/backups/env-history/.env.development.before-rest-polling-${STAMP}
CUSTOMER_IMAGE=deliveryway-development-customer:${CUSTOMER_SHA:0:12}
ADMIN_IMAGE=deliveryway-development-restaurant-admin:${ADMIN_SHA:0:12}
mkdir -p "$PROOF" /opt/deliveryway/backups/env-history
for repo in "$API_REPO" "$CUSTOMER_REPO" "$ADMIN_REPO"; do test -d "$repo/.git" || { echo "missing repo: $repo" >&2; exit 1; }; done
test -f "$ENV_FILE"
fetch_pin(){ local repo=$1 branch=$2 sha=$3; test -z "$(git -C "$repo" status --porcelain --untracked-files=no)" || { git -C "$repo" status --short; exit 1; }; git -C "$repo" fetch --no-tags origin "refs/heads/$branch:refs/remotes/origin/$branch"; test "$(git -C "$repo" rev-parse "refs/remotes/origin/$branch")" = "$sha"; git -C "$repo" checkout --detach "$sha"; }
fetch_pin "$CUSTOMER_REPO" "$CUSTOMER_BRANCH" "$CUSTOMER_SHA"
fetch_pin "$ADMIN_REPO" "$ADMIN_BRANCH" "$ADMIN_SHA"
git -C "$CUSTOMER_REPO" merge-base --is-ancestor "$CUSTOMER_BASE" "$CUSTOMER_SHA"
git -C "$ADMIN_REPO" merge-base --is-ancestor "$ADMIN_BASE" "$ADMIN_SHA"
cd "$API_REPO"
dc(){ docker compose --project-name "$PROJECT" --env-file "$ENV_FILE" --file deploy/compose.yml --file "$OVERRIDE" "$@"; }
DB_BEFORE=$(dc ps -q postgres); API_BEFORE=$(dc ps -q api); SUPER_BEFORE=$(dc ps -q superadmin); LANDING_BEFORE=$(dc ps -q landing)
for id in "$DB_BEFORE" "$API_BEFORE" "$SUPER_BEFORE" "$LANDING_BEFORE"; do test -n "$id"; done
CURRENT_CUSTOMER=$(dc ps -q customer); CURRENT_ADMIN=$(dc ps -q restaurant-admin)
if [ -n "$CURRENT_CUSTOMER" ] && [ -n "$CURRENT_ADMIN" ]; then
 LIVE_CUSTOMER=$(docker inspect "$CURRENT_CUSTOMER" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'); LIVE_ADMIN=$(docker inspect "$CURRENT_ADMIN" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
 git -C "$CUSTOMER_REPO" merge-base --is-ancestor "$LIVE_CUSTOMER" "$CUSTOMER_SHA"; git -C "$ADMIN_REPO" merge-base --is-ancestor "$LIVE_ADMIN" "$ADMIN_SHA"
 if [ "$LIVE_CUSTOMER" = "$CUSTOMER_SHA" ] && [ "$LIVE_ADMIN" = "$ADMIN_SHA" ]; then deploy/scripts/smoke-test.sh development "$ENV_FILE"; echo 'Already deployed and verified.'; exit 0; fi
fi
CANDIDATE_ENV=$PROOF/.env.development; LABELS=$PROOF/compose.labels.yml
cp -a "$ENV_FILE" "$CANDIDATE_ENV"
sed -i "s|^DELIVERYWAY_ENV_FILE=.*|DELIVERYWAY_ENV_FILE=$CANDIDATE_ENV|; s|^CUSTOMER_IMAGE=.*|CUSTOMER_IMAGE=$CUSTOMER_IMAGE|; s|^RESTAURANT_ADMIN_IMAGE=.*|RESTAURANT_ADMIN_IMAGE=$ADMIN_IMAGE|" "$CANDIDATE_ENV"
cat > "$LABELS" <<YAML
services:
  customer:
    build:
      labels:
        org.opencontainers.image.revision: "$CUSTOMER_SHA"
  restaurant-admin:
    build:
      labels:
        org.opencontainers.image.revision: "$ADMIN_SHA"
YAML
deploy/scripts/preflight.sh development "$CANDIDATE_ENV"
docker compose --project-name "$PROJECT-candidate" --env-file "$CANDIDATE_ENV" --file deploy/compose.yml --file "$OVERRIDE" --file "$LABELS" build --no-cache customer restaurant-admin
test "$(docker image inspect "$CUSTOMER_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$CUSTOMER_SHA"
test "$(docker image inspect "$ADMIN_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$ADMIN_SHA"
cp -a "$ENV_FILE" "$BACKUP"; sed -i "s|^CUSTOMER_IMAGE=.*|CUSTOMER_IMAGE=$CUSTOMER_IMAGE|; s|^RESTAURANT_ADMIN_IMAGE=.*|RESTAURANT_ADMIN_IMAGE=$ADMIN_IMAGE|" "$ENV_FILE"
deploy/scripts/preflight.sh development "$ENV_FILE"; dc up -d --no-build --no-deps --wait customer restaurant-admin
test "$DB_BEFORE" = "$(dc ps -q postgres)"; test "$API_BEFORE" = "$(dc ps -q api)"; test "$SUPER_BEFORE" = "$(dc ps -q superadmin)"; test "$LANDING_BEFORE" = "$(dc ps -q landing)"
deploy/scripts/smoke-test.sh development "$ENV_FILE"
for service in customer restaurant-admin; do cid=$(dc ps -q "$service"); docker inspect "$cid" --format "service=$service image={{.Config.Image}} revision={{index .Config.Labels \"org.opencontainers.image.revision\"}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} restarts={{.RestartCount}} oom={{.State.OOMKilled}}"; done | tee "$PROOF/runtime.txt"
echo "PASS proof=$PROOF rollback_env=$BACKUP"
