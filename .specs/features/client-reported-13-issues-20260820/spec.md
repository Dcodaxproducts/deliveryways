# Client-reported 13-issue batch specification

## Problem

Business Admin, staff, Super Admin, and customers see inconsistent restaurant identifiers, invoice cadence/actions, finance totals, permissions, modifier actions, checkout autofill, and payment labels. The cumulative release already contains parts of the finance and category fixes, but the full reported workflow is not yet coherent.

## P1 requirements

| ID      | Acceptance criterion                                                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CR13-01 | WHEN a Business Admin opens the restaurant picker THEN each option SHALL show the numeric restaurant `displayNumber`, not a sliced UUID.                                                                                                   |
| CR13-02 | WHEN automated weekly/biweekly/monthly payout billing runs repeatedly within one completed cycle THEN it SHALL generate/send at most one invoice for that fixed cycle, and history SHALL expose the net restaurant-received total.         |
| CR13-03 | WHEN a Super Admin cancels a generated invoice THEN it SHALL become cancelled with an audit event; WHEN recreating that cancelled invoice THEN a new active invoice record SHALL be created without mutating the cancelled record.         |
| CR13-04 | WHEN online charges have successful refunds THEN Stripe, PayPal, total-online, and net totals SHALL subtract those refunds.                                                                                                                |
| CR13-05 | WHEN more menu categories exist THEN scroll or the Load More button SHALL fetch and append the next page once.                                                                                                                             |
| CR13-06 | WHEN a payment becomes PAID THEN Restaurant Admin SHALL NOT receive a payment-paid feed notification.                                                                                                                                      |
| CR13-07 | WHEN a guest uses browser contact autofill THEN guest delivery address fields SHALL not be browser-autofilled; map/current-location/manual input SHALL continue to work.                                                                   |
| CR13-08 | WHEN WhatsApp is empty THEN restaurant validation SHALL accept it; WHEN supplied THEN it SHALL still validate the number format.                                                                                                           |
| CR13-09 | WHEN payment status is PAID THEN Stripe/PayPal SHALL display `ONLINE PAID`; all other methods SHALL display `PAID`.                                                                                                                        |
| CR13-10 | WHEN configuring staff permissions THEN an active WinOrder Integration module SHALL be selectable and enforced for WinOrder routes/navigation.                                                                                             |
| CR13-11 | WHEN Restaurant Admin or authorized staff manages a modifier group THEN detach SHALL be available wherever attach is available and SHALL preserve tenant/menu authorization.                                                               |
| CR13-12 | WHEN commission billing runs for a subscription period THEN the configured percentage (5% for the requested plan) SHALL apply to all paid orders and the cumulative commission SHALL not exceed the plan cap once per subscription period. |
| CR13-13 | WHEN viewing Financial Report THEN cards SHALL be limited to COD total, online total, Stripe, PayPal, refunded amount, and delivery fee.                                                                                                   |

## Edge cases and invariants

- Cancel/recreate is Super Admin only; tenant-scoped users cannot invoke it.
- Recreated invoice numbers and source keys are unique and retain a link to the cancelled invoice in audit metadata.
- Refund totals never make a provider net total negative.
- Commission never exceeds paid-order gross or the configured period cap.
- Existing cumulative fixes are regression-tested instead of duplicated.
- No production migration or deployment is part of this implementation task.

## Traceability

All CR13-01 through CR13-13 requirements are mapped in `tasks.md`; status progresses Pending -> Implementing -> Verified.
