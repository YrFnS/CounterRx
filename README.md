# CounterRx

Pharmacy Point-of-Sale (POS), inventory, and clinical workflow system — React/Vite frontend with a Supabase backend.

## Backup & restore drill

CounterRx keeps your data safe with two complementary mechanisms: a manual **full-org export** and an automatic **local backup rotation**. Both live under **Settings → Backups & restore** (admin only).

### What's covered

Every synchronized table is included in the export/backup bundle:

`products`, `transactions`, `prescriptions`, `prescribers`, `customers`, `transfers`, `backorders`, `rx_transfers`, `suppliers`, `purchase_orders`, `ap_invoices`, `expenses`, `deliveries`, `web_orders`, `time_entries`, `staff`, `settings`, `restricted_log`, `audit_log`, `shifts`, `store_credits`, `snapshots`, `interaction_pairs`, `cold_chain_log`, `coupons`, `categories`, `branches`, `rx_claims`.

The bundle is shaped as:

```json
{
  "exportedAt": "2025-..T..Z",
  "version": 1,
  "organization_id": "..",
  "tables": { "products": [..], "transactions": [..], "...": [..] }
}
```

### How to export

1. Open **Settings → Backups & restore**.
2. Click **Export full org**. A file `counterrx-backup-<date>.json` downloads.
3. Optional: tick **Also export CSVs** first to also download one `.csv` per table alongside the JSON.

The export never leaves the device — it is saved to your local Downloads.

### Local backup rotation (automatic)

After every successful sync/hydration CounterRx stores a full snapshot under the browser key `counterrx:backups:v1`, keeping the **last 3** (newest first). The **Backups & restore** card lists them with **Download** and **Restore** buttons.

### How to restore

Restore is **validated before applying** — a malformed file (missing top-level keys, or missing core ledger tables) is rejected with an error and never touches live data. To restore:

- **From a local backup:** Settings → Backups & restore → **Restore** next to a snapshot → confirm the warning dialog.
- **From a file:** click **Restore from file**, pick a `counterrx-backup-*.json` you exported earlier → confirm.

The confirm dialog states the backup's timestamp; restoring replaces all current data with the backup. The sidebar **Restore** control (top-right) also accepts both the legacy ledger backup and the new full-org bundle.

### Restore-drill checklist (verify periodically)

1. Export full org → confirm `counterrx-backup-<date>.json` downloaded.
2. Open it: confirm `version`, `organization_id`, and all 28 `tables` keys are present.
3. Settings → Backups & restore → Restore a snapshot → confirm a success toast and that data reflects the snapshot.
4. Restore from a tampered file (delete a table) → confirm it is rejected, not applied.

## Claims adapter (W4.1)

Prescriptions → **Claims** submits NCPDP D.0-style claims (submit → adjudicate → reverse) through `src/lib/claims.ts`. Today the org runs in **sandbox mode** (`settings.claimsMode = "sandbox"`): the adapter adjudicates locally with a deterministic rule (claims under $500 pay, otherwise reject) — no payer is contacted and no credentials are needed.

**Going live (blocked on a partner account):** real NCPDP D.0 requires a trading-partner gateway (e.g. a pharmacy switch such as Change Healthcare / RelayHealth). When one is onboarded:

1. Implement `ClaimsAdapter` in `src/lib/claims.ts` that POSTs D.0 segments through a Supabase Edge Function (partner credentials stay server-side).
2. Select it inside `makeClaimsAdapter()` when `settings.claimsMode === "live"`.
3. Flip the org setting to `live` (Settings → org settings). No reducer/UI changes needed — they already talk only through the adapter.

Until step 1–2 land, `claimsMode: "live"` throws "not configured" deliberately.
