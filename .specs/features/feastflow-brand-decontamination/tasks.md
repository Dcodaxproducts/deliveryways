# FeastFlow Brand Decontamination Tasks

**Design**: `.specs/features/feastflow-brand-decontamination/design.md`
**Status**: Done

## Execution Plan

### T1: Clean API identity and operational targets

**Where**: `feastflow-platform-api`
**Requirements**: BRAND-01, BRAND-03, BRAND-04
**Done when**: exhaustive scan, shell tests, Compose render, backend enforcement, typecheck, build, lint, and tests pass.

### T2: Clean Restaurant Admin identity

**Where**: `feastflow-restaurant-admin`
**Requirements**: BRAND-01, BRAND-02, BRAND-04
**Done when**: official asset is installed; exhaustive scan, typecheck, build, lint, and tests pass.

### T3: Clean Customer identity

**Where**: `feastflow-customer-website`
**Requirements**: BRAND-01, BRAND-02, BRAND-04
**Done when**: official asset is installed; exhaustive scan, typecheck, build, lint, and tests pass.

### T4: Clean Superadmin identity

**Where**: `feastflow-superadmin`
**Requirements**: BRAND-01, BRAND-02, BRAND-04
**Done when**: official asset is installed; exhaustive scan, typecheck, build, lint, and tests pass.

### T5: Clean Landing identity

**Where**: `feastflow-landing-page`
**Requirements**: BRAND-01, BRAND-02, BRAND-04
**Done when**: official asset/icon is installed; exhaustive scan, typecheck, build, lint, and tests pass.

### T6: Cross-repository verification and push

**Where**: all five repositories
**Requirements**: BRAND-05
**Depends on**: T1-T5
**Done when**: all repositories are clean, commits are pushed to `main`, and remote heads match local heads.
