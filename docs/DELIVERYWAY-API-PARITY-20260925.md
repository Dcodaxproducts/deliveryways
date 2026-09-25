# DeliveryWay API parity — 2026-09-25

## Cumulative FeastFlow base

The parity branch starts from merge commit `27a7491`, combining:

- `c91b2a5` (`sync/deliveryway-fixes-20260921`): cumulative Sep 21–22 DeliveryWay-compatible fixes already adapted for FeastFlow.
- `be30057` (`feat/landing-experience-controls-20260923`): FeastFlow landing controls plus shared-email authentication isolation (`8f9864e`, `ae4ccba`).

This preserves FeastFlow-specific configuration, legal/global-settings adaptations, branding, and shared-email auth while adding the missing API behavior.

## Commit and behavior matrix

| DeliveryWay source | Behavior | FeastFlow evidence before this sync | Result |
|---|---|---|---|
| `2aa4d3d` | Branch automation, promotion order scope, landing package visibility | Adapted as `e422aed` plus FeastFlow platform adaptations | Already present |
| `8923eb5` | Generate invoices at period close | Adapted as `be8a5e1` | Already present |
| `f60eda8` | Superadmin staff activity logs | Adapted as `fff2680`; module, interceptor, migration, and tests present | Already present |
| `a9f9874` | Category sort-order consistency | Adapted as `40db25e` | Already present |
| `ca20dc3` | WinOrder exports for auto-accepted orders/deals | FeastFlow-adapted implementation in `682ac77` plus platform adaptation `1fbcc77` | Already present |
| `1666853` | WinOrder historical replay guard | Adapted as `b3e2b3b` with cutoff migration/tests | Already present |
| `00e7c97` | Restaurant tax number in Impressum | Adapted as `89ba086`, retaining FeastFlow global legal settings | Already present |
| `24547cc` | Delegated staff order stats; promotion `allowedOrderTypes`; payment grouping | No equivalent commit/code on cumulative base | Ported as `e9db568` |
| `5c5215f` | Report-period consistency, order/group-order totals and report rows | No equivalent commit/code on cumulative base | Ported as `4197cfe` |
| `96a0137` | Explicit trend-period validation | No equivalent commit/code on cumulative base | Ported as `ef8c5af` |
| `b4b7b4b` + `69f66ef` | Authenticated API private/no-store cache policy and hardening tests | Middleware absent on cumulative base | Ported as `70b86eb` + `0579a3c` |
| `c4c7fb4` | Restaurant preorder/tips settings API and effective storefront/order behavior | DTO, utility, endpoints, and tests absent on cumulative base | Ported as `9e0c239` |

## Preservation checks

- Shared-email auth commits `8f9864e` and `ae4ccba` remain ancestors of this branch.
- Existing FeastFlow Sep 21–22 adaptation commits remain ancestors through `c91b2a5`.
- No DeliveryWay schema migration was introduced by the Sep 23–24 ports; the only schema/migration content added by the cumulative-base merge is FeastFlow's pre-existing shared-email role-scope migration.
- No DeliveryWay product name, host, or environment configuration is intentionally imported.
