# WinOrder Exact-Name Matching Design

**Spec**: `.specs/features/winorder-name-matching/spec.md`
**Status**: Approved by implementation authorization

## Architecture

The existing WinOrder bounded context remains unchanged. The exporter resolves optional overrides and otherwise emits local names. The Restaurant Admin performs WinOrder master-file parsing and comparison locally; no new upload endpoint or stored vendor catalog is introduced.

## Reuse

| Component | Reuse |
| --- | --- |
| `WinOrderPollingService` | Existing payload, leasing, retry, payment-label, and variation-fallback flow. |
| `WinOrderMappingService` | Existing tenant-scoped connection/catalog validation and atomic replacement. |
| `OrdersIntegrationService` | Existing Prisma-decimal normalization boundary. |
| WinOrder Admin page | Existing mapping drafts, branch scope, permissions, and save flow. |

## Components

| Component | Change |
| --- | --- |
| Prisma mapping model | Make `external_article_no` nullable with an additive migration. |
| Mapping DTO/service/repository | Accept optional name/number fields, reject empty overrides, and stop treating local names as missing manual mappings. |
| Polling service | Resolve exact override, base override, or local name; optional modifiers; preserve explicit service-charge mapping. |
| Order integration port/service | Normalize the customer-paid transaction fee for WinOrder. |
| Catalog parser | Parse documented CSV and XML export fields and report missing/duplicate names. |
| Admin mapping UI | Present exact-name defaults and optional overrides; add local catalog-file comparison. |

## Data Contract

```typescript
type CatalogMapping = {
  externalArticleNo: string | null;
  externalArticleName: string | null;
};

type IntegrationOrder = {
  paymentFeeAmount: number;
};
```

## Error Handling

| Scenario | Handling |
| --- | --- |
| Empty override | API returns `BadRequestException`. |
| Malformed/unsupported catalog file | Client shows a localized error; no API request occurs. |
| Unmatched WinOrder catalog name | Readiness report lists it; export still uses the documented name-matching contract. |
| Missing generic service-charge mapping | Existing retryable export failure remains. |

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Default match key | DeliveryWay base item/modifier name | WinOrder's recommended productive setup. |
| Variation representation | Base name + `ArticleSize` | Vendor-confirmed; avoids per-size mappings. |
| Catalog comparison location | Browser | Avoids storing/uploading POS master data and requires no new API. |
| Service charge | Retain explicit article mapping | No documented generic service-charge field exists. |
| VAT | Continue sending source tax as informational input | WinOrder explicitly applies the matched article's configured VAT. |
