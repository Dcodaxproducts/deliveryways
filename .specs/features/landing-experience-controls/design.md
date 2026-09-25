# Design

The existing `landingPageSettings` JSON remains the aggregate and API contract.

## Contract additions

- `home.sectionOrder`: ordered unique homepage section keys.
- `home.hero.isVisible`: explicit hero visibility.
- `home.featuredRestaurants.displayMode` and `columns`.
- `home.growth.imagePosition` and `home.orderManagement.imagePosition`.
- `home.faqs`: visibility plus localized heading.
- `packages`: visibility, ordered package-plan IDs, display mode, columns, and highlighted package-plan ID.

Server extraction and merging normalize unknown values and append missing default section keys, so old JSON remains valid and partial PATCH requests do not erase settings.

The public landing page renders homepage sections from a component map keyed by `sectionOrder`. The pricing page fetches active public packages as before, then filters/orders only when configured IDs exist. An empty ID list intentionally means “all active plans” for backward compatibility.

Superadmin loads active restaurants and package plans into ordered selection controls. Selection order is editable with move-up/move-down actions.
