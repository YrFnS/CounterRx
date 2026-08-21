# Leaf: hardware (Phase E)

- [x] ESC/POS escape-sequence builders are pure + unit-tested.
  CHECK: `grep -n 'cashDrawerKick\|buildReceipt\|barcode128' src/lib/hardware.ts` + `src/__tests__/hardware.test.ts`
  EXPECT: byte builders for receipt/label/cut/feed/drawer-kick/barcode produce correct escape sequences without a serial device.
  EVIDENCE: `hardware.test.ts` asserts sequences.
- [x] Every I/O call is feature-flagged (no serial access when disabled).
  CHECK: `grep -n 'HardwareError\|enabled' src/lib/hardware.ts`
  EXPECT: `printReceipt/printLabel/kickDrawer/connectPrinter` throw `HardwareError("disabled")` when the org flag is off — never touch `navigator.serial`.
  EVIDENCE: hardware.ts flag gates + test coverage.
- [x] Settings flag persisted and loadable.
  CHECK: `grep -n 'hardwareEnabled\|hardware_enabled' src/data.ts src/lib/sync.ts src/views/Settings.tsx` + migration `20260821000008_hardware.sql`
  EXPECT: `OrgSettings.hardwareEnabled` default false; DB round-trip via `settings.hardware_enabled`; Settings "Hardware" tab toggle + Connect/Test print/Open drawer.
  EVIDENCE: migration 0008 pushed live; sync maps `hardware_enabled`.
- [x] Register print hook (flag-gated, isolated).
  CHECK: `grep -n 'printReceipt' src/views/Register.tsx`
  EXPECT: cart footer "Print" button sends the live cart to the connected printer; toasts success/disabled/error. Isolated addition — no receipt-UI refactor.
  EVIDENCE: Register print button + i18n keys `pos.print*`.
- [x] i18n parity + full gate green.
  CHECK: `npm run typecheck && npm run test && npm run build`
  EVIDENCE: typecheck clean, 54 tests pass, build OK.

Deferred: auto-kick drawer on every cash sale (manual button only); scale read (no device specced). Both flag-gated hooks, easy to add.
