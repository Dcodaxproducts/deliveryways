# WinOrder Exact-Name Matching Tasks

**Design**: `.specs/features/winorder-name-matching/design.md`
**Status**: In Progress

## Execution Plan

T1 → T2 → T3 → T4 → T5 → T6 → T7

## Tasks

### T1: Allow optional article numbers ✅

**Where**: Prisma schema/migration, mapping DTO/repository/service and focused tests  
**Requirements**: WNM-04  
**Done when**: name-only and number-only overrides persist; empty overrides fail; Prisma validation and focused tests pass.

### T2: Export items and modifiers by name ✅

**Where**: `winorder-polling.service.ts` and spec  
**Depends on**: T1  
**Requirements**: WNM-01, WNM-02, WNM-03, WNM-07  
**Done when**: unmapped items/modifiers export by name, variations use base name plus size, overrides win, and service-charge safety remains.

### T3: Export customer-paid payment fee ✅

**Where**: order integration port/service/spec and WinOrder polling service/spec  
**Depends on**: T2  
**Requirements**: WNM-05  
**Done when**: customer-paid positive fee becomes `PaymentFee`; restaurant-paid/zero fee is omitted.

### T4: Add documented WinOrder catalog parser

**Where**: Restaurant Admin catalog helper and tests  
**Requirements**: WNM-06  
**Done when**: documented CSV/XML names parse; malformed files fail; missing/duplicate comparison is deterministic.

### T5: Simplify the WinOrder mapping UI

**Where**: Restaurant Admin WinOrder service/page  
**Depends on**: T1, T4  
**Requirements**: WNM-03, WNM-04, WNM-06  
**Done when**: default names need no saved mapping, number/name overrides are optional, variations show base-name behavior, and catalog comparison results are visible.

### T6: Update EN/DE operator guidance

**Where**: Restaurant Admin message catalogs  
**Depends on**: T5  
**Requirements**: WNM-01 through WNM-07  
**Done when**: both locales explain name matching, VAT authority, optional overrides, size handling, and exception-only comments; i18n parity passes.

### T7: Full verification and release

**Where**: both repositories  
**Depends on**: T1-T6  
**Done when**: per-file checks, typecheck, build, tests, lint, project verification, clean diffs, conventional commits, pushes, and remote-head verification all pass.
