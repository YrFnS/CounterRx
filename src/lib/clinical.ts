/* Clinical decision-support helpers (Phase C, §3).
 *
 * Pure, dependency-free functions that screen prescriptions at dispense time.
 * The till (Prescriptions.tsx) imports these to block or warn on
 *   - drug–drug interactions  (findInteractions — runtime-overridable, §1)
 *   - drug–allergy conflicts  (allergyConflicts — re-exported from data.ts)
 *   - duplicate therapy       (detectDuplicateTherapy, §2)
 *   - refills exhausted       (canRefill, §5)
 *   - refill too soon         (refillTooSoon, §5)
 *   - Rx expired              (rxExpired, §5)
 *
 * Phase A mounts interaction/allergy warnings on the Register basket; until then
 * these helpers export their full signature so Register.tsx can call them directly.
 */
import type { Prescription, Product } from "../data";

/* Re-export the runtime-overridable interaction engine from data.ts so
 * Prescriptions.tsx imports ONE place for all clinical checks. */
export { findInteractions, setRuntimeInteractions, INTERACTIONS } from "../data";

/* Re-export of allergyConflicts so Prescriptions.tsx imports all clinical
 * checks from one place. */
export { allergyConflicts } from "../data";

/* ------------------------------------------------------------------ */
/*  Duplicate therapy detection (Phase C, §2)                          */
/* ------------------------------------------------------------------ */

/** Two products that treat the same therapeutic class — only the stronger
 *  should be dispensed together. Returns the conflicting pair + the shared class. */
export interface DuplicateHit {
  a: string; b: string;          // product ids
  therapeuticClass: string;
  reason: string;
}

/* category → set of product ids sharing that category */
function byCategory(products: Product[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const p of products) {
    const arr = m.get(p.category) ?? [];
    arr.push(p.id);
    m.set(p.category, arr);
  }
  return m;
}

/** Walk a list of product ids; flag any that share a therapeutic category
 *  AND are both in the basket (prescribed together). O(n) in basket size. */
export function detectDuplicateTherapy(ids: string[], products: Product[]): DuplicateHit[] {
  const idx = new Map(products.map((p) => [p.id, p]));
  const catMap = byCategory(products);
  const out: DuplicateHit[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    const p = idx.get(id);
    if (!p) continue;
    for (const other of catMap.get(p.category) ?? []) {
      if (other === id || !ids.includes(other)) continue;
      const key = [id, other].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const otherP = idx.get(other)!;
      out.push({
        a: id, b: other,
        therapeuticClass: p.category,
        reason: `${p.name} and ${otherP.name} share the "${p.category}" class — therapeutic duplication`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Refill enforcement (Phase C, §5)                                    */
/* ------------------------------------------------------------------ */

/** True when a prescription still has refills remaining AND has not expired. */
export function canRefill(rx: Prescription): boolean {
  if ((rx.refillsRemaining ?? 0) <= 0) return false;
  return !rxExpired(rx.rxExpiry);
}

/** Days until the prescription expires (positive = future, negative = past). */
export function daysUntilExpiry(expiry: string | undefined): number | undefined {
  if (!expiry) return undefined;
  return Math.ceil((new Date(expiry + "T00:00:00").getTime() - Date.now()) / 86_400_000);
}

/** True when an Rx has passed its expiration date. */
export function rxExpired(expiry: string | undefined): boolean {
  if (!expiry) return false;
  return new Date(expiry + "T00:00:00").getTime() <= Date.now();
}

/** Has this Rx already been dispensed too recently? `daysSupply` drives the
 *  lockout window — a refill before supply runs out is blocked. */
export function refillTooSoon(rx: Prescription): boolean {
  if (!rx.dispensedAt || !rx.daysSupply) return false;
  const supplyEnd = rx.dispensedAt + rx.daysSupply * 86_400_000;
  return Date.now() < supplyEnd;
}

/** Combined guard: can this prescription be dispensed right now?
 *  Returns a list of human-readable block reasons (empty = OK to dispense). */
export function dispenseBlockers(rx: Prescription): string[] {
  const b: string[] = [];
  if (rxExpired(rx.rxExpiry)) b.push("Prescription has expired");
  if ((rx.refillsRemaining ?? 0) <= 0) b.push("No refills remaining");
  if (rx.status === "dispensed") b.push("Already dispensed");
  return b;
}
