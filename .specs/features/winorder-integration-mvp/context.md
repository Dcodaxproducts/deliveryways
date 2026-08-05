# WinOrder Integration MVP Context

## Confirmed Product Decisions

- The first target is one American Corner branch, but no American Corner identifier or label may be hardcoded.
- WinOrder uses dedicated branch-scoped machine credentials. These are never the human `BRANCH_ADMIN` credentials.
- DeliveryWays generates the machine username and random secret. The secret is shown once and stored only as a hash.
- A restaurant Business Admin/tenant owner performs normal setup, rotation, mapping, and diagnostics from Restaurant Admin.
- Branch Admin is read-only for its own branch during MVP. Super Admin may oversee, disable, or rotate for support.
- The MVP is WinOrder REST polling only. SOAP article synchronization is deferred.
- Missing client master data does not block development; spec fixtures/mocks provide the initial proof surface.

## Source Contract

- WinOrder EShop Specification v1.8.14 (2024-04-10), 34 pages.
- Official reference: `https://github.com/WinOrder/PHP-EShop-Server`.
- WinOrder configures an HTTPS base URL plus username/password.
- WinOrder calls `GET /GetNewOrders` with Basic Authentication.
- WinOrder calls `POST /SendTrackingStatus` with Basic Authentication and repeats `username` and `password` headers.
- Tracking callback JSON uses lowercase keys: `ordersid`, `trackingstatus`, `message`, `deliver_minutes`, `deliver_eta`, and `reject_reason`.
- Acknowledgement is tracking status `0` or `OK`; after acknowledgement the order must not be offered again.

## Agent Discretion

- Exact table and class names, provided they are WinOrder-prefixed and module-owned.
- Lease duration and poll batch limit, provided they are bounded and covered by tests.
- Page composition and responsive layout within existing Restaurant Admin conventions.
- Whether optional zero-value WinOrder payload fields are omitted or serialized as zero/empty strings.

