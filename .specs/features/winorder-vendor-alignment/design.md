# WinOrder Vendor Alignment Design

**Spec**: `.specs/features/winorder-vendor-alignment/spec.md`
**Status**: Approved by implementation authorization

## Architecture

No new module, table, or endpoint is introduced. The existing WinOrder bounded context remains responsible for connection DTOs, safe persistence, endpoint presentation, mapping readiness, and payload export.

## Components

| Component | Change | Reuse |
| --- | --- | --- |
| Connection DTO/repository/service | Accept and persist nullable Store ID; present fixed endpoint plus optional compatibility endpoint | Existing validation, tenant scope, Basic Auth, store-route assertion |
| Polling service | Resolve payment labels and variation mappings with narrow vendor defaults | Existing mapping maps, retry/mark-failed flow |
| Mapping service | Treat a mapped base item as coverage for its variants | Existing catalog keys and missing-key response |
| Restaurant Admin | Remove Store ID gating, send nullable Store ID, and explain fixed URL/default labels | Existing page, services, translations, tests |

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Cash label | Always `Barzahlung` for COD | Vendor requires blank or this exact string. |
| Online default | Stripe/PayPal/Wallet default to `Über DeliveryWay online bezahlt` | These are DeliveryWay-paid online methods confirmed by the vendor. |
| Other non-cash methods | Require explicit mapping | Avoid falsely labeling payment-at-delivery or transfer methods as already paid online. |
| Variation fallback | Exact variation mapping, then base item mapping | Preserves operator overrides while using WinOrder's automatic variant creation. |
| Modifiers/service charge | Continue requiring mappings | Vendor behavior is not confirmed. |

## Error Handling

- Invalid Store ID input is rejected by DTO/UI validation.
- Unsupported unmapped payment methods and unmapped articles remain in the existing retryable failed-export path.
- No live database migration is required because `store_id` is already nullable.
