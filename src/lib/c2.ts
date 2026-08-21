/* C-II controlled-substance movement logging (Phase C, §3).
 *
 * DEA 134.29: every Schedule-II receipt, dispense, transfer-out, and waste
 * must be documented with date/time, quantity, and the pharmacist who handled it.
 * recordC2Movement() inserts a row into the c2_movements table (migration 0009).
 *
 * Register.tsx triggers this at COMPLETE_SALE for C-II products — that wiring
 * is a Phase A concern (Register.tsx is Phase A-owned); for now we export the
 * helper so Prescriptions.tsx dispense and Register.tsx can both call it.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product } from "../data";

export type C2Direction = "dispense" | "receive" | "transfer_out" | "transfer_in" | "waste";

export interface C2MovementInput {
  productId: string;
  direction: C2Direction;
  qty: number;
  patientName?: string;
  customerId?: string | null;
  rxId?: string | null;
  reason?: string;               // required for waste / transfer
  pharmacist: string;            // DEA responsible party name
  deaNumber: string;
  staffId?: string | null;
}

export interface C2Movement extends C2MovementInput {
  id: string;                     // uuid
  organizationId: string;
  createdAt: number;              // epoch ms
}

/** Persist a C-II movement to the backend. If the backend is unreachable the
 *  movement is stashed in localStorage under "c2_pending" for later replay by
 *  sync.ts — C-II accountability survives offline sessions. */
export async function recordC2Movement(input: C2MovementInput, client: SupabaseClient = supabase): Promise<C2Movement | null> {
  const movement: C2Movement = {
    id: crypto.randomUUID(),
    organizationId: "local",
    createdAt: Date.now(),
    ...input,
  };

  if (!isSupabaseConfigured) {
    enqueuePending("c2_movements", movement);
    return movement;
  }

  const { error } = await client.from("c2_movements").insert({
    id: movement.id,
    product_id: movement.productId,
    direction: movement.direction,
    qty: movement.qty,
    patient_name: movement.patientName ?? null,
    customer_id: movement.customerId ?? null,
    rx_id: movement.rxId ?? null,
    reason: movement.reason ?? null,
    pharmacist: movement.pharmacist,
    dea_number: movement.deaNumber,
    staff_id: movement.staffId ?? null,
  });

  if (error) {
    enqueuePending("c2_movements", movement);
    return null;
  }
  return movement;
}

/** Read all C-II movements for a product (inventory → lot-trace expansion). */
export async function c2MovementsFor(productId: string, client: SupabaseClient = supabase): Promise<C2Movement[]> {
  if (!isSupabaseConfigured) return (readPending("c2_movements") as C2Movement[]).filter((m) => m.productId === productId);
  const { data, error } = await client
    .from("c2_movements")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as C2Movement[];
}

/* ------------------------------------------------------------------ */
/*  Offline queue — persisted to localStorage and replayed by sync.ts  */
/* ------------------------------------------------------------------ */

const PENDING_KEY = "c2_pending";

function enqueuePending(table: string, row: unknown): void {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push({ table, row, ts: Date.now() });
    localStorage.setItem(PENDING_KEY, JSON.stringify(arr));
  } catch { /* ignore — offline mode */ }
}

function readPending(table: string): unknown[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Array<{ table: string; row: unknown }>)
      .filter((x) => x.table === table)
      .map((x) => x.row);
  } catch {
    return [];
  }
}

/** Drain the pending queue — called by sync.ts after a successful backend write. */
export async function flushC2Pending(client: SupabaseClient = supabase): Promise<number> {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return 0;
    const arr = JSON.parse(raw) as Array<{ table: string; row: unknown }>;
    if (arr.length === 0) return 0;
    const remaining: typeof arr = [];
    let flushed = 0;
    for (const item of arr) {
      const { error } = await client.from(item.table as string).insert(item.row as Record<string, unknown>);
      if (error) remaining.push(item);
      else flushed++;
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(remaining));
    return flushed;
  } catch {
    return 0;
  }
}

/** Convenience: is this product a Schedule-II controlled substance? */
export function isC2(p: Product | undefined): boolean {
  return p?.controlled === "C-II";
}
