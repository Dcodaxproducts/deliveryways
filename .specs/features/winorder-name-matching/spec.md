# WinOrder Exact-Name Matching Specification

## Problem Statement

DeliveryWay currently blocks WinOrder exports unless every item and modifier has a manual article-number mapping. WinOrder support has confirmed that the normal productive model is name matching, with sizes in `ArticleSize`, optional article-number overrides, and comment fallback reserved for exceptions.

## Goals

- [ ] Export main items and modifiers by their DeliveryWay names without mandatory mappings.
- [ ] Preserve optional per-branch name and article-number overrides.
- [ ] Export variations as the base article name plus `ArticleSize`.
- [ ] Export customer-paid online payment fees through `PaymentFee`.
- [ ] Compare documented WinOrder CSV/XML exports with the branch catalog before activation.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Generic/comment basket fallback | Produces unreliable VAT, reporting, receipts, kitchen output, and editing. |
| SOAP `SynchArticle` | WinOrder does not recommend it as the standard workflow. |
| Automatic WinOrder article creation | No supported general REST contract exists. |
| Mapping generic service charge to `MinQuantitySurcharge` | The fields have different accounting semantics. |

## P1 User Stories

### Name-based order export

As a restaurant operator, I want DeliveryWay items and extras to match WinOrder by name so that I do not manually map every menu position.

1. WHEN a main item has no saved mapping THEN the exporter SHALL send its DeliveryWay menu name and omit `ArticleNo`.
2. WHEN a modifier has no saved mapping THEN the exporter SHALL send its DeliveryWay modifier name in `SubArticleList` and omit `ArticleNo`.
3. WHEN an override exists THEN the exporter SHALL prefer the override name and/or article number.
4. WHEN a variation has no exact override THEN the exporter SHALL use its base-item override when present, otherwise its DeliveryWay base name, and SHALL send the variation name in `ArticleSize`.
5. WHEN no item/modifier override exists THEN the order SHALL remain exportable.

### Dedicated payment-fee export

As a restaurant operator, I want customer-paid online fees represented as WinOrder payment fees so that totals remain structured.

1. WHEN the customer pays a positive transaction fee THEN `AddInfo.PaymentFee` SHALL contain that amount.
2. WHEN the restaurant pays the fee or the amount is zero THEN `PaymentFee` SHALL be omitted.
3. Existing delivery fee, discount, tip, total, and payment-label behavior SHALL remain unchanged.

### Optional overrides and catalog readiness

As an operator, I want mappings only for exceptions and a catalog comparison tool so that large menus are manageable.

1. WHEN an override is saved THEN at least a WinOrder name or article number SHALL be present.
2. Article-number fields SHALL be optional in the API and database.
3. WHEN a documented WinOrder CSV or XML export is selected THEN the admin SHALL compare its article names with DeliveryWay base-item and modifier names.
4. The comparison SHALL identify missing and duplicate WinOrder names without uploading the file to the API.
5. Variation rows SHALL not be required as separate WinOrder articles.

## Edge Cases

- Empty override rows are not persisted.
- Name comparison trims whitespace and follows WinOrder's documented case-insensitive name lookup without stripping punctuation or accents.
- Unsupported or malformed catalog files produce a visible error and do not alter saved mappings.
- Positive generic service charges continue to require the existing explicit mapping until WinOrder confirms a semantically correct dedicated field.
- Unknown/comment fallback is not generated automatically.

## Requirement Traceability

| ID | Requirement | Status |
| --- | --- | --- |
| WNM-01 | Default main-item name export | Verified |
| WNM-02 | Default modifier name export | Verified |
| WNM-03 | Base-name plus `ArticleSize` variations | Verified |
| WNM-04 | Optional name/number overrides | Verified |
| WNM-05 | Customer-paid `PaymentFee` | Verified |
| WNM-06 | CSV/XML readiness comparison | In Tasks |
| WNM-07 | No generic/comment production fallback | In Tasks |

## Success Criteria

- [ ] Focused backend and admin tests cover all requirements.
- [ ] Full backend and Restaurant Admin verification gates pass.
- [ ] Both release branches are cumulative from deployed API `698af95` and Admin `3b495b4`.
