# American Corner Pilot Readiness Design

**Spec:** `.specs/features/american-corner-pilot-readiness/spec.md`
**Status:** Approved by implementation request

## Architecture

- Keep printer settings in the existing branch/restaurant-scoped printing JSON contract; add a validated `paperSize` property with an `80MM` compatibility default.
- Build order-ticket HTML in a pure Restaurant Admin formatter, then pass paper-specific QZ configuration to the existing local-printer bridge.
- Subscribe the order-management surface to its existing realtime/reconciliation flow and guard prints with an in-memory order/status key set.
- Add custom-domain DNS status and verification to the Restaurants bounded context. DNS checks live in the service; persistence remains in the repository.
- Expose DNS status/verification only through existing authorized restaurant administration routes and show it in Super Admin.

## Existing Components Reused

| Component | Reuse |
| --- | --- |
| `AdminPrintingService` | Existing scoped settings and health events |
| `src/lib/local-printer.ts` | QZ connection, discovery, and printing bridge |
| Order realtime/reconciliation hooks | Accepted-order trigger source |
| `RestaurantsService` / repository | Domain normalization, uniqueness, and persistence |
| Super Admin restaurant domain panel | DNS instructions and verification status UI |

## Error Handling

| Scenario | Handling |
| --- | --- |
| QZ/printer unavailable | Non-blocking toast plus scoped failed printer event |
| Unsupported paper size | DTO validation failure |
| Duplicate accepted event | Suppress using order/status print key |
| DNS mismatch/NXDOMAIN/timeout | Keep verification timestamp null and return actionable conflict |
| Missing expected DNS target config | Service-unavailable response; never verify |

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Existing settings storage | Add `paperSize` to JSON contract | Avoids a migration for a branch display preference |
| Default size | 80MM | Matches the common pilot thermal printer expectation |
| Verification authority | Backend DNS resolution | Browser checks are unreliable and spoofable |
| Duplicate scope | Active browser session | Prevents realtime/reconciliation duplicates without blocking explicit later reprints |

