# Deliveryway Cumulative Sync 2026-08-28 Tasks

**Design**: `.specs/features/deliveryway-sync-20260828/design.md`
**Status**: Verified; staging rollout gated by provider configuration

## Execution Plan

### T1: Port API cumulative delta

**Status**: Complete

**Depends on**: None
**Requirements**: SYNC-01, SYNC-02
**Done when**: Missing verified API commits are adapted; backend proof passes.

### T2: Port Restaurant Admin cumulative delta

**Status**: Complete

**Depends on**: None
**Requirements**: SYNC-01, SYNC-02
**Done when**: Missing verified Admin commits are adapted; frontend proof passes.

### T3: Port Superadmin cumulative delta

**Status**: Complete

**Depends on**: None
**Requirements**: SYNC-01, SYNC-02
**Done when**: Missing verified Superadmin commits are adapted; frontend proof passes.

### T4: Port Customer cumulative delta

**Status**: Complete

**Depends on**: None
**Requirements**: SYNC-01, SYNC-02
**Done when**: Missing verified Customer commits are adapted; frontend proof passes.

### T5: Verify unchanged Landing and cross-product isolation

**Status**: Complete

**Depends on**: T1-T4
**Requirements**: SYNC-02, SYNC-03
**Done when**: Landing passes and identifier/Compose scans show FeastFlow-only configuration.

### T6: Commit and push isolated sync branches

**Status**: In progress

**Depends on**: T1-T5
**Requirements**: SYNC-04
**Done when**: All exact branch heads are on origin and recorded.

### T7: Evaluate protected Staging deployment gate

**Status**: Complete — preflight stopped read-only because `STRIPE_SECRET_KEY` is not configured.

**Depends on**: T6
**Requirements**: SYNC-05
**Done when**: Preflight either passes and permits a safe rollout or reports the exact missing prerequisite without mutation.
