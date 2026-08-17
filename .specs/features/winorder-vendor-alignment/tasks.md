# WinOrder Vendor Alignment Tasks

**Design**: `.specs/features/winorder-vendor-alignment/design.md`
**Status**: Done

## Execution Plan

### T1: Connection contract

Update DTO, repository, service, and connection tests for nullable Store ID and fixed endpoint presentation.

Verify: focused connection Jest suite, NestJS file enforcement.

Requirements: WIN-01, WIN-02.

### T2: Export defaults and variation fallback

Update polling service and tests for vendor payment labels, explicit non-cash mappings, and exact/base article resolution.

Verify: focused polling Jest suite, NestJS file enforcement.

Requirements: WIN-03, WIN-04, WIN-05.

### T3: Mapping readiness

Update mapping service and add coverage so a base mapping covers its variants while modifiers remain required.

Verify: focused mapping Jest suite, NestJS file enforcement.

Requirement: WIN-06.

### T4: Restaurant Admin contract and UI

Update WinOrder API types, page behavior, EN/DE copy, and focused tests for optional Store ID and default payment guidance.

Verify: focused Vitest suites, typecheck, import/i18n checks.

Requirement: WIN-07.

### T5: Release verification

Run full backend/admin gates, prove ancestry, commit conventional cumulative releases, and push both branches.

Verify: repository clean state and remote heads equal local heads.

## Verification Result

- Backend: TypeScript, Nest build, production Docker image, full ESLint, Prisma validation, 94 suites / 1,100 tests.
- Restaurant Admin: TypeScript, production build and Docker image, ESLint with 0 errors / 96 baseline warnings, exact-case imports, 3,199-key i18n parity, 86 files / 526 tests.
