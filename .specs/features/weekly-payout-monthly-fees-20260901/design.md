# Weekly Payout Monthly Billing Design

**Spec**: `.specs/features/weekly-payout-monthly-fees-20260901/spec.md`
**Status**: Approved from the user's supplied calculation and follow-up instruction

## Architecture Overview

The existing `GeneratedInvoice` records remain the immutable billing audit source. Sent weekly/special payout invoice snapshots are queried for each calendar month, excluding the invoice currently being regenerated. `PackagePlansService` reconstructs prior commission and fixed-fee deductions, calculates current-month allowances, and adds a monthly billing breakdown to payout and subscription snapshots. No mutable counter table or migration is introduced.

## Code Reuse Analysis

| Component | Location | Use |
| --- | --- | --- |
| Weekly payout builder | `src/modules/package-plans/package-plans.service.ts` | Extend existing commission, fee, VAT, refund, and payout math. |
| Generated invoice history | `GeneratedInvoice` + package plans repository | Read only sent payout snapshots as finalized monthly deductions. |
| Invoice persistence/source keys | `InvoiceRecordsService` and source-key helpers | Preserve idempotency and exclude the current invoice from history. |
| Existing payout UI | Super Admin weekly payout panel and Restaurant Admin wallet summary | Display new backend totals without creating new screens. |

## Components

### Monthly payout history query

- **Location**: `src/modules/package-plans/package-plans.repository.ts`
- **Purpose**: Return sent weekly payout snapshots overlapping a requested calendar month, optionally excluding the current source key.

### Monthly billing calculator

- **Location**: `src/modules/package-plans/package-plans.service.ts`
- **Purpose**: Group orders by UTC calendar month, reconstruct prior sent deductions, apply remaining commission cap, calculate the four-part fee schedule, cap fee withholding by available payout, and expose outstanding amounts.
- **Rounding**: Installments 1-3 use monthly fee / 4 rounded to cents; installment 4 is the exact remainder.

### Subscription reconciliation

- **Location**: `src/modules/package-plans/package-plans.service.ts`
- **Purpose**: Credit finalized weekly commission and fixed-fee deductions against the matching monthly subscription invoice so amounts are not charged twice.

### Admin presentation

- **Locations**: Super Admin payout types/panel/messages and Restaurant Admin wallet types/settings.
- **Purpose**: Show monthly fee, deducted this payout/month, remaining fee, and monthly commission-cap state separately from provider fees and VAT.

## Data Contract

Each payout snapshot adds:

```typescript
monthlyBilling: {
  months: Array<{
    month: string;
    commissionCapAmount: number | null;
    commissionDeductedBefore: number;
    commissionDeductedThisPayout: number;
    commissionDeductedThisMonth: number;
    commissionCapRemaining: number | null;
    monthlyFeeAmount: number;
    monthlyFeeScheduledToDate: number;
    monthlyFeeDeductedBefore: number;
    monthlyFeeDeductedThisPayout: number;
    monthlyFeeDeductedThisMonth: number;
    monthlyFeeOutstandingAmount: number;
  }>;
}
```

Top-level totals expose summed current-payout fee deduction and outstanding amounts for existing consumers.

## Error Handling

| Scenario | Handling |
| --- | --- |
| Missing/legacy monthly fields | Reconstruct commission from dated legacy lines; treat old fixed-fee deduction as zero. |
| Malformed stored snapshot values | Parse as zero through existing safe JSON/decimal helpers. |
| Insufficient payout balance | Clamp fixed-fee deduction to available net and expose the remainder. |
| Regenerated sent invoice | Exclude its source key from prior-month totals. |

## Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Monthly state | Derive from immutable sent invoices | Avoids a mutable duplicate ledger and schema migration while preserving auditability. |
| Month timezone | UTC calendar month | Existing payout periods, invoice dates, and database timestamps are UTC. |
| Monthly fee cadence | Four cumulative calendar-week installments | Carries missed weeks automatically and makes a fifth payout zero after full collection. |
| Charge separation | Add fixed fee after existing commission/provider-fee/VAT calculation | Preserves existing independent fee formulas and prevents negative payout. |
