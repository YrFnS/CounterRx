# Leaf: notifications (W3.1)

- [x] `src/lib/notify.ts` — `NotifyProvider` interface (`send(to, template, vars)`), `consoleNotifier` stub, `notifierFor(settings)` registry keyed on `settings.notifications.channel`; drop-in adapter point for Resend/Twilio documented in the module JSDoc.
  CHECK: `grep -n 'interface NotifyProvider\|consoleNotifier\|notifierFor\|DROP-IN ADAPTER' src/lib/notify.ts`
  EXPECT: interface with `channel` + `send`; stub returns `{ ok: true }` and logs `[notify:<template>]`; registry falls back to console for unknown channel; comment points at Supabase Edge Functions.
  EVIDENCE: tsc + 8 tests in `src/__tests__/notifications.test.ts` pass; build OK.

- [x] `notification_log` table + notification JSONB on `settings`.
  CHECK: `grep -n 'notification_log\|notifications jsonb' supabase/migrations/20260823000017_notification_log.sql`
  EXPECT: `id uuid pk default gen_random_uuid()`, `organization_id uuid default current_org_id()`, recipient/channel/template/text, `payload jsonb`, `status text default 'sent'`, `created_at timestamptz default now()`; RLS read+write mirrors categories (`organization_id = current_org_id()`).
  EVIDENCE: pushed live via `node scripts/db.mjs` pooler — `information_schema.columns` returns 8 columns, `pg_policies` returns `notification_log_read` + `notification_log_write`; seed default config written to the `settings` row for tenant `00000000-...`.

- [x] sync.ts hydrates `notification_log` into `state.notificationLog` (read-only log; no outbound persist of the log table).
  CHECK: `grep -n 'notification_log\|notificationLog\|notificationLogFrom' src/lib/sync.ts`
  EXPECT: `TABLES` includes `notification_log`; `notificationLogFrom(row)` maps created_at→at; `BackendData` carries `notificationLog`; `rowsFor` returns `[]` for the log (write no-op).
  EVIDENCE: tsc clean; `loadBackendData` maps the table.

- [x] Triggers: Rx ready (RX_STATUS → dispensed, plus charge-on-pickup dispense), refill due (REMIND_RX on Prescriptions radar + Notify button), credit low (Customers banner).
  CHECK: `grep -n 'enqueueNotification\|rxReady\|refillDue\|creditLow' src/store.tsx src/views/Customers.tsx src/views/Inventory.tsx`
  EXPECT: a single `enqueueNotification(state, kind, to, vars)` helper respects the per-trigger enable toggle, appends a local `notificationLog` echo, and calls `sendNotification` (console provider logs + inserts notification_log server-side).
  EVIDENCE: `NOTIFIES_RX` action available for manual sends; `enqueueNotification` invoked from RX_STATUS, CHARGE_RX_PICKUP, REMIND_RX; Customers credit-low banner; Inventory low-stock Notify button.

- [x] Settings notifications tab (toggles + templates), defaults English.
  CHECK: `grep -n 'NotificationsTab\|enabled: { rxReady\|templates' src/views/Settings.tsx src/data.ts`
  EXPECT: three ToggleRow switches (rxReady/refillDue/creditLow) + three template inputs, persisted into `OrgSettings.notifications`; `makeSettings()` ships enabled-with-English-templates.
  EVIDENCE: Settings tab renders; `UPDATE_SETTINGS` patch writes the whole `notifications` sub-object; defaults match `notification_log` seed row.

- [x] i18n parity.
  CHECK: `grep -n '\"notifications\"\|\"rxReady\"\|\"refillDue\"\|\"creditLow\"' src/locales/en.json src/locales/ar.json`
  EXPECT: every new string keyed in both locales.
  EVIDENCE: `i18n-key-parity.test.ts` passes; 185/185 tests green.

- [x] Tests.
  CHECK: `grep -n 'describe' src/__tests__/notifications.test.ts`
  EXPECT: notifier registry picks provider by channel + fallback; toggle-off skips send; RX_STATUS enqueues rxReady; REMIND_RX enqueues refillDue once; log entry shape (uuid, at, auditable fields).
  EVIDENCE: 8/8 tests pass.
