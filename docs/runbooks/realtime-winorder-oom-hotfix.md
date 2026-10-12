
## Scope


- Engine.IO admits every request in a custom Socket.IO adapter before Engine.IO transport work. This includes new polling/direct-WebSocket handshakes, existing-session polling GET/POST requests, and polling-to-WebSocket upgrades. Commit `5823bfb0` admitted only requests without `_query.sid`; once a session existed, unlimited concurrent long-polls and upgrades bypassed every request window. Production unblocking therefore still drove V8 to OOM/restart even though new handshakes were bounded.
- Requests are capped at 160 per 10 seconds per trusted network, 40 per 10 seconds per session, and 1,200 per 10 seconds per API process. Concurrent request work is capped at 24 per network, 3 per session, and 192 per process. A session permits only one active polling GET and one active upgrade, so duplicate long-polls are rejected without blocking the valid polling-to-WebSocket transition. Unknown, stale, malformed, and network-mismatched session IDs are rejected before Engine.IO lookup/transport work and still consume the global/network request budgets.
- Engine.IO sessions are capped at 8 per trusted network and 96 per API process, reduced from 20/512 after production showed that an admitted Socket.IO session can trigger authenticated namespace joins and DB-backed chat/order hydration. Pending reservations expire after 10 seconds. The 96-session process ceiling bounds that hydration fan-out while preserving normal authorized clients; scale must use additional sticky-session API instances rather than raising the in-process ceiling without measured memory proof. HTTP polling rejections return 429 with integer `Retry-After`; rejected upgrades are closed before WebSocket allocation.
- Network identity trusts forwarded hops only when the direct peer is loopback/private nginx infrastructure, walks the bounded X-Forwarded-For chain from nginx toward the client, and groups IPv4 at /24 and IPv6 at /64. Client-supplied prefixes cannot create admission keys.
- Namespace gateway admission remains in place after Engine.IO admission: active namespace sockets are capped at 20 per trusted network, 6 per authenticated user, and 2,000 per API process. Disconnect and failed-auth paths release every counter.
- Network request windows are hard-capped at 512 keys. Pending, active-network, per-session request, duplicate-poll, upgrade, socket, and user state are bounded by their associated request/session caps. Session close and error paths release all per-session state; request finish, close, abort, and bounded lease paths release in-flight state. No token, user ID, socket ID, address, or credential is logged. Socket.IO payloads are capped at 64 KiB, compression is disabled, and ping/upgrade deadlines remain bounded.
- WinOrder rejects excess requests before database lookup and bcrypt at 120 requests/minute per network address and 60/minute per credential digest.
- `GetNewOrders` permits 30 polls/minute per configured connection. Concurrent polls are single-flighted, with at most three followers; excess work returns HTTP 429 with `Retry-After`.

## Pre-deployment gate

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
8. Exercise invalid MIME/magic, SVG, GIF/animation, corrupt bytes, dimensions, >20 MB, rate, and concurrency cases. Confirm pre-body/capacity responses are 429 with integer `Retry-After`, no temp files remain after success/error/abort, and logs contain no token, credential, user ID, address, file name, URL, or image bytes.
10. Observe heap, RSS, CPU, event-loop responsiveness, database connections, and API restarts for at least 15 minutes. Heap must settle after each burst rather than rise monotonically; restart count must remain zero.

## Safe removal of temporary route blocks

Remove only one route block at a time, in the order below.

1. Validate the edited nginx configuration with the host's established configuration-test command. If validation fails, make no reload.
2. Before exposure, run the real Engine.IO/Socket.IO stress harness locally with `npm run test:realtime-stress` and in its container stage with `docker build --target realtime-stress -t feastflow-realtime-stress . && docker run --rm feastflow-realtime-stress`. It performs 50,000 spoofed/existing-session requests, 500 reconnects, duplicate long-polls, mixed valid polling-to-WebSocket clients, and XFF changes; it fails unless heap/RSS settle, event-loop p99 stays responsive, valid clients keep working, and all counters/maps stay within their hard bounds.
3. Remove only the `/socket.io/` temporary block, reload through the established nginx runbook, and verify an authorized polling connection upgrades to WebSocket, authorized namespace behavior remains unchanged, spoofed X-Forwarded-For prefixes do not change the network key, unknown/stale session IDs are rejected, duplicate polling GETs receive 429 plus integer `Retry-After`, and valid polling POST plus WebSocket upgrade continue to work. Observe the API for at least 15 minutes.
4. If Engine.IO sessions exceed 96, request windows exceed 512 network keys/96 session keys, pending sessions exceed 96, in-flight requests exceed 192, heap grows monotonically, event-loop p99 exceeds the harness bound, CPU remains saturated, health fails, or the process restarts, immediately restore that block and the previous known-good API image.
5. Only after the realtime observation passes, remove the `GetNewOrders` temporary block, validate/reload, perform one authorized poll, then a bounded concurrency check. Observe for at least 15 minutes.
8. Record final API commit/image, each nginx validation result, each route's status, temp-file baseline, memory/CPU baseline, request rates, and restart count.

## Rollback

