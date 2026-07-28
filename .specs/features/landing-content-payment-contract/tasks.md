# Landing Content and Restaurant Payment Contract Tasks

**Status**: Complete

## Execution Plan

### T1: Resolve customer payment availability ✅

**Where**: Backend customer-app service/repository and tests  
**Requirements**: PAY-01  
**Done when**: home and branch responses intersect platform, restaurant, and
branch methods with legacy fallbacks; focused tests pass.

### T2: Enforce the same payment availability ✅

**Where**: Backend orders service and tests  
**Depends on**: T1  
**Requirements**: PAY-03  
**Done when**: order creation rejects methods not enabled for the restaurant
and branch; focused tests pass.

### T3: Consolidate landing settings ✅

**Where**: Superadmin global and landing forms  
**Requirements**: LAND-01  
**Done when**: Global Settings has no landing editor/payload and Landing Site
Content edits the complete existing document.

### T4: Replace managed image URL inputs ✅

**Where**: Superadmin landing form  
**Depends on**: T3  
**Requirements**: LAND-02  
**Done when**: logo, hero, feature, and background images use file upload and
preserve the previous value on failure.

### T5: Complete affected translations ✅

**Where**: Superadmin EN/DE catalogs, landing/payment components, upload hook  
**Requirements**: I18N-01  
**Done when**: no raw payment keys render and homepage editor copy is
localized in both catalogs.

### T6: Reflect payment methods in checkout ✅

**Where**: Customer payment types, resolver, UI, catalogs, and tests  
**Depends on**: T1  
**Requirements**: PAY-02  
**Done when**: every configured method code can render in its localized group,
with guest/order-type restrictions retained.

### T7: Full verification and release handoff ✅

**Depends on**: T1-T6  
**Done when**: backend and affected frontend typecheck, lint, tests, and builds
pass; changes are committed and pushed with exact SHAs.
