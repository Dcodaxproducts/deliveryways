# Landing Experience Controls

## Goal

Make Superadmin Landing Site Content the single source of truth for what the public FeastFlow landing site shows and how managed content is arranged, while preserving the current public experience for existing settings.

## Requirements

- **LEC-01** The Landing Site Content section navigation stays visible while scrolling and moves to sections smoothly.
- **LEC-02** Superadmin can show/hide every homepage section and arrange homepage sections in an explicit order.
- **LEC-03** Superadmin can select and order the restaurants shown on the homepage, and configure their supported presentation.
- **LEC-04** Superadmin can select and order the package plans shown on the pricing page, hide/show the package-plan section, choose its supported presentation, and choose the highlighted plan.
- **LEC-05** The public landing site consumes these controls directly. Missing new fields preserve the current section order, visibility, restaurant grid, and all-active package behavior.
- **LEC-06** Invalid/deleted/inactive restaurant or package identifiers are omitted safely by public data sources.
- **LEC-07** All new form controls are localized in English and German, accessible, responsive, and have explanatory labels/help text.
- **LEC-08** No database migration is required; controls remain inside the existing `landingPageSettings` JSON document and the existing GET/PATCH endpoints.

## Acceptance

- Existing landing settings render unchanged before an administrator saves new controls.
- Selected restaurant and package order is reflected publicly.
- Hiding a section removes it without leaving decorative gaps.
- Reordering homepage sections changes the public DOM order.
- Sticky navigation and smooth scrolling work on desktop and mobile without horizontal overflow.
