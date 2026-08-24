# FeastFlow Brand Decontamination Specification

## Problem Statement

The new FeastFlow platform was initialized from another delivery-platform codebase and still contains copied identity, client fixtures, domains, operational targets, and image assets. Those remnants could expose the wrong brand to users or route future FeastFlow operations toward unrelated infrastructure.

## Goals

- [ ] Make every runtime and user-facing default identify the product as FeastFlow.
- [ ] Remove copied client, domain, server, database, container, and browser-storage identifiers from tracked files.
- [ ] Use the existing official FeastFlow logo in every application fallback.
- [ ] Keep deployment resources isolated under FeastFlow-owned names and verified-free ports.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Deploying staging or production | Requires separate deployment approval and credentials. |
| Rebranding the legacy Laravel/Flutter demo | It is an independent live system. |
| Redesigning the UI | This pass replaces identity and assets without changing product behavior. |

## User Stories

### P1: Consistent FeastFlow identity

**User Story**: As a FeastFlow user, I want every platform surface to identify itself as FeastFlow so that the product has one trustworthy identity.

**Acceptance Criteria**:

1. WHEN any application renders metadata, logos, invoices, exports, emails, or fallback branding THEN it SHALL use FeastFlow identity.
2. WHEN a repository is searched for the source-product identity THEN tracked runtime, test, deployment, data, and documentation files SHALL return no matches.

**Independent Test**: Search all five repositories and build every application.

### P1: Isolated FeastFlow operations

**User Story**: As an operator, I want FeastFlow deployment assets to target only FeastFlow resources so that unrelated projects cannot be affected.

**Acceptance Criteria**:

1. WHEN deployment scripts run THEN they SHALL use FeastFlow project, container, lock, marker, backup, and release identifiers.
2. WHEN custom-domain provisioning is enabled THEN the server IP, Plesk webspace, and storefront port SHALL be explicit FeastFlow inputs.
3. WHEN Compose renders THEN FeastFlow staging and production SHALL use their allocated loopback-only port ranges.

**Independent Test**: Shell tests, Compose rendering, and an exhaustive tracked-file scan pass.

### P1: Clean FeastFlow fixtures and defaults

**User Story**: As a developer, I want tests and defaults to use neutral FeastFlow fixtures so that copied client data is not retained or reintroduced.

**Acceptance Criteria**:

1. WHEN tests and examples create restaurants, domains, emails, or storage values THEN they SHALL use FeastFlow-owned or reserved example values.
2. WHEN a clean database is initialized THEN its default business identity SHALL be FeastFlow.

**Independent Test**: Full backend and frontend test suites pass after the replacement.

## Requirement Traceability

| Requirement ID | Requirement | Status |
| --- | --- | --- |
| BRAND-01 | Runtime and user-facing identity is FeastFlow | Verified |
| BRAND-02 | Official FeastFlow assets replace copied assets | Verified |
| BRAND-03 | Operational resources are FeastFlow-scoped | Verified |
| BRAND-04 | Client-specific fixtures and defaults are removed | Verified |
| BRAND-05 | All repos pass exhaustive scans and verification | Verified |

## Success Criteria

- [x] Zero copied identity/client/server matches in tracked files.
- [x] Official FeastFlow logo is used by all fallback-brand surfaces.
- [x] All affected repositories pass typecheck, lint, build, and tests.
- [x] All changes are committed and pushed to their `main` branches.
