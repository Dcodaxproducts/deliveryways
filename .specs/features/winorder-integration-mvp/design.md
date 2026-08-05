# WinOrder Integration MVP Design

**Spec**: `.specs/features/winorder-integration-mvp/spec.md`  
**Context**: `.specs/features/winorder-integration-mvp/context.md`  
**Status**: Approved through the user's instruction to begin implementation with missing live data filled during testing.

## Architecture Overview

`WinOrderIntegrationModule` is a bounded context that owns connection credentials, catalog/payment mappings, export leases, and callback audit events. It never imports Orders or Menu internals: those modules expose narrow public ports for normalized order export/state transitions and catalog reference validation. WinOrder remains the polling client, so no DeliveryWays process connects to a restaurant PC.

The module uses the existing Controller → Service → Repository pattern and simple services; CQRS is unnecessary for the MVP.

## Code Reuse Analysis

| Component | Location | Use |
| --- | --- | --- |
| Global guards and role decorators | `src/common/guards`, `src/common/decorators` | Admin endpoint authentication and tenant/role checks. |
| `OrdersRepository` and order transition side effects | `src/modules/orders/` | Implement the Orders-owned public integration port. |
| Menu repositories | `src/modules/menu/` | Implement a Menu-owned public catalog validation/listing port. |
| `bcrypt` | Existing auth/branch onboarding | Hash and compare one-time integration secrets. |
| `crypto.randomBytes` / SHA-256 | Node standard library | Generate secrets and deterministic callback fingerprints. |
| Existing Axios client and branch picker | Restaurant Admin `src/lib/axios.ts`, branch services/components | Integration API calls and branch selection. |
| Existing page/header/card/form components | Restaurant Admin components | Build a consistent integrations page. |

## Backend Components

### WinOrder Admin Controller

- **Location**: `src/modules/winorder-integration/winorder-admin.controller.ts`
- **Purpose**: Business/Super Admin configuration APIs and Branch Admin read-only health.
- **Endpoints**:
  - `GET /winorder/connections?branchId=`
  - `POST /winorder/connections`
  - `PATCH /winorder/connections/:id`
  - `POST /winorder/connections/:id/credentials/rotate`
  - `GET /winorder/connections/:id/catalog`
  - `PUT /winorder/connections/:id/catalog-mappings`
  - `PUT /winorder/connections/:id/payment-mappings`
  - `GET /winorder/connections/:id/health`
  - `POST /winorder/connections/:id/exports/:exportId/retry`

### WinOrder Polling Controller

- **Location**: `src/modules/winorder-integration/winorder-polling.controller.ts`
- **Purpose**: WinOrder-compatible machine endpoints.
- **Endpoints**:
  - `GET /winorder/GetNewOrders`
  - `POST /winorder/SendTrackingStatus`
- **Authentication**: HTTPS Basic Auth. The POST's duplicate `username`/`password` headers must match when present.

### WinOrder Machine Auth Guard

- **Purpose**: Parse Basic credentials, find an enabled connection by username, compare the hash, reject generically, and attach a safe connection principal to the request.
- **Invariant**: It never issues a normal JWT or grants human admin permissions.

### WinOrder Integration Service

- **Purpose**: Scope admin actions, generate/rotate credentials, validate mappings through the Menu port, lease export candidates through the Orders port, map them to WinOrder JSON, and process callbacks idempotently.
- **Poll limits**: 25 orders per response; five-minute renewable lease; acknowledged exports are terminal.

### Orders Integration Port

- **Public location**: `src/modules/orders/index.ts`
- **Interfaces**:
  - `listWinOrderExportCandidates(branchId, limit)` returns normalized order/customer/address/item/modifier snapshots.
  - `applyWinOrderStatus(input)` applies the Orders-owned valid transition path and ETA fields, then emits existing notification/chat/realtime side effects.
- **Boundary**: WinOrder passes IDs/status intent only and never writes the `orders` table itself.

### Menu Integration Catalog Port

- **Public location**: `src/modules/menu/index.ts`
- **Interfaces**:
  - `listWinOrderCatalog(restaurantId)` returns sellable item+variation keys and modifier keys.
  - `validateWinOrderCatalogKeys(restaurantId, keys)` rejects missing/cross-restaurant keys.
- **Boundary**: WinOrder never queries Menu-owned tables directly.

## Data Models

All WinOrder-owned tables include non-null `tenant_id`, `restaurant_id`, and `branch_id`, with tenant-first indexes. Existing DeliveryWays has no active database RLS/session-context framework; therefore this feature enforces tenant filters in every repository operation and adds cross-tenant regression tests. Introducing isolated FORCE RLS would make machine authentication impossible under the current connection model and is deferred to the project-wide tenant-extension/RLS initiative.

### `WinOrderConnection`

- One record per branch (`branchId` unique).
- Stores generated username, bcrypt password hash, credential version, store ID/name, enabled state, and health timestamps.
- Never stores plaintext password.

### `WinOrderCatalogMapping`

- Stores module-local `localKey` → WinOrder `ArticleNo` and optional display name.
- Mapping types: `ITEM`, `MODIFIER`, `SERVICE_CHARGE`.
- Item keys represent a sellable combination, not a shared variation alone: `item:<menuItemId>:base` or `item:<menuItemId>:variation:<variationId>`.
- Unique by connection, type, and local key.

### `WinOrderPaymentMapping`

- Stores DeliveryWays `PaymentMethod` → exact WinOrder master-data label.
- Unique by connection and payment method.

### `WinOrderOrderExport`

- Stores DeliveryWays order ID as an opaque cross-module identifier (no Prisma relation).
- States: `PENDING`, `LEASED`, `ACKNOWLEDGED`, `FAILED`.
- Unique by connection and order ID, with lease expiry, attempts, acknowledgement, and last error.

### `WinOrderStatusEvent`

- Immutable callback audit record with deterministic fingerprint, status, message, ETA, reject reason, result, and error.
- Unique by connection and fingerprint for idempotency.

### Orders-owned ETA Fields

- `estimatedCompletionAt DateTime?`
- `estimatedPreparationMinutes Int?`

These fields remain owned and updated by Orders through its public integration port.

## WinOrder Payload Mapping

| DeliveryWays | WinOrder |
| --- | --- |
| Order ID | `OrderID` |
| Branch configured values | `StoreData.StoreId`, `StoreData.StoreName` |
| Scheduled/order time | `AddInfo.DateTimeOrder` |
| Discount amount | `AddInfo.DiscountValue` |
| Delivery fee | `AddInfo.DeliverLumpSum` |
| Order type | `AddInfo.DeliverType` (`Lieferung`, `Abholung`, `dine-in`) |
| Payment mapping | `AddInfo.PaymentType` |
| Tip | `AddInfo.Tip` |
| Total | `AddInfo.Total` |
| Item/variation mapping | `Article.ArticleNo` |
| Item snapshot | `ArticleName`, `ArticleSize`, `Count`, `Price`, `Tax`, `Deposit`, `Comment` |
| Modifier mapping | `SubArticle.ArticleNo` plus snapshot name/count/price |
| Service charge mapping | Synthetic `Article` line when non-zero |

The response always uses `{ "OrderList": { "CreateDateTime": RFC3339, "Order": [] } }`, including an empty order array.

## Tracking Status Mapping

| WinOrder | DeliveryWays action |
| --- | --- |
| `0`, `OK` | Mark export acknowledged; no order status change. |
| `1` | Progress to `CONFIRMED`. |
| `2`, `3`, `4` | Progress to `PREPARING`. |
| `5` | Delivery: progress to `OUT_FOR_DELIVERY`; other order types remain preparing and audit the callback. |
| `6` | Delivery → `DELIVERED`; takeaway → `PICKED_UP`; dine-in → `SERVED`. |
| `7` | Progress to `REJECTED` when allowed. |
| `8` | Audit refund signal only; no automatic payment mutation in MVP. |
| `9` | Mark export failed with WinOrder's message for retry/manual review. |
| `10` | Progress to `CANCELLED` when allowed. |
| `11` | Audit for manual review; no order mutation. |

Orders owns intermediate transition progression when WinOrder skips a status callback.

## Error Handling

| Scenario | Handling | User impact |
| --- | --- | --- |
| Invalid machine credentials | Generic 401 | No username/secret disclosure. |
| Disabled connection | Generic 401 | Polling stops; history retained. |
| Cross-scope admin request | 403 | No tenant/restaurant/branch leakage. |
| Missing catalog/payment/service mapping | Export marked failed/withheld | Health page identifies local keys. |
| Duplicate poll | Existing active lease reused/withheld | No duplicate concurrent delivery. |
| Duplicate callback | Existing fingerprint result returned | No duplicate state transition. |
| Invalid order transition | Audit event failed; order unchanged | Error shown in recent integration events. |

## Restaurant Admin Components

- Route: `/integrations/winorder`.
- Sidebar entry under the account/settings section, Business Admin and Branch Admin visible.
- Service module with normalized typed responses and mutation methods.
- Page sections:
  - branch selector and enabled state
  - endpoint URL and username; one-time credential modal after generate/rotate
  - Store ID/name
  - catalog mapping table for item/variation and modifier keys
  - payment mapping inputs
  - service-charge mapping
  - health cards and recent export/callback errors
- Business Admin can mutate. Branch Admin receives a read-only view for its token branch.

## Requirement Coverage

| Requirement | Components |
| --- | --- |
| WIN-01, WIN-02 | Connection model, admin controller/service, auth guard |
| WIN-03, WIN-04 | Catalog/payment models, Menu port, mapper |
| WIN-05, WIN-06 | Polling controller, Orders port, export leases |
| WIN-07, WIN-08 | Status events, callback service, Orders port |
| WIN-09 | Health/retry queries and dashboard sections |
| WIN-10 | Restaurant Admin route, service, components, role states |

