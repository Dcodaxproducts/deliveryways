# Deliveryway Cumulative Sync 2026-08-28 Specification

## Problem Statement

FeastFlow was forked from Deliveryway and last received verified functional changes through 2026-08-22. Deliveryway has since shipped verified corrections across checkout, reporting, socket stability, menu capacity, branch deletion, and realtime order notifications that must be deliberately ported without weakening FeastFlow product isolation.

## Goals

- [ ] Port every functional commit in the verified Deliveryway release heads that is not already patch-equivalent in FeastFlow.
- [ ] Preserve FeastFlow branding, domains, environment contracts, image names, databases, credentials, and deployment projects.
- [ ] Prove the cumulative result with repository-native type, build, lint, test, policy, branding, and Compose checks.
- [ ] Push isolated FeastFlow sync branches before any environment deployment.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Deliveryway client data or credentials | FeastFlow is a separate product and tenant platform. |
| FeastFlow Production bootstrap | Protected Production configuration and explicit first-launch approval are absent. |
| Provider-secret fabrication | Google, AWS, Stripe, and Firebase values must come from their real FeastFlow projects. |
| Unverified Deliveryway `main` work | Only the explicitly verified cumulative release heads are source material. |

## User Stories

### P1: Cumulative product sync

**User Story**: As the platform owner, I want FeastFlow to contain the latest verified shared fixes so that both products have the same corrected behavior.

**Acceptance Criteria**:

1. WHEN a Deliveryway release commit has no FeastFlow patch equivalent THEN FeastFlow SHALL contain an adapted equivalent.
2. WHEN an adapted change touches product configuration THEN FeastFlow SHALL retain FeastFlow-only names, URLs, images, and storage boundaries.
3. WHEN the sync is complete THEN all repository-native verification SHALL pass before push.

**Independent Test**: Compare patch ancestry and run the full proof surface in each FeastFlow repository.

### P1: Safe release readiness

**User Story**: As an operator, I want immutable verified FeastFlow revisions so that Staging can be deployed without mixing Deliveryway infrastructure.

**Acceptance Criteria**:

1. WHEN branches are pushed THEN each FeastFlow repository SHALL expose an exact immutable commit.
2. WHEN deployment preflight runs THEN missing protected prerequisites SHALL fail closed before changing containers or data.

**Independent Test**: Run FeastFlow Compose/config/preflight checks using its protected environment contract.

## Edge Cases

- WHEN an upstream patch is already functionally present under a different FeastFlow commit THEN it SHALL not be duplicated.
- WHEN a cherry-pick conflicts with FeastFlow branding or deploy files THEN the FeastFlow version SHALL remain authoritative.
- WHEN a schema migration is present THEN no live migration SHALL run without a fresh database backup and a validated forward plan.

## Requirement Traceability

| Requirement ID | Story | Status |
| --- | --- | --- |
| SYNC-01 | Cumulative product sync | Implementing |
| SYNC-02 | Product isolation | Implementing |
| SYNC-03 | Full verification | Pending |
| SYNC-04 | Immutable branches | Pending |
| SYNC-05 | Fail-closed deployment gate | Pending |

## Success Criteria

- [ ] API, Restaurant Admin, Superadmin, Customer, and Landing verification pass.
- [ ] Zero Deliveryway brand/server identifiers are introduced.
- [ ] Staging and Production Compose contracts retain `feastflow-*` names and ports.
- [ ] Exact pushed commit hashes are recorded for handoff.
