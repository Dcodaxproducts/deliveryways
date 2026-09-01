# Weekly Payout Monthly Billing Specification

## Problem Statement

DeliveryWay currently applies a package commission cap without a reliable calendar-month boundary and charges a fixed monthly package fee through the monthly subscription invoice. Restaurants paid weekly need commission and fixed fees withheld progressively from weekly payouts without exceeding the monthly liability or mixing transaction fees, refunds, and other charges into those amounts.

## Goals

- [ ] Apply percentage commission to each payout's eligible sales while sharing one calendar-month cap.
- [ ] Withhold a monthly fixed package fee in four equal weekly installments, carrying an unpaid installment only within that month.
- [ ] Report monthly accrued, deducted, and remaining amounts in payout invoices and balance summaries.
- [ ] Reconcile the monthly subscription invoice against amounts already withheld from weekly payouts.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Production deployment | Requires a separate explicit deployment request. |
| Provider transaction-fee formula changes | Provider/service/refund charges remain governed by their existing independent calculations. |
| Carrying old-month fixed-fee debt into the new month's allowance | The user requires old-month debt to remain outstanding and the new month to start separately. |

## User Stories

### P1: Calendar-month commission cap

**User Story**: As a restaurant, I want weekly commission deductions to share one monthly cap so that DeliveryWay never deducts more than my package permits in a calendar month.

**Acceptance Criteria**:

1. WHEN weekly eligible sales are invoiced THEN the system SHALL calculate the configured commission for those sales and limit the deduction by the commission cap remaining in that calendar month.
2. WHEN prior sent payouts have deducted the monthly commission cap THEN later payouts in the same month SHALL deduct zero additional commission.
3. WHEN a new calendar month begins THEN the commission accrued and deducted counters SHALL start from zero.
4. WHEN a payout period crosses a month boundary THEN the system SHALL account for each order in its own calendar month.

**Independent Test**: Generate four weekly payout invoices for sales of 400, 500, 700, and 800 with 5%/79 terms and verify deductions of 20, 25, 34, and 0.

### P1: Progressive fixed monthly fee

**User Story**: As a fixed-fee restaurant, I want the monthly package fee withheld from weekly payouts so that one large monthly charge is avoided.

**Acceptance Criteria**:

1. WHEN the monthly fee is 159 THEN the first four weekly accruals SHALL be 39.75 each and SHALL total exactly 159.
2. WHEN a weekly payout cannot cover its accrued installment THEN the unpaid amount SHALL remain outstanding for a later payout in the same month.
3. WHEN the monthly fee has been fully deducted THEN a fifth payout in the same month SHALL deduct zero additional fixed fee.
4. WHEN a month ends with an unpaid fixed fee THEN the invoice SHALL report that amount as outstanding without merging it into the next month's 159 allowance.
5. WHEN a new month begins THEN fixed-fee accrued and deducted counters SHALL start from zero for that month.

**Independent Test**: Generate weekly payouts with sufficient, insufficient, and fifth-week balances and verify deducted plus outstanding equals 159 for each month.

### P1: Separate deductions and reconciliation

**User Story**: As a restaurant or Super Admin, I want commission, fixed fees, transaction fees, VAT, refunds, and prior payouts reported separately so that the net payout is auditable.

**Acceptance Criteria**:

1. WHEN a payout is calculated THEN monthly fixed-fee deductions SHALL be separate from commission, transaction fees, VAT, refunds, and prior payouts.
2. WHEN a monthly subscription invoice is created THEN amounts already withheld from sent weekly payouts SHALL be credited against the same month's package fee and commission.
3. WHEN a payout invoice or balance summary is viewed THEN the system SHALL expose the month's fee, amount deducted, and amount remaining.

**Independent Test**: Verify API snapshots, PDFs, and admin summaries display each deduction independently and the subscription invoice charges only the remaining monthly liability.

## Edge Cases

- WHEN a payout is regenerated for the same source period THEN it SHALL not count itself as prior monthly billing.
- WHEN no active plan or no monthly fixed fee exists THEN monthly fee values SHALL be zero.
- WHEN available payout balance is less than the scheduled fixed-fee amount THEN the deduction SHALL be capped at the available balance and never make payout negative.
- WHEN legacy payout invoices lack monthly breakdown data THEN commission SHALL be reconstructed from their dated line items where possible and fixed-fee deduction SHALL default to zero.
- WHEN rounding four installments THEN the fourth installment SHALL absorb any cent remainder so the monthly total is exact.

## Requirement Traceability

| Requirement ID | Requirement | Status |
| --- | --- | --- |
| WPB-01 | Calendar-month commission cap | In Tasks |
| WPB-02 | Month-boundary order allocation | In Tasks |
| WPB-03 | Four-part fixed monthly fee | In Tasks |
| WPB-04 | In-month unpaid-fee carry and fifth-week zero | In Tasks |
| WPB-05 | Month-end outstanding and new-month reset | In Tasks |
| WPB-06 | Separate charge reporting | In Tasks |
| WPB-07 | Subscription invoice reconciliation | In Tasks |
| WPB-08 | Idempotent regeneration and legacy snapshot fallback | In Tasks |

**Coverage**: 8 total, 8 mapped to tasks, 0 unmapped.

## Success Criteria

- [ ] The 400/500/700/800 commission example produces 20/25/34/0.
- [ ] Four fixed-fee installments total exactly 159 and a fifth deduction is zero.
- [ ] Insufficient weekly balance creates same-month outstanding fee without a negative payout.
- [ ] A new calendar month starts independent counters.
- [ ] Typecheck, build, tests, lint, and repository enforcement checks pass.
