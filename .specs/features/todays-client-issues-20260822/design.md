# DeliveryWay Today's Client Issues — Design

## Architecture

- API remains authoritative for permissions, payout math, active subscription terms, invoice snapshots, and item sort order.
- Restaurant Admin consumes scoped report/invoice responses and displays active payout terms.
- Customer checkout preserves the existing quote contract and changes only tip interaction.
- Super Admin reuses the generated-invoice PDF endpoint and existing subscription invoice modal.

## Existing Components Reused

| Area | Existing component |
|---|---|
| Staff access | `RolesGuard` route-access mapping and scope hydration |
| Payout calculation | `PackagePlansService.getRestaurantPayoutBalanceSummary` |
| Checkout fees | cart quote `transactionFee*` and `chargeBreakdown` contract |
| Invoices | `GET /admin/reports/generated-invoices/:id/pdf` |
| Item ordering | `MenuItemRepository` and existing reorder flow |

## Decisions

- New subscription terms affect the live payout calculation response but do not mutate payment rows or generated historical invoices.
- Item pagination uses one active observer and a stable backend order tie-breaker.
- Tip presets use currency amounts in the restaurant currency; labels render through existing currency formatting.
- Obsolete global transaction settings are removed only from Restaurant Admin presentation/submission, not destructively migrated from stored global settings.

## Error Handling

- Existing API error envelopes and frontend toasts remain in use.
- Invoice View handles popup blocking and PDF request failure.
- Failed pagination fetch keeps already loaded items and allows retry.

