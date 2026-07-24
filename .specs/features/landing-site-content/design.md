# Design

## Storage

Extend the existing `GlobalSetting.landingPageSettings` JSON shape:

```text
pages:
  services | pricing | about | privacyPolicy | support | termsOfService | contact:
    hero:
      eyebrowEn / eyebrowDe
      headingEn / headingDe
      subheadingEn / subheadingDe
    contentEn / contentDe (used by about/privacy/support/terms)
```

No table or column is added.

## Backend

- Reuse `GlobalSettingsRepository`.
- Add authenticated `GET /admin/global-settings/landing-page`.
- Add Superadmin-only `PATCH /admin/global-settings/landing-page`.
- Keep `GET /admin/global-settings/public/landing-page`.
- Sanitize stored rich HTML with a strict allowlist.
- Public response includes active FAQs only; authenticated response includes all FAQs for editing.

## Superadmin

- Add `/landing-content` under `storefront-settings`.
- Use language tabs and a reusable rich-text editor.
- Manage branding/contact/social data, page content, and FAQs in one dedicated screen.
- Remove the duplicate landing-content editor from Global Settings.

## Landing

- Extend `LandingSettingsProvider` with managed pages.
- Use a shared managed-page hero/body renderer.
- Replace static About content with managed content.
- Render managed Services and Pricing page headers.
- Add Privacy Policy, Support, and Terms of Service routes.
- Keep Contact form; replace static contact details and hero with managed settings.
- Hide FAQ UI when no active FAQ exists.
