# Cart and Printer Reliability Design

**Spec**: `.specs/features/cart-printer-reliability/spec.md`
**Status**: Approved by implementation request

## Architecture Overview

The cart fix adds a backward-compatible batch endpoint in the existing Cart bounded
context. It validates all inputs before a transaction, applies cart-line mutations through
transaction-aware repository methods, and builds the response once.

Printer discovery remains local to the restaurant browser. The Admin connects to QZ Tray,
lists operating-system printer queues, prints a test ticket, persists the selected queue,
and reports the client-observed result to an authenticated backend health endpoint.

## Code Reuse Analysis

| Component | Location | Reuse |
| --- | --- | --- |
| Cart selection validation | `src/modules/cart/cart.service.ts` | Validate each batch line with existing rules. |
| Cart item create/update | `src/modules/cart/cart.repository.ts` | Add optional transaction client support. |
| Cart response builder | `src/modules/cart/cart.service.ts` | Execute once after commit. |
| Printer scope resolution | `src/modules/admin/admin-printing.service.ts` | Authorize settings and client health reports. |
| Health integration logs | `src/modules/system-health/system-health-metrics.service.ts` | Record scoped printer success/failure. |
| Printing settings UI | Restaurant Admin `AutoPrintingSettings.tsx` | Extend existing screen rather than adding a new page. |

## Interfaces

### Batch cart mutation

`POST /cart/items/batch`

```typescript
type AddCartItemsBatchDto = {
  items: AddCartItemDto[];
};
```

The response keeps the existing cart mutation envelope.

### Printer event report

`POST /admin/printing/events`

```typescript
type ReportAdminPrinterEventDto = {
  status: 'success' | 'failed' | 'warning';
  message: string;
};
```

Restaurant/branch scope is supplied through the existing query contract and resolved by
the existing admin printing authorization path.

### Local printer bridge

The Restaurant Admin uses QZ Tray 2.2.x:

- `qz.websocket.connect()` connects to the local agent.
- `qz.printers.find()` returns installed printer queue names.
- `qz.print()` sends a small HTML test ticket to the selected queue.

## Error Handling Strategy

| Error | Handling | User impact |
| --- | --- | --- |
| Invalid batch line | Reject before transaction | No cart rows added. |
| Transaction failure | Roll back all batch writes | Existing cart remains unchanged. |
| QZ unavailable | Show install/start guidance | Settings are not reported connected. |
| No printer selected | Client and server validation | No false success confirmation. |
| Test print failure | Report scoped failed event | Printer Status shows the failure. |

## Technical Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Cart API | Add batch endpoint | Preserves every existing caller. |
| Deal write | One transaction | Prevents partial deals. |
| Printer discovery | QZ Tray local bridge | Cloud/backend cannot enumerate restaurant USB printers. |
| Printer status | Authenticated client event | Backend cannot directly observe local hardware. |
| Persistence | Existing JSON settings | Avoids an unnecessary migration. |

