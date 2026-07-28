# Landing Content and Restaurant Payment Contract Design

**Spec**: `spec.md`
**Status**: Approved by implementation request

## Architecture

- The existing `GlobalSetting.landingPageSettings` JSON remains the single
  persisted landing document.
- Superadmin removes the landing subsection from `SettingsForm` and extends
  `LandingContentForm` to edit the complete document through the existing
  `/admin/global-settings/landing-page` endpoint.
- Existing `/storage/presigned-upload` and `PremiumImageDropzone` are reused
  for logo, hero, feature, and app-background files.
- Payment method codes remain unchanged. UI derives presentation groups:
  pay-at-fulfilment, online/digital providers, bank transfer, and wallet.
- Backend resolves customer availability as:
  active platform methods ∩ restaurant methods ∩ branch methods. Missing
  legacy restaurant/branch lists use existing safe defaults.
- Order creation uses the same resolver so display and enforcement cannot
  diverge.

## Reuse

| Existing component                              | Reuse                                           |
| ----------------------------------------------- | ----------------------------------------------- |
| `LandingContentForm`                            | Single editor for the landing settings document |
| `PremiumImageDropzone` / `useFileUpload`        | Managed image upload and preview                |
| `getStorageViewUrl`                             | Private/object-key preview resolution           |
| `GlobalSettingsService.getPaymentMethods`       | Platform-active method source                   |
| Existing restaurant `settings.payments.methods` | Restaurant capability source                    |
| Branch `settings.allowedPaymentMethods`         | Optional branch restriction                     |

## Error Handling

| Scenario                        | Handling                                           |
| ------------------------------- | -------------------------------------------------- |
| Upload failure                  | Existing upload toast; draft URL remains unchanged |
| No common payment methods       | Customer shows localized unavailable state         |
| Unsupported/invalid stored code | Filter before returning or validating              |
| Disallowed order method         | `BadRequestException` before order persistence     |

## Decisions

| Decision                 | Choice                                    | Rationale                                          |
| ------------------------ | ----------------------------------------- | -------------------------------------------------- |
| Payment type vs provider | Derived UI grouping, stable method codes  | Correct terminology without a risky data migration |
| Scope composition        | Intersection                              | Each scope is a restriction, not an additive grant |
| Images                   | File upload for all managed visual assets | Consistent admin UX and no manual object URLs      |
