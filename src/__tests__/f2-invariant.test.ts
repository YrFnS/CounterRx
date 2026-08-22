import { describe, it, expect, vi, type Mock } from "vitest";
import { loadBackendData } from "../lib/sync";
import type { BackendData } from "../lib/sync";
import { seed } from "../store";
import { makeProducts, makeCustomers, makeStaff, makeSettings } from "../data";

// Mock Supabase
vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithPassword: vi.fn(() => Promise.resolve({ error: null })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(() => Promise.resolve()),
  },
}));

describe("F2 invariant - no demo data auto-written to real DB", () => {
  it("loadBackendData returns failed result for empty tenant without calling persist", async () => {
    const { supabase } = await import("../lib/supabase");
    
    // Mock all tables returning empty arrays
    const mockSelect = vi.fn(() => Promise.resolve({ data: [], error: null }));
    (supabase.from as Mock).mockReturnValue({ select: mockSelect });

    const seedData = seed();
    const result = await loadBackendData(seedData as BackendData);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedTable).toBeNull(); // null = empty tenant
    }
  });

  it("loadBackendData returns failed result when a table read fails", async () => {
    const { supabase } = await import("../lib/supabase");
    
    // Mock products table failing, others succeeding
    let callCount = 0;
    const mockSelect = vi.fn(() => {
      callCount++;
      if (callCount === 1) { // products table (first in TABLES)
        return Promise.resolve({ data: [], error: new Error("Network error") });
      }
      return Promise.resolve({ data: [], error: null });
    });
    (supabase.from as Mock).mockReturnValue({ select: mockSelect });

    const seedData = seed();
    const result = await loadBackendData(seedData as BackendData);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedTable).toBe("products");
    }
  });

  it("loadBackendData returns ok: true with data when backend has data", async () => {
    const { supabase } = await import("../lib/supabase");
    
    const mockProducts = makeProducts(Date.now());
    const mockCustomers = makeCustomers(Date.now());
    const mockStaff = makeStaff(Date.now());

    let callCount = 0;
    const mockSelect = vi.fn(() => {
      callCount++;
      const tableOrder = ["products", "transactions", "prescriptions", "prescribers", "customers", "transfers",
        "backorders", "rx_transfers", "suppliers", "purchase_orders", "ap_invoices", "expenses",
        "deliveries", "web_orders", "time_entries", "staff", "settings", "restricted_log",
        "audit_log", "shifts", "snapshots"];
      const table = tableOrder[callCount - 1];
      
      if (table === "products") return Promise.resolve({ data: mockProducts.map(p => ({ ...p, batches: p.batches, uoms: p.uoms ?? [], fields: p.fields ?? [], kit: p.kit ?? [] })), error: null });
      if (table === "customers") return Promise.resolve({ data: mockCustomers, error: null });
      if (table === "staff") return Promise.resolve({ data: mockStaff.map(s => ({ ...s, created_at: new Date(s.createdAt).toISOString() })), error: null });
      if (table === "settings") return Promise.resolve({ data: [{ id: 1, ...makeSettings() }], error: null });
      return Promise.resolve({ data: [], error: null });
    });
    (supabase.from as Mock).mockReturnValue({ select: mockSelect });

    const seedData = seed();
    const result = await loadBackendData(seedData as BackendData);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.products).toHaveLength(mockProducts.length);
      expect(result.data.customers).toHaveLength(mockCustomers.length);
      expect(result.data.staff).toHaveLength(mockStaff.length);
    }
  });
});