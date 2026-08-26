# Payout and reporting corrections specification

## Problem

Restaurant Admin and Super Admin currently present inconsistent order, COD, commission, and payout values. The Order Management area also duplicates invoice history that is already available through per-order actions, customer filtering cannot distinguish registered and guest users, and direct navigation can still make All Orders appear to be the default.

## Requirements

| ID      | Acceptance criterion                                                                                                                                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR26-01 | WHEN Order Management renders THEN its duplicate Invoice History tab/navigation SHALL be absent; subscription and payout invoice history under Reports SHALL remain available.                                                                           |
| PR26-02 | WHEN the customer filter opens THEN it SHALL offer All, Registered, and Guest customer types and send `isGuest=false`, `isGuest=true`, or no customer-type restriction respectively.                                                                     |
| PR26-03 | WHEN Restaurant Admin opens `/orders` or an unsupported legacy order tab THEN Today's Orders SHALL be selected and the URL SHALL resolve to `tab=today`; All Orders SHALL remain available explicitly.                                                   |
| PR26-04 | WHEN financial reports calculate COD THEN all successful COD orders in the selected scope/range SHALL contribute regardless of their pending settlement status; cancelled, rejected, placed, and payment-pending orders SHALL not contribute.            |
| PR26-05 | WHEN payout liability is calculated THEN commission SHALL apply to successful COD, card-on-delivery, Stripe, PayPal, Wallet, and other supported payment-method orders, subject to the active plan commission type/cap and refund adjustments.           |
| PR26-06 | WHEN an order records a transaction fee paid by the restaurant THEN that fee SHALL be deducted from available payout; customer-paid fees SHALL not be deducted from the restaurant payout.                                                               |
| PR26-07 | WHEN payout VAT is calculated THEN the active plan VAT percentage SHALL apply to commission plus restaurant-paid transaction fees.                                                                                                                       |
| PR26-08 | WHEN payout summaries render THEN they SHALL expose total successful order amount, platform-held amount, commission, restaurant-paid transaction fees, VAT, and available payout using the same backend calculation in Restaurant Admin and Super Admin. |
| PR26-09 | WHEN available payout is calculated THEN it SHALL equal `max(platform-held amount - commission - restaurant-paid transaction fees - VAT - previous payouts, 0)` and SHALL never exceed the current restaurant wallet ledger balance.                     |
| PR26-10 | WHEN a payout invoice/history row is generated THEN its payout amount SHALL use the same net-deduction contract rather than gross online collections.                                                                                                    |
| PR26-11 | WHEN an employee lacks financial-number access THEN existing permission restrictions SHALL remain enforced; authorized employees SHALL receive and see complete order totals.                                                                            |

## Definitions and assumptions

- Successful orders are the existing recognized status set: confirmed through served/delivered, excluding placed, payment-pending, cancelled, and rejected.
- Commission is based on recognized order value for every payment method. Refunded provider value cannot remain commissionable.
- Platform-held amount is money available in the restaurant wallet ledger from online or wallet settlement, net of refunds and already-paid payout ledger deductions.
- Restaurant transaction fees are included only when the immutable order snapshot says the payer is `RESTAURANT`.
- VAT is a tax on platform deductions, so its base is commission plus restaurant-paid transaction fees.
- Reports invoice history remains the authoritative history for subscription and payout billing documents.

## Invariants

- Tenant and branch scoping must not be weakened.
- Monetary calculations use `Prisma.Decimal` and round only at the established two-decimal boundaries.
- Available payout is never negative and never exceeds the wallet ledger balance.
- No migration or production deployment is part of this implementation.
