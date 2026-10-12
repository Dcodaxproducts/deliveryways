#!/usr/bin/env bash
set -euo pipefail

project="deliveryways-realtime-isolation-$PPID"
export API_PORT="$((33000 + PPID % 1000))"
export REALTIME_HOST_PORT="$((34000 + PPID % 1000))"
cleanup() {
  docker compose -p "$project" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose -p "$project" up --detach --build postgres redis api realtime
for _ in $(seq 1 90); do
  if curl --fail --silent "http://127.0.0.1:$API_PORT/api/v1/health/live" >/dev/null \
    && curl --fail --silent "http://127.0.0.1:$REALTIME_HOST_PORT/ready" >/dev/null; then
    break
  fi
  sleep 2
done
curl --fail --silent "http://127.0.0.1:$API_PORT/api/v1/health/live" >/dev/null
docker compose -p "$project" stop redis
curl --fail --silent "http://127.0.0.1:$API_PORT/api/v1/health/live" >/dev/null
docker compose -p "$project" start redis
for _ in $(seq 1 30); do
  if curl --fail --silent "http://127.0.0.1:$REALTIME_HOST_PORT/ready" >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent "http://127.0.0.1:$REALTIME_HOST_PORT/ready" >/dev/null
docker compose -p "$project" kill realtime
curl --fail --silent "http://127.0.0.1:$API_PORT/api/v1/health/live" >/dev/null
orders_status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$API_PORT/api/v1/orders")"
if [[ "$orders_status" == "000" || "$orders_status" =~ ^5 ]]; then
  echo "Core order API became unavailable after realtime was killed: HTTP $orders_status" >&2
  exit 1
fi
echo "Redis recovery and realtime kill isolation passed; core health and order route remained available."
