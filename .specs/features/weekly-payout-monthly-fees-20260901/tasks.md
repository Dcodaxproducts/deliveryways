# Weekly Payout Monthly Billing Tasks

**Design**: `.specs/features/weekly-payout-monthly-fees-20260901/design.md`
**Status**: Verified

## Execution Plan

T1 → T2 → T3 → T4 → T5 → T6

## Task Breakdown

### T1: Add finalized monthly payout history query

**Status**: Complete

**Where**: `src/modules/package-plans/package-plans.repository.ts` and repository tests  
**Requirements**: WPB-01, WPB-02, WPB-08  
**Done when**: Sent overlapping weekly payout invoices are returned and current source-key exclusion is tested.

### T2: Calculate calendar-month commission allowance

**Status**: Complete

**Where**: `src/modules/package-plans/package-plans.service.ts` and service tests  
**Depends on**: T1  
**Requirements**: WPB-01, WPB-02, WPB-05, WPB-08  
**Done when**: 5%/79 example yields 20/25/34/0 and resets next month.

### T3: Calculate progressive fixed monthly fee

**Status**: Complete

**Where**: `src/modules/package-plans/package-plans.service.ts` and service tests  
**Depends on**: T2  
**Requirements**: WPB-03, WPB-04, WPB-05, WPB-06  
**Done when**: Four installments total exactly the plan fee, insufficient balance carries within the month, and week five is zero.

### T4: Reconcile subscription invoices and render audit fields

**Status**: Complete

**Where**: `src/modules/package-plans/package-plans.service.ts` and service tests  
**Depends on**: T3  
**Requirements**: WPB-06, WPB-07  
**Done when**: Subscription invoices credit finalized weekly fee/commission deductions and payout PDF/email snapshots expose separate monthly values.

### T5: Display monthly billing state in admin clients

**Status**: Complete

**Where**: Super Admin payout service/panel/messages and Restaurant Admin wallet service/settings/tests  
**Depends on**: T4  
**Requirements**: WPB-03, WPB-05, WPB-06  
**Done when**: Both admin experiences display monthly fee deducted/remaining and commission-cap remaining with strict types.

### T6: Verify and publish

**Status**: Complete with known repository baseline findings

**Depends on**: T1-T5  
**Requirements**: WPB-01 through WPB-08  
**Done when**: Per-file enforcement, API full verification, both frontend verification suites, conventional commits, and remote branch checks pass.

## Verification

- `bash scripts/verify_nestjs.sh <changed-api-file>` after each API file.
- `bash scripts/verify_project.sh` for the API.
- Frontend lint, typecheck, affected tests, and production builds.
- No deployment or live database mutation.

The API typecheck, build, lint, 103 suites, and 1,189 tests pass. Changed API files pass the per-file enforcement scan. The whole-repository pattern scan still reports 62 pre-existing violations outside this change; no new violation is reported in either changed service file.
