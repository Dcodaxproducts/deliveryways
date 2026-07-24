# Landing Site Content Management

## Goal

Allow Superadmin to manage the public DeliveryWay marketing-site content in English and German without changing frontend source code.

## Requirements

- **LPC-1**: Superadmin has a dedicated `Landing Site Content` route and sidebar entry.
- **LPC-2**: Services, Pricing, About, Privacy Policy, Support, Terms of Service, and Contact each have bilingual hero eyebrow, heading, and subheading fields.
- **LPC-3**: About, Privacy Policy, Support, and Terms of Service each have bilingual rich-text body content.
- **LPC-4**: Contact keeps the existing submission form and renders only contact email, phone, and address configured by Superadmin.
- **LPC-5**: The public FAQ section renders only active FAQs configured by Superadmin. If no active FAQ exists, the section is not rendered.
- **LPC-6**: Rich-text HTML is sanitized before storage and again before public rendering.
- **LPC-7**: Existing landing branding, footer, social-link, and FAQ settings remain backward compatible.
- **LPC-8**: The feature extends the existing `global_settings.landing_page_settings` JSON document and requires no database schema migration.

## Acceptance

- Superadmin can load, edit, and save all bilingual fields.
- Public pages switch content with the current EN/DE locale.
- Public legal/support routes are reachable from footer links.
- Empty page fields do not render dummy content.
- Empty or fully inactive FAQ configuration renders no FAQ section.
- Backend, Superadmin, and landing builds/tests pass.
