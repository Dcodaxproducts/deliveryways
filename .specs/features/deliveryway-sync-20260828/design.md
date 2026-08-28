# Deliveryway Cumulative Sync 2026-08-28 Design

**Spec**: `.specs/features/deliveryway-sync-20260828/spec.md`
**Status**: Approved by explicit sync request

## Architecture Overview

The existing five FeastFlow repositories remain separate. Patch-equivalent commits are detected with Git patch IDs; only missing verified Deliveryway commits are replayed. Conflicts are resolved in favor of FeastFlow environment/deployment/branding contracts while retaining functional application behavior.

## Components

| Component | Source head | FeastFlow target | Verification |
| --- | --- | --- | --- |
| API | `a636cee` | `feastflow-platform-api` | Prisma, typecheck, build, lint, tests, policy, Compose |
| Restaurant Admin | `2063945` | `feastflow-restaurant-admin` | import check, typecheck, lint, build, tests |
| Superadmin | `5da81a7` | `feastflow-superadmin` | typecheck, lint, build |
| Customer | `9b25510` | `feastflow-customer-website` | typecheck, lint, build, tests |
| Landing | `a9b6472` | `feastflow-landing-page` | no functional delta; verify unchanged |

## Error Handling Strategy

| Error Scenario | Handling |
| --- | --- |
| Cherry-pick conflict | Stop, inspect both versions, preserve FeastFlow isolation, then verify the adapted file. |
| Existing equivalent patch | Skip it and record it as already covered. |
| Verification failure | Do not commit/push the failing repository. |
| Missing deployment secret | Preflight fails closed; do not build URL-bound images or start containers. |

## Tech Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Sync mechanism | Ordered cherry-picks of verified release deltas | Preserves auditability and makes omissions visible. |
| Infrastructure conflicts | Keep FeastFlow version | Prevents cross-product data/domain/credential leakage. |
| Deployment | Staging only after protected preflight passes | FeastFlow Production platform is a separate first launch. |
