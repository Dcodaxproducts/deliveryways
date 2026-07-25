# Client Regression Batch Tasks

Status: Verified

## Execution Plan

### Backend

- [x] T1: Make public category/item equal-order ties oldest-first. Requirements: REG-01, REG-02.
- [x] T2: Make empty legacy checkout-method arrays fall back to safe defaults. Requirement: REG-08.

### Customer

- [x] T3: Resolve checkout and footer scope from public domain context. Requirements: REG-08, REG-11.
- [x] T4: Restore guest/customer account menus without exposing generated guest identity. Requirement: REG-09.
- [x] T5: Load full item details before customization/direct add. Requirements: REG-03, REG-06.
- [x] T6: Resolve lowest active variation price on cards/search and correct compact active status. Requirements: REG-04, REG-12.
- [x] T7: Sanitize address separator-only values. Requirement: REG-10.
- [x] T8: Stabilize optimistic cart presentation through pending/commit/rollback. Requirement: REG-07.

### Landing

- [x] T9: Remove forbidden tenant slug from registration payload. Requirement: REG-05.

### Verification

- [x] T10: Run affected tests after each file/task.
- [x] T11: Run full Backend, Customer, and Landing proof surfaces.
- [x] T12: Commit/push affected repositories and provide deployment commands.
