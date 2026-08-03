# Cart and Printer Reliability Specification

## Problem Statement

Customer cart mutations rebuild and refetch the full cart repeatedly. Deal additions amplify
that cost by submitting each deal line sequentially. Restaurant printer setup currently
persists metadata without discovering, validating, or testing a local printer.

## Goals

- [x] Add a complete deal to the cart with one backend request and one final cart build.
- [x] Avoid the former sequential mutation, quote, and query-invalidation waterfall.
- [x] Prevent incomplete printer settings from being accepted.
- [x] Discover installed restaurant printers through a local QZ Tray bridge and test the
      selected printer before reporting a healthy connection.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Replacing existing single-item cart endpoints | Backward compatibility is required. |
| Database schema changes | Existing cart and printing settings can represent the fix. |
| Silent unattended QZ signing/certificate rollout | Requires restaurant installation and production certificate operations. |
| Cloud provider printer provisioning | No provider credentials or contract were supplied. |

## User Stories

### P1: Fast atomic deal addition

**User Story**: As a customer, I want a complete deal added in one operation so that I do
not wait for each deal line to be recalculated separately.

**Acceptance Criteria**:

1. WHEN a valid deal payload contains multiple cart lines THEN the backend SHALL validate
   every line, persist all lines, and return one final cart response.
2. WHEN any line is invalid THEN the backend SHALL persist none of the submitted lines.
3. WHEN the customer website receives the batch response THEN it SHALL update cart state
   without submitting sequential add-item requests or an immediate quote request.

**Independent Test**: Submit a three-line deal and prove one batch request returns all
three lines; submit one invalid line and prove no line is added.

### P1: Valid printer connection

**User Story**: As a restaurant admin, I want to select and test a real installed printer so
that saved settings reflect a usable printer rather than empty metadata.

**Acceptance Criteria**:

1. WHEN a local connection type is selected THEN the Admin SHALL connect to QZ Tray and
   list installed printers.
2. WHEN no printer is selected THEN the Admin SHALL prevent connection/save and display a
   validation error.
3. WHEN a printer is selected and Test Print is used THEN the Admin SHALL send a test
   ticket and report the result to the backend health log.
4. WHEN printing is enabled with incomplete effective settings THEN the backend SHALL
   reject the update.
5. WHEN QZ Tray is missing or unreachable THEN the Admin SHALL show an actionable error
   and SHALL NOT report a successful connection.

**Independent Test**: Mock QZ discovery/test success and failure, then verify selection,
validation, persisted settings, and health-event reporting.

## Edge Cases

- WHEN a batch contains more than 25 lines THEN the API SHALL reject it.
- WHEN duplicate selections are submitted THEN existing cart merge semantics SHALL apply.
- WHEN a batch transaction fails THEN no partial deal rows SHALL remain.
- WHEN printing is disabled THEN an incomplete printer configuration MAY be cleared.
- WHEN a local printer event is reported outside the authenticated restaurant/branch scope
  THEN the backend SHALL reject it.

## Requirement Traceability

| Requirement ID | Story | Status |
| --- | --- | --- |
| CARTPERF-01 | Atomic deal batch | Complete |
| CARTPERF-02 | Atomic rollback | Complete |
| CARTPERF-03 | Remove request waterfall | Complete |
| PRINT-01 | Local discovery | Complete |
| PRINT-02 | Connection validation | Complete |
| PRINT-03 | Test print | Complete |
| PRINT-04 | Scoped health reporting | Complete |

## Success Criteria

- [x] A multi-line deal uses one mutation request and one final cart response build.
- [x] Invalid deal batches are atomic.
- [x] Empty printer configuration cannot return a success toast.
- [x] Installed printers can be selected and a test ticket can be sent through QZ Tray.
