# Realtime and WinOrder OOM hotfix rollout

## Scope

This release bounds the two public paths isolated during the 2026-10-12 incident. It does not change the database schema, environment, or nginx configuration.

- Engine.IO rejects new polling and direct-WebSocket handshakes in a custom Socket.IO adapter before session IDs, transports, namespace sockets, JWT work, rooms, or initial chat hydration are allocated. The prior namespace-gateway admission was insufficient: production unblocking proved Engine.IO could exhaust V8 before a gateway handler ran.
- Handshakes are capped at 30 attempts per 10 seconds per trusted network and 300 attempts per 10 seconds per API process. Engine.IO sessions are capped at 20 per trusted network and 512 per API process; pending reservations expire after 10 seconds. Polling rejections return HTTP 429 with integer `Retry-After`; upgrade requests are closed before WebSocket allocation when the protocol cannot carry that response.
- Network identity trusts forwarded hops only when the direct peer is loopback/private nginx infrastructure, walks the bounded X-Forwarded-For chain from nginx toward the client, and groups IPv4 at /24 and IPv6 at /64. Client-supplied prefixes cannot create admission keys.
- Namespace gateway admission remains in place after Engine.IO admission: active namespace sockets are capped at 20 per trusted network, 6 per authenticated user, and 2,000 per API process. Disconnect and failed-auth paths release every counter.
- Attempt, pending, active-network, socket, and user maps are hard-capped or bounded by their associated session cap; no token, user ID, socket ID, address, or credential is logged. Socket.IO payloads are capped at 64 KiB, compression is disabled, and ping/upgrade deadlines remain bounded.
- WinOrder rejects excess requests before database lookup and bcrypt at 120 requests/minute per network address and 60/minute per credential digest.
- `GetNewOrders` permits 30 polls/minute per configured connection. Concurrent polls are single-flighted, with at most three followers; excess work returns HTTP 429 with `Retry-After`.

## Pre-deployment gate

1. Keep the temporary public nginx blocks for `/socket.io/` and `/api/v1/winorder/GetNewOrders` in place.
2. Confirm the proposed API commit descends from the currently deployed commit and from cumulative backend `ef249ebef2d933220b6c9b22fe24401759f8c2ba`.
3. Use the existing immutable-image release workflow. Record the prior image/commit and preserve the current nginx configuration for rollback.
4. Confirm no Prisma migration is pending for this release.

## UAT while public blocks remain

Test against the new API container through an operator-controlled internal path; do not expose credentials in commands, screenshots, or logs.

1. Health check is 200 and the process has zero restarts.
2. One valid `/orders-tracking` client connects, joins its authorized room, receives a snapshot, disconnects, and can reconnect.
3. One valid `/chat` client receives its initial summary and can disconnect/reconnect.
4. Invalid socket authentication is rejected without user/token details in logs.
5. A valid WinOrder poll returns the unchanged vendor payload. A concurrent burst performs one poll workload; excess requests return 429 and an integer `Retry-After` header.
6. A valid tracking callback still succeeds.
7. Observe heap, RSS, CPU, event-loop responsiveness, database connections, and API restarts for at least 15 minutes. Heap must settle after the burst rather than rise monotonically; restart count must remain zero.

## Safe removal of temporary route blocks

Do not remove both blocks at once.

1. Validate the edited nginx configuration with the host's established configuration-test command. If validation fails, make no reload.
2. Remove only the `/socket.io/` temporary block, reload through the established nginx runbook, and verify an authorized polling connection upgrades to WebSocket, authorized namespace behavior remains unchanged, spoofed X-Forwarded-For prefixes do not change the network key, and excess polling handshakes receive 429 plus integer `Retry-After`. Run the bounded 10,000+ mixed polling/direct-WebSocket handshake stress check while watching Engine.IO session count, heap/RSS, CPU, event-loop delay, and restart count. Observe the API for at least 15 minutes.
3. If Engine.IO sessions exceed 512, any admission map exceeds its documented bound, heap grows monotonically, CPU remains saturated, health fails, or the process restarts, immediately restore that block and the previous known-good API image.
4. Only after the realtime observation passes, remove the `GetNewOrders` temporary block, validate/reload, perform one authorized poll, then a bounded concurrency check. Observe for at least 15 minutes.
5. Keep the upload-route decision independent: the incident isolation showed that blocking upload alone did not stop the OOM. Restore it only under its own UAT/change record.
6. Record final API commit/image, nginx validation result, route status, memory/CPU baseline, request rates, and restart count.

## Rollback

At any failed gate, reapply the affected temporary route block first, validate/reload nginx, then roll back to the recorded previous API image. Do not run a database rollback; this release has no migration.
