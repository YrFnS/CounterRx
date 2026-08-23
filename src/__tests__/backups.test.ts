import { describe, it, expect, beforeEach } from "vitest";
import { reducer, seed, rotateBackup, listBackups, backendDataFromState, BACKUPS_KEY, BACKUP_KEEP } from "../store";
import { buildOrgExport, validateOrgExport, backendDataFromExport } from "../lib/sync";

// reducer state/action types aren't exported from store.tsx; derive them from the reducer signature
type State = Parameters<typeof reducer>[0];

// seed() returns only the data collections; cast to the full State for buildOrgExport/rotateBackup.
function makeState(): State {
  return seed() as unknown as State;
}

// Minimal localStorage polyfill for the node test environment.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
});

describe("W2.5 org export bundle", () => {
  it("export bundle contains every synced table", () => {
    const bundle = buildOrgExport(backendDataFromState(makeState()));
    const expected = [
      "products", "transactions", "prescriptions", "prescribers", "customers", "transfers",
      "backorders", "rx_transfers", "suppliers", "purchase_orders", "ap_invoices", "expenses",
      "deliveries", "web_orders", "time_entries", "staff", "settings", "restricted_log",
      "audit_log", "shifts", "store_credits", "snapshots", "interaction_pairs", "cold_chain_log",
      "coupons", "categories", "branches",
    ];
    for (const t of expected) {
      expect(bundle.tables, `missing table ${t}`).toHaveProperty(t);
      expect(Array.isArray(bundle.tables[t]), `${t} should be an array`).toBe(true);
    }
    expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(bundle.version).toBe(1);
    expect(typeof bundle.organization_id).toBe("string");
  });

  it("settings serializes as a single-row table", () => {
    const bundle = buildOrgExport(backendDataFromState(makeState()));
    expect(bundle.tables.settings).toHaveLength(1);
    expect(bundle.tables.settings[0]).toHaveProperty("org_name");
  });
});

describe("W2.5 local backup rotation", () => {
  it("keeps at most BACKUP_KEEP snapshots", () => {
    const state = makeState();
    for (let i = 0; i < BACKUP_KEEP + 5; i++) rotateBackup(state, `snap ${i}`);
    const all = listBackups();
    expect(all.length).toBe(BACKUP_KEEP);
    // newest first
    expect(all[0].label).toBe("snap " + (BACKUP_KEEP + 4));
    const raw = JSON.parse(localStorage.getItem(BACKUPS_KEY) ?? "[]");
    expect(raw.length).toBe(BACKUP_KEEP);
  });

  it("persists a readable bundle under the rotating key", () => {
    const state = makeState();
    rotateBackup(state, "manual");
    const stored = JSON.parse(localStorage.getItem(BACKUPS_KEY) ?? "[]");
    expect(stored[0].bundle.tables.products).toHaveLength(state.products.length);
    expect(validateOrgExport(stored[0].bundle)).toBe(true);
  });
});

describe("W2.5 restore validation", () => {
  it("accepts a well-formed bundle", () => {
    const bundle = buildOrgExport(backendDataFromState(makeState()));
    expect(validateOrgExport(bundle)).toBe(true);
  });

  it("rejects malformed input (missing top-level keys)", () => {
    expect(validateOrgExport(null)).toBe(false);
    expect(validateOrgExport({})).toBe(false);
    expect(validateOrgExport({ exportedAt: "x", version: 1, organization_id: "y" })).toBe(false);
    expect(validateOrgExport({ exportedAt: "x", version: 1, organization_id: "y", tables: "nope" })).toBe(false);
  });

  it("rejects a bundle missing core ledger tables", () => {
    const bundle = buildOrgExport(backendDataFromState(makeState()));
    delete (bundle.tables as Record<string, unknown>).transactions;
    expect(validateOrgExport(bundle)).toBe(false);
  });

  it("rehydrates BackendData from a valid bundle, preserving row counts", () => {
    const state = makeState();
    const bundle = buildOrgExport(backendDataFromState(state));
    const restored = backendDataFromExport(bundle, backendDataFromState(state));
    expect(restored.products).toHaveLength(state.products.length);
    expect(restored.transactions).toHaveLength(state.transactions.length);
    expect(restored.prescriptions).toHaveLength(state.prescriptions.length);
  });
});
