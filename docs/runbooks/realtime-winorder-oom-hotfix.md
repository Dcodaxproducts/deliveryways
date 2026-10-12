# Realtime, WinOrder, and upload OOM-safe rollout

## Scope

This cumulative release bounds the three public paths isolated during the 2026-10-12 incident. It preserves the realtime and WinOrder behavior from `a59f84e7d395219095c880084fdfaef6e23f582b` and adds disk-backed upload admission. It does not change the database schema, environment, or nginx configuration.

- Socket.IO namespaces reject reconnect bursts before JWT verification and before room joins or initial chat hydration.
- Active sockets are capped at 20 per network address, 6 per authenticated user, and 2,000 per API process. Disconnect and failed-auth paths release every active counter.
- Reconnect-attempt and active-connection maps are hard-capped; no token, user ID, socket ID, address, or credential is logged.
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
2. Remove only the `/socket.io/` temporary block, reload through the established nginx runbook, and verify authorized realtime behavior plus 429/rate-limit behavior. Observe the API for at least 15 minutes.
3. If heap grows monotonically, CPU remains saturated, health fails, or the process restarts, immediately restore that block and the previous known-good API image.
4. Only after the realtime observation passes, remove the `GetNewOrders` temporary block, validate/reload, perform one authorized poll, then a bounded concurrency check. Observe for at least 15 minutes.
5. Only after WinOrder passes, remove only the `/api/v1/storage/upload-image` temporary block under its own change record, validate/reload, run the valid/invalid/abort/concurrency upload checks above, and observe for at least 15 minutes. The incident isolation showed upload alone did not stop the original OOM, but upload still has its own rollback gate.
6. If any stage fails, reapply only that route's block first. Do not proceed to the next route. A failed upload stage must not roll back or re-block already healthy socket/WinOrder stages unless shared API health is affected.
7. Record final API commit/image, each nginx validation result, each route's status, temp-file baseline, memory/CPU baseline, request rates, and restart count.

## Rollback

At any failed gate, reapply the affected temporary route block first and validate/reload nginx. If shared API health does not immediately recover, roll back to the recorded previous cumulative API image. Socket, WinOrder, and upload are independently staged and independently blockable. Do not run a database rollback; this release has no migration.
