/* W4.1 — NCPDP Telecommunications D.0 claims adapter.
 *
 * An adapter wraps a payer gateway so the rest of the app only speaks submit /
 * adjudicate / reverse. The sandbox implementation below fakes the payer
 * deterministically (no network, no partner account) so the full lifecycle can
 * be demoed and unit-tested end to end.
 *
 * PRODUCTION SWITCH SEAM: when a real NCPDP gateway partner is onboarded, add a
 * `submit`/`adjudicate`/`reverse` implementation of `ClaimsAdapter` that POSTs
 * NCPDP D.0 segments through a Supabase Edge Function (partner credentials stay
 * server-side), then select it in `makeClaimsAdapter()` based on
 * `settings.claimsMode === "live"` instead of `"sandbox"`. No call sites change.
 * See README "Claims adapter" for the partner onboarding checklist.
 *
 * Note: the sandbox adapter is synchronous (deterministic, no network). A live
 * adapter would be async; the dispatch call site would then use an effect or
 * async middleware — the synchronous interface is a sandbox convenience that
 * mirrors the existing deterministic-simulation pattern (PA_CHECK, etc.).
 */

import type { OrgSettings, Prescription } from "../data";
import type { Product } from "../data";

export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export type ClaimStatus = "submitted" | "paid" | "rejected" | "resubmitted";

export interface RxClaim {
  id: string;
  prescriptionId: string;
  patient: string;
  drug: string;
  qty: number;
  submittedAt: number;
  status: ClaimStatus;
  payer: string;
  amount: number;                       // adjudicated copay/patient-pay in minor units (cents)
  adjudication: Record<string, unknown>; // raw payer response (NCPDP fields mirror)
  organizationId: string;
}

export interface SubmitInput {
  prescriptionId: string;
  patient: string;
  drug: string;
  qty: number;
  payer: string;
  amount: number;
  organizationId: string;
}

export type ClaimsMode = "sandbox" | "live";

export interface ClaimsAdapter {
  readonly mode: ClaimsMode;
  /** Submit a new claim; returns the created claim in `submitted` status. */
  submit(input: SubmitInput): RxClaim;
  /** Adjudicate a submitted claim; transitions to paid / rejected. */
  adjudicate(claim: RxClaim): RxClaim;
  /** Reverse a previously paid claim (reversal / void). */
  reverse(claim: RxClaim): RxClaim;
}

/** Build the org's configured adapter. Sandbox until a live partner lands. */
export function makeClaimsAdapter(settings: Pick<OrgSettings, "claimsMode">): ClaimsAdapter {
  // ponytail: single seam — wire `live` gateway here once onboarded, no caller changes.
  if (settings.claimsMode === "live") {
    throw new Error("W4.1: live claims gateway not configured — no partner account yet; use claimsMode: 'sandbox'.");
  }
  return sandboxAdapter;
}

/* ------------------------------------------------------------------ */
/* Sandbox payer — deterministic, offline, no network                 */
/* ------------------------------------------------------------------ */

const sandboxAdapter: ClaimsAdapter = {
  mode: "sandbox",

  submit(input: SubmitInput): RxClaim {
    return {
      id: `CLM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      prescriptionId: input.prescriptionId,
      patient: input.patient,
      drug: input.drug,
      qty: input.qty,
      submittedAt: Date.now(),
      status: "submitted",
      payer: input.payer,
      amount: input.amount,
      adjudication: { responseStatus: "A1", message: "Claim accepted for adjudication" },
      organizationId: input.organizationId,
    };
  },

  adjudicate(claim: RxClaim): RxClaim {
    // ponytail: deterministic rule — claims under $500_00 paid, else rejected.
    const approved = claim.amount < 500_00;
    return {
      ...claim,
      status: approved ? "paid" : "rejected",
      adjudication: approved
        ? { responseStatus: "A1", paid: claim.amount, patientPay: claim.amount, rejectCode: null }
        : { responseStatus: "R1", rejectCode: "70", message: "Plan does not cover / exceeds threshold" },
    };
  },

  reverse(claim: RxClaim): RxClaim {
    return {
      ...claim,
      status: "resubmitted",
      submittedAt: Date.now(),
      adjudication: { responseStatus: "A1", message: "Claim reversed and resubmitted", reversedFrom: claim.id },
    };
  },
};

/** Convenience: build a SubmitInput from a dispensed Rx + product + plan. */
export function claimFromRx(
  rx: Prescription,
  product: Product,
  plan: string,
  organizationId: string,
): SubmitInput {
  const price = product.price ?? 0;
  return {
    prescriptionId: rx.id,
    patient: rx.patient,
    drug: product.name,
    qty: rx.qty,
    payer: plan || "Cash",
    amount: Math.round(price * rx.qty * 100), // minor units
    organizationId,
  };
}