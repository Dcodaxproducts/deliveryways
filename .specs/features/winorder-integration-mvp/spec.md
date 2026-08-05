# WinOrder Integration MVP Specification

## Problem Statement

DeliveryWays orders currently require manual re-entry into a restaurant's WinOrder POS. The MVP shall expose WinOrder-compatible, branch-scoped polling endpoints and give a restaurant business administrator the tools to configure credentials and catalog/payment mappings without hardcoding restaurant data.

## Goals

- [ ] A WinOrder installation can securely poll and acknowledge orders for exactly one configured DeliveryWays branch.
- [ ] DeliveryWays exports only fully mapped orders and prevents duplicate POS imports across repeated polls.
- [ ] WinOrder status and ETA callbacks update the corresponding DeliveryWays order through the Orders module's public contract.
- [ ] A Business Admin can configure, validate, rotate, disable, and monitor a branch connection in Restaurant Admin.

## Out of Scope

| Feature | Reason |
| --- | --- |
| WinOrder SOAP article synchronization | Defer until the REST order/status path is proven with a live POS. |
| Automatic import of WinOrder master data | The MVP uses explicit mappings supplied by the restaurant. |
| Hardcoded American Corner IDs or labels | The integration must remain reusable for every tenant and branch. |
| DeliveryWays connecting to a restaurant Windows PC | WinOrder is the polling client; no inbound restaurant-network access is required. |
| Automatic refund execution | Refund authority and accounting rules require live-client confirmation. |

## User Stories

### P1: Configure a Branch Connection

**User Story**: As a Business Admin, I want to enable WinOrder for one of my branches and generate dedicated integration credentials so that the POS can authenticate without using a human login.

**Acceptance Criteria**:

1. WHEN a Business Admin enables WinOrder for an owned branch THEN DeliveryWays SHALL generate a unique integration username and strong secret, show the secret only in that response, and persist only its hash.
2. WHEN a Business Admin rotates credentials THEN DeliveryWays SHALL invalidate the previous secret immediately.
3. WHEN a Branch Admin reads integration state THEN DeliveryWays SHALL restrict the request to the token branch and SHALL NOT expose secret material.
4. WHEN a user attempts to configure a branch outside their tenant/restaurant scope THEN DeliveryWays SHALL reject the request.

**Independent Test**: Generate credentials, authenticate with them, rotate them, and prove only the replacement secret works for the same branch.

### P1: Configure Catalog and Payment Mappings

**User Story**: As a Business Admin, I want to map DeliveryWays sellable records and payment methods to WinOrder identifiers so that exported orders contain valid POS master-data references.

**Acceptance Criteria**:

1. WHEN mappings are saved THEN DeliveryWays SHALL validate that local item, variation, and modifier records belong to the connection's restaurant.
2. WHEN a local record is mapped twice for one connection THEN DeliveryWays SHALL replace/update the mapping rather than create an ambiguous duplicate.
3. WHEN a payment method is enabled for export THEN it SHALL have one non-empty WinOrder payment label.
4. WHEN an order contains an unmapped sellable component or charge requiring a configured article THEN DeliveryWays SHALL withhold that order and expose a deterministic mapping error.

**Independent Test**: Map one item, variation, modifier, and payment method; verify validation rejects cross-restaurant IDs and reports an omitted mapping.

### P1: Poll New Orders Idempotently

**User Story**: As WinOrder, I want to poll a branch endpoint for new orders so that I can import them without duplicate orders.

**Acceptance Criteria**:

1. WHEN valid integration credentials call `GetNewOrders` THEN DeliveryWays SHALL return only eligible orders for the credential's branch in an `OrderList` envelope.
2. WHEN invalid, disabled, or rotated credentials call the endpoint THEN DeliveryWays SHALL return an authentication failure without revealing which credential field failed.
3. WHEN the same unacknowledged order is polled again after its lease expires THEN DeliveryWays MAY return it again with the same DeliveryWays order identity.
4. WHEN an order has been acknowledged THEN later polls SHALL NOT return it again.
5. WHEN concurrent polls occur THEN at most one active delivery lease SHALL be created for each branch/order pair.

**Independent Test**: Poll twice concurrently, acknowledge once, then prove the order is absent from subsequent polls.

### P1: Receive Tracking Status and ETA

**User Story**: As WinOrder, I want to send acknowledgement, order status, and ETA updates so that DeliveryWays and its customer remain synchronized.

**Acceptance Criteria**:

1. WHEN WinOrder posts acknowledgement status `0` for an exported order THEN DeliveryWays SHALL mark the export acknowledged idempotently.
2. WHEN WinOrder posts a supported operational status THEN DeliveryWays SHALL map it through the Orders module public contract and record the callback audit event.
3. WHEN WinOrder repeats an identical callback THEN DeliveryWays SHALL return success without applying the order transition twice.
4. WHEN a callback references an order not exported through that connection THEN DeliveryWays SHALL reject it.
5. WHEN a transition is invalid for the current DeliveryWays order state THEN DeliveryWays SHALL record the failure and leave the order state unchanged.

**Independent Test**: Submit acknowledgement and a repeated status payload; verify one state transition and two successful idempotent responses.

### P1: Operate and Diagnose the Connection

**User Story**: As a restaurant operator, I want connection health and mapping/export errors so that I can fix setup problems without database access.

**Acceptance Criteria**:

1. WHEN the configuration page loads THEN it SHALL show enabled state, credential username, endpoint URL, last poll, last successful callback, mapping counts, and recent errors without secrets.
2. WHEN mappings are incomplete THEN the page SHALL identify the affected DeliveryWays records.
3. WHEN a failed export is retried after mappings are fixed THEN DeliveryWays SHALL make it eligible for a later poll without duplicating an acknowledged export.

**Independent Test**: Produce an unmapped-item error, add the mapping, retry, and observe the order in the next poll.

## Edge Cases

- WHEN a restaurant has multiple branches THEN each connection SHALL have distinct credentials, mappings, leases, and health state.
- WHEN an order contains a deleted catalog record THEN export SHALL rely on the order snapshot plus its retained local IDs and require an existing mapping.
- WHEN WinOrder is disabled during an active lease THEN polling and callbacks SHALL fail authentication; acknowledged history SHALL remain auditable.
- WHEN payment, tip, delivery fee, or service charge is zero THEN DeliveryWays SHALL omit the corresponding synthetic line.
- WHEN a payload contains an unsupported status code THEN DeliveryWays SHALL reject it without mutating the order.

## Requirement Traceability

| Requirement ID | Capability | Status |
| --- | --- | --- |
| WIN-01 | Branch-scoped generated machine credentials | Pending |
| WIN-02 | Credential rotation, disable, and non-disclosure | Pending |
| WIN-03 | Catalog and payment mappings | Pending |
| WIN-04 | Mapping completeness validation | Pending |
| WIN-05 | Branch-scoped `GetNewOrders` export | Pending |
| WIN-06 | Lease-based duplicate prevention | Pending |
| WIN-07 | Idempotent acknowledgement/status callback | Pending |
| WIN-08 | Orders module public transition contract | Pending |
| WIN-09 | Health, diagnostics, and retry operations | Pending |
| WIN-10 | Restaurant Admin configuration UX | Pending |

## Success Criteria

- [ ] All ten requirements map to design components, executable tasks, and automated tests.
- [ ] No credential or endpoint can cross tenant, restaurant, or branch boundaries.
- [ ] Repeated polling/callbacks cannot create duplicate acknowledged POS exports or duplicate state transitions.
- [ ] No American Corner-specific identifier is committed in application code.
