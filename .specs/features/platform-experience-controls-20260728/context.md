# DeliveryWay Platform Experience Controls Context

**Gathered:** 2026-07-28
**Spec:** `.specs/features/platform-experience-controls-20260728/spec.md`
**Status:** Ready for design

## Feature Boundary

Complete the specific order-performance, Landing content, campaign audience, invoice-history, branch-email, and Restaurant Admin UI behaviors requested in the seven supplied screenshots without redesigning unrelated flows.

## Implementation Decisions

### Landing content

- Preserve the current Landing visual layout and responsive behavior.
- Make the existing homepage sections managed rather than replacing them with a generic page builder.
- Support bilingual EN/DE copy and managed media/links.
- Featured restaurants are selected by Superadmin and rendered from current active public restaurant data.
- Existing localized constants remain safe fallback values for incomplete historical settings.

### Campaign audience

- Audience values are `GUEST`, `REGISTERED`, and `BOTH`.
- Existing campaigns default to `BOTH`.
- Anonymous visitors and authenticated silent-guest accounts are both guests.
- Enforcement applies to visibility and actual validation/discount application, not UI hiding alone.

### Notifications

- Branch-specific email overrides the restaurant-level new-order recipient for that branch.
- Restaurant-level configuration remains the fallback.
- SMTP delivery must not determine whether order placement succeeds.

### Invoices and order UI

- Reuse existing generated-invoice history and invoice-generation contracts.
- Add actions to current history screens rather than another navigation section.
- Remove Customer Info only from the list table; retain it in details.
- Browser title becomes `Restaurant Admin`.

### Agent’s Discretion

- Exact Superadmin form grouping and compact action icon presentation.
- Internal JSON nesting for managed homepage content, provided it remains backward compatible.
- Whether post-order email dispatch uses an existing queue or a persisted best-effort asynchronous dispatcher, based on available infrastructure.

## Specific References

- User-supplied screenshots show the existing red hero, featured restaurant logos, two alternating checklist/content sections, app-download CTA, Restaurant Admin browser title, Orders table, and Superadmin Generated Invoice History.

## Deferred Ideas

- A free-form drag-and-drop landing page builder.
- New invoice calculation types or accounting rules.
