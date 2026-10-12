# Realtime, WinOrder, and upload OOM-safe rollout

## Scope

This cumulative release bounds the three public paths isolated during the 2026-10-12 incident. It preserves the realtime and WinOrder behavior from `a59f84e7d395219095c880084fdfaef6e23f582b` and adds disk-backed upload admission. It does not change the database schema, environment, or nginx configuration.

- Engine.IO rejects new polling and direct-WebSocket handshakes in a custom Socket.IO adapter before session IDs, transports, namespace sockets, JWT work, rooms, or initial chat hydration are allocated. The prior namespace-gateway admission was insufficient: production unblocking proved Engine.IO could exhaust V8 before a gateway handler ran.
- Handshakes are capped at 30 attempts per 10 seconds per trusted network and 300 attempts per 10 seconds per API process. Engine.IO sessions are capped at 20 per trusted network and 512 per API process; pending reservations expire after 10 seconds. Polling rejections return HTTP 429 with integer `Retry-After`; upgrade requests are closed before WebSocket allocation when the protocol cannot carry that response.
- Network identity trusts forwarded hops only when the direct peer is loopback/private nginx infrastructure, walks the bounded X-Forwarded-For chain from nginx toward the client, and groups IPv4 at /24 and IPv6 at /64. Client-supplied prefixes cannot create admission keys.
- Namespace gateway admission remains in place after Engine.IO admission: active namespace sockets are capped at 20 per trusted network, 6 per authenticated user, and 2,000 per API process. Disconnect and failed-auth paths release every counter.
- Attempt, pending, active-network, socket, and user maps are hard-capped or bounded by their associated session cap; no token, user ID, socket ID, address, or credential is logged. Socket.IO payloads are capped at 64 KiB, compression is disabled, and ping/upgrade deadlines remain bounded.
- WinOrder rejects excess requests before database lookup and bcrypt at 120 requests/minute per network address and 60/minute per credential digest.
- `GetNewOrders` permits 30 polls/minute per configured connection. Concurrent polls are single-flighted, with at most three followers; excess work returns HTTP 429 with `Retry-After`.
- Image upload rejects rate, known oversize, and excess concurrency before Multer body reading; source/output bytes remain disk-backed under a fixed writable temp directory, Sharp is bounded, and every completion/error/abort path cleans temp files.

## Pre-deployment gate

1. Keep the temporary public nginx blocks for `/socket.io/`, `/api/v1/winorder/GetNewOrders`, and `/api/v1/storage/upload-image` in place.
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
7. Through the internal path, upload one valid anonymous-registration image and one authenticated legacy/mobile-shaped image. Confirm the unchanged response fields (`capability`, `key`, `fileUrl`, `contentType`, dimensions and byte counts), WebP object metadata, replacement success, and replacement rollback on old-object deletion failure.
8. Exercise invalid MIME/magic, SVG, GIF/animation, corrupt bytes, dimensions, >20 MB, rate, and concurrency cases. Confirm pre-body/capacity responses are 429 with integer `Retry-After`, no temp files remain after success/error/abort, and logs contain no token, credential, user ID, address, file name, URL, or image bytes.
9. Run one bounded concurrent upload stress check while watching `/tmp/deliveryways-image-uploads`, heap/RSS, CPU, event-loop delay and object-store traffic. At most four request bodies, two Sharp jobs and two Sharp waiters may be active per API process.
10. Observe heap, RSS, CPU, event-loop responsiveness, database connections, and API restarts for at least 15 minutes. Heap must settle after each burst rather than rise monotonically; restart count must remain zero.

## Safe removal of temporary route blocks

Remove only one route block at a time, in the order below.

1. Validate the edited nginx configuration with the host's established configuration-test command. If validation fails, make no reload.
2. Remove only the `/socket.io/` temporary block, reload through the established nginx runbook, and verify an authorized polling connection upgrades to WebSocket, authorized namespace behavior remains unchanged, spoofed X-Forwarded-For prefixes do not change the network key, and excess polling handshakes receive 429 plus integer `Retry-After`. Run the bounded 10,000+ mixed polling/direct-WebSocket handshake stress check while watching Engine.IO session count, heap/RSS, CPU, event-loop delay, and restart count. Observe the API for at least 15 minutes.
3. If Engine.IO sessions exceed 512, any admission map exceeds its documented bound, heap grows monotonically, CPU remains saturated, health fails, or the process restarts, immediately restore that block and the previous known-good API image.
4. Only after the realtime observation passes, remove the `GetNewOrders` temporary block, validate/reload, perform one authorized poll, then a bounded concurrency check. Observe for at least 15 minutes.
5. Only after WinOrder passes, remove only the `/api/v1/storage/upload-image` temporary block under its own change record, validate/reload, run the valid/invalid/abort/concurrency upload checks above, and observe for at least 15 minutes. The incident isolation showed upload alone did not stop the original OOM, but upload still has its own rollback gate.
6. If any stage fails, reapply only that route's block first. Do not proceed to the next route. A failed upload stage must not roll back or re-block already healthy socket/WinOrder stages unless shared API health is affected.
7. Record final API commit/image, each nginx validation result, each route's status, temp-file baseline, memory/CPU baseline, request rates, and restart count.

## Rollback

At any failed gate, reapply the affected temporary route block first and validate/reload nginx. If shared API health does not immediately recover, roll back to the recorded previous cumulative API image. Socket, WinOrder, and upload are independently staged and independently blockable. Do not run a database rollback; this release has no migration.
