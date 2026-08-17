# WinOrder Vendor Alignment Specification

## Problem Statement

The deployed WinOrder integration predates PixelPlanet's final onboarding and export guidance. It supports the fixed machine endpoint, but setup still requires a Store ID and exports still fail when optional payment or variation mappings are absent.

## Goals

- [ ] Make the fixed WinOrder URL the standard branch onboarding contract.
- [ ] Export vendor-compliant cash and online payment labels without mandatory payment mappings.
- [ ] Reuse a mapped base POS article for newly introduced online-shop variants.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Automatic modifier mapping | The vendor email did not confirm modifier behavior. |
| Automatic service-charge mapping | Accounting/article behavior remains installation-specific. |
| SOAP catalog synchronization | Outside the agreed REST MVP. |
| Live POS certification | Requires the restaurant's WinOrder operator/test window. |

## P1 User Stories

### Fixed URL onboarding

As a restaurant operator, I want to configure WinOrder with one fixed DeliveryWay URL and branch credentials so that Store ID is optional.

Acceptance criteria:

1. WHEN a connection is created without a Store ID THEN the API SHALL accept it and return `/winorder` as the endpoint path.
2. WHEN a connection has a Store ID THEN the API SHALL still return `/winorder` as the standard endpoint and SHALL retain the store-specific route for compatibility.
3. WHEN an operator clears a Store ID THEN the API SHALL persist `null` without a schema change.

### Vendor-compliant order export

As a restaurant operator, I want WinOrder orders to import without unnecessary manual mappings so that online orders are not stuck in retry.

Acceptance criteria:

1. WHEN the payment method is `COD` THEN the exporter SHALL send `PaymentType=Barzahlung` regardless of configured mappings.
2. WHEN the payment method is Stripe, PayPal, or Wallet and no explicit mapping exists THEN the exporter SHALL send `PaymentType=Über DeliveryWay online bezahlt`.
3. WHEN another non-cash method has no explicit mapping THEN the exporter SHALL keep the order retryable with a missing-mapping error.
4. WHEN a variation has an exact mapping THEN the exporter SHALL use it.
5. WHEN a variation lacks an exact mapping but its base item is mapped THEN the exporter SHALL reuse the base article and send the variation name in `ArticleSize`.
6. WHEN neither exact nor base item mapping exists THEN the exporter SHALL keep the order retryable.
7. WHEN a base item mapping covers a variation THEN the mapping API SHALL not count that variation as missing.

## Edge Cases

- Invalid non-empty Store IDs remain rejected as non-negative integers.
- Store-specific machine routes remain unauthorized when their Store ID does not match the authenticated connection.
- Modifier and positive service-charge mappings remain mandatory.

## Requirement Traceability

| Requirement ID | Requirement | Status |
| --- | --- | --- |
| WIN-01 | Store ID is optional and fixed endpoint is standard | Verified |
| WIN-02 | Store-specific route remains compatible and scoped | Verified |
| WIN-03 | COD always exports as `Barzahlung` | Verified |
| WIN-04 | Known online methods receive a vendor default with explicit non-cash overrides preserved | Verified |
| WIN-05 | Variations fall back to base article mappings | Verified |
| WIN-06 | Missing mapping status understands base fallback | Verified |
| WIN-07 | Admin UI and EN/DE guidance match the fixed URL contract | Verified |

## Success Criteria

- [x] Focused backend WinOrder tests pass.
- [x] Focused Restaurant Admin WinOrder tests pass.
- [x] Full backend and admin verification gates pass.
- [x] Both branches are cumulative from deployed Backend `c5cbaf5` and Admin `ce83c6d`.
