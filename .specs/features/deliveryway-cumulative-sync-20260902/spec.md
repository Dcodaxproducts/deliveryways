# FeastFlow Cumulative DeliveryWay Sync Specification

## Problem Statement

FeastFlow must receive the latest verified DeliveryWay release without importing DeliveryWay branding, domains, credentials, runtime names, or deployment state. The cumulative source includes order recovery/default-branch controls, unified onboarding and billing behavior, and weekly payout monthly-fee accounting.

## Goals

- [ ] Port the cumulative verified source release into the corresponding FeastFlow repositories.
- [ ] Preserve FeastFlow product identity, English defaults, domains, provider boundaries, and environment contracts.
- [ ] Leave Production ready but stopped until provider values and explicit launch approval are supplied.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Production container/database launch | Provider values and explicit launch approval are pending. |
| Production migration execution | Requires a verified Production backup and launch approval. |
| DeliveryWay mobile application changes | FeastFlow sync covers the platform repositories only. |
| Unverified DeliveryWay work | Only the cumulative verified release heads are in scope. |

## P1: Cumulative Platform Sync

**User Story**: As the FeastFlow owner, I want the latest verified platform behavior so FeastFlow stays current without losing its separate identity.

**Acceptance Criteria**:

1. WHEN the API delta from `55a7003` through `4cfc73b` is applied THEN FeastFlow SHALL expose the same order, branch, onboarding, invoicing, and weekly payout contracts.
2. WHEN the Restaurant Admin delta from `fdf5909` through `f0f9aa2` is applied THEN FeastFlow SHALL expose the corresponding storefront controls, branch restrictions, and monthly billing status.
3. WHEN the Superadmin delta from `5da81a7` through `07dbbe5` is applied THEN FeastFlow SHALL expose order uncancel, default-branch, payout, and invoice controls.
4. WHEN the Landing delta from `a9b6472` through `06e69d6` is applied THEN registration SHALL preserve package selection without immediate package-payment redirection.
5. WHEN all changes are scanned THEN tracked files SHALL contain no DeliveryWay domains, runtime paths, image identifiers, or product branding.

**Independent Test**: Run each repository's full verification surface and compare the adapted file set against the source delta.

## P1: Production Edge Readiness

**User Story**: As the release owner, I want FeastFlow domains and runtime contracts ready so launch can begin immediately after secrets are supplied and approved.

**Acceptance Criteria**:

1. WHEN DNS is queried authoritatively THEN exact and wildcard FeastFlow hosts SHALL resolve to the approved server.
2. WHEN TLS is checked THEN `feastflow.co` and `*.feastflow.co` SHALL be covered by a valid certificate.
3. WHEN reverse proxies are inspected THEN API, Partner, Superadmin, and wildcard storefronts SHALL target the reserved FeastFlow loopback ports.
4. WHEN the guarded Production preflight is run before provider values exist THEN it SHALL stop without starting containers, creating a database, or applying migrations.
5. WHEN legacy demo hosts are checked THEN they SHALL remain available and unchanged.

**Independent Test**: Run read-only DNS/TLS/vhost/preflight checks and confirm zero FeastFlow Production containers/database mutations.

## Edge Cases

- WHEN an order was cancelled before prior-status capture existed THEN uncancel SHALL restore it to `PLACED`.
- WHEN a payout period crosses UTC months THEN monthly caps and fixed-fee liability SHALL be attributed to each applicable calendar month.
- WHEN a fifth weekly payout occurs after the monthly fee is fully collected THEN it SHALL deduct zero additional fixed monthly fee.
- WHEN provider values are blank THEN Production preparation SHALL remain non-mutating.

## Requirement Traceability

| Requirement ID | Requirement | Status |
| --- | --- | --- |
| SYNC-01 | Cumulative API behavior | In Tasks |
| SYNC-02 | Restaurant Admin behavior | In Tasks |
| SYNC-03 | Superadmin behavior | In Tasks |
| SYNC-04 | Landing onboarding behavior | In Tasks |
| SYNC-05 | FeastFlow isolation | In Tasks |
| EDGE-01 | DNS/TLS/proxy readiness | In Tasks |
| EDGE-02 | Guarded non-mutating preflight | In Tasks |

**Coverage**: 7 total, 7 mapped, 0 unmapped.

## Success Criteria

- [ ] All affected repositories pass their complete verification surfaces.
- [ ] Every FeastFlow commit is pushed by non-force fast-forward.
- [ ] Production domains and proxies are ready while Production runtime remains stopped.

