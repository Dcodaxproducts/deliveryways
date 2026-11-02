# Development Log

## 2026-11-02 — unauthenticated table reservations

- Added `POST /customer-app/table-reservations/public` with optional JWT. Anonymous requests require `restaurantId`, `branchId`, ISO `reservationDate`, `guestCount`, bounded `guestName`, normalized lowercase `guestEmail`, normalized `guestPhone`, optional bounded note, and UUID `clientRequestId`.
- Authenticated callers retain authoritative account linkage through the existing reservation path. Anonymous bookings use non-login synthetic guest users keyed by restaurant plus client request UUID; real contact details remain reservation snapshots and are shown only through role/tenant-guarded admin reads.
- Public responses omit guest name, email, and phone. Branch scope is verified by authoritative `(branchId, restaurantId)` lookup. Existing feature flag, future-date validation, auto-accept capacity check, status flow, and notifications remain in force. Endpoint is throttled to five requests/minute.
- No schema migration. Existing JSON metadata storage is reused; rollback is code-only. No backfill or database lock risk.
- Query impact (anonymous create): one scoped branch lookup, one guest upsert, optional existing capacity scan only when auto-accept is enabled, one profile upsert; no N+1 and no cache. Stable request UUID prevents duplicate records for retries.
- Verification: focused TypeScript typecheck and customer-app Jest suite; full project gates recorded with the commit handoff.
- Limitation: the current product models branch-level table capacity, not individually selectable table IDs; this change preserves that canonical contract.
