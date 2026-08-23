/* W4.2 — Eligibility adapter (stub).
 *
 * Interface + deterministic sandbox responder so the till can exercise the full
 * coverage display flow today. The real-time payer connection is deferred:
 * [EXTERNAL] — wire a HIPAA-compliant gateway (Change Healthcare / CoverMyMeds /
 * direct payer X12 270/271) behind `checkEligibility` without touching callers.
 *
 * Sandbox convention (kept consistent with the prior-auth simulator in
 * store.tsx, which treats a memberId ending in 9 as rejected):
 *   - memberId ending in "9"  → coverage INACTIVE
 *   - otherwise               → ACTIVE with copay / deductible / formulary
 *                                derived deterministically from a stable hash.
 */

export interface EligibilityPatient {
  name: string;
  /** Payer-side subscriber id — governs the simulated coverage (see above). */
  memberId?: string;
  dob?: string;
}

export type FormularyStatus = "preferred" | "non-preferred" | "not-covered";

export interface EligibilityResult {
  payer: string;
  active: boolean;
  copay: number;
  deductible: {
    annual: number;
    met: number;
    remaining: number;
  };
  formulary: FormularyStatus;
  checkedAt: number;
  /** Always "sandbox" until the [EXTERNAL] real-time payer connection lands. */
  source: "sandbox";
}

/** Deterministic djb2 hash — stable per input so tests and retries agree. */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

const COPAYS = [5, 10, 15, 20, 25];
const ANNUAL_DEDUCTIBLES = [500, 1000, 1500, 2500];
const FORMULARIES: FormularyStatus[] = ["preferred", "non-preferred", "not-covered"];

export function checkEligibility(
  patient: EligibilityPatient,
  payer: string,
): EligibilityResult {
  const memberId = patient.memberId?.trim() || patient.name;
  const h = hashStr(`${payer}::${memberId}::${patient.dob ?? ""}`);
  const active = !/9$/.test(memberId);
  const annual = ANNUAL_DEDUCTIBLES[h % ANNUAL_DEDUCTIBLES.length];
  const remaining = (h >> 4) % annual;
  const met = Math.min(annual, Math.max(0, annual - remaining));
  return {
    payer,
    active,
    copay: active ? COPAYS[h % COPAYS.length] : 0,
    deductible: { annual, met, remaining: annual - met },
    formulary: FORMULARIES[h % FORMULARIES.length],
    checkedAt: Date.now(),
    source: "sandbox",
  };
}
