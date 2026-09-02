# FeastFlow Cumulative DeliveryWay Sync Design

**Spec**: `.specs/features/deliveryway-cumulative-sync-20260902/spec.md`
**Status**: Approved by execution request

## Architecture Overview

Apply the verified cumulative deltas repository-by-repository using the last corresponding DeliveryWay Production baselines. Mechanically identical files receive the source patch; FeastFlow-divergent files receive only the behavioral hunks so branding, language defaults, domains, deployment files, and provider contracts remain FeastFlow-owned.

## Source and Target Map

| Target | Source range | Target baseline |
| --- | --- | --- |
| FeastFlow Platform API | `55a7003..4cfc73b` | `1d6e227` |
| FeastFlow Restaurant Admin | `fdf5909..f0f9aa2` | `8428212` |
| FeastFlow Superadmin | `5da81a7..07dbbe5` | `40a5a51` |
| FeastFlow Landing | `a9b6472..06e69d6` | `87da575` |
| FeastFlow Customer | No source delta | `a4e2a83` |

## Integration Points

| System | Integration Method |
| --- | --- |
| Prisma | Add the nullable prior-order-status migration and schema field. |
| Orders/Branches | Reuse current controller → service → repository layering and existing realtime notification flow. |
| Package plans/Payouts | Extend current invoice snapshots and weekly payout calculations without new cross-module imports. |
| Frontends | Reuse existing API services, query hooks, translations, and FeastFlow branding defaults. |
| Production edge | Keep Plesk/Nginx routing to reserved loopback ports; no app runtime starts before approval. |

## Error Handling Strategy

| Scenario | Handling | User Impact |
| --- | --- | --- |
| Invalid uncancel request | Existing NestJS HTTP exceptions | Explicit API error; no order mutation. |
| Missing provider values | Guarded preflight failure | Launch stops before mutation. |
| Source/target divergence | Apply behavioral hunks manually | FeastFlow-specific identity/config remains intact. |

## Tech Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Sync baseline | Last deployed DeliveryWay release heads | Weekly release proves cumulative ancestry from these heads. |
| Customer repository | Verify but do not modify | Source release has no Customer delta. |
| Deployment | Prepare only | User will supply Production env values later. |
| Commit strategy | One atomic commit per affected FeastFlow repository | Independent rollback and release traceability. |

