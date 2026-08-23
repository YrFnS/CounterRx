import { describe, it, expect } from "vitest";
import {
  makeClaimsAdapter,
  claimFromRx,
  DEFAULT_ORG_ID,
  type RxClaim,
  type SubmitInput,
} from "../lib/claims";
import { makeProducts, makePrescriptions, makeSettings } from "../data";

const now = Date.now();
const products = makeProducts(now);
const prescriptions = makePrescriptions(now);

/* Build a claim straight through the sandbox submit path. */
function submit(input: Partial<SubmitInput> = {}): RxClaim {
  return makeClaimsAdapter({ claimsMode: "sandbox" }).submit({
    prescriptionId: "RX-2441",
    patient: "Helen Okafor",
    drug: "Atorvastatin 20mg",
    qty: 2,
    payer: "BlueCross PBM",
    amount: 12_400,
    organizationId: DEFAULT_ORG_ID,
    ...input,
  });
}

describe("W4.1 sandbox claims lifecycle", () => {
  it("submit creates a claim in submitted status with the billed fields", () => {
    const claim = submit({ amount: 3_999 });
    expect(claim.status).toBe("submitted");
    expect(claim.prescriptionId).toBe("RX-2441");
    expect(claim.patient).toBe("Helen Okafor");
    expect(claim.drug).toBe("Atorvastatin 20mg");
    expect(claim.qty).toBe(2);
    expect(claim.payer).toBe("BlueCross PBM");
    expect(claim.amount).toBe(3_999);
    expect(claim.organizationId).toBe(DEFAULT_ORG_ID);
    expect(claim.id).toMatch(/^CLM-/);
    expect(claim.submittedAt).toBeTypeOf("number");
  });

  it("adjudicate pays claims under $500 and rejects claims at/over $500", () => {
    const adapter = makeClaimsAdapter({ claimsMode: "sandbox" });

    const paid = adapter.adjudicate(submit({ amount: 499_99 }));
    expect(paid.status).toBe("paid");
    expect(paid.adjudication.responseStatus).toBe("A1");
    expect(paid.adjudication.rejectCode).toBeNull();

    const rejected = adapter.adjudicate(submit({ amount: 500_00 }));
    expect(rejected.status).toBe("rejected");
    expect(rejected.adjudication.responseStatus).toBe("R1");
    expect(rejected.adjudication.rejectCode).toBe("70");
  });

  it("reverse moves a paid claim to resubmitted and records the reversal", () => {
    const adapter = makeClaimsAdapter({ claimsMode: "sandbox" });
    const paid = adapter.adjudicate(submit({ amount: 100_00 }));
    expect(paid.status).toBe("paid");

    const reversed = adapter.reverse(paid);
    expect(reversed.status).toBe("resubmitted");
    expect(reversed.adjudication.reversedFrom).toBe(paid.id);
    expect(reversed.submittedAt).toBeGreaterThanOrEqual(paid.submittedAt);
  });

  it("adjudicate is idempotent on already-final claims", () => {
    const adapter = makeClaimsAdapter({ claimsMode: "sandbox" });
    const paid = adapter.adjudicate(submit({ amount: 100_00 }));
    const again = adapter.adjudicate(paid); // no-op: stays paid
    expect(again.status).toBe("paid");
  });

  it("claimFromRx maps a dispensed Rx + product into a SubmitInput", () => {
    const rx = prescriptions.find((r) => r.id === "RX-2441");
    const p = products.find((x) => x.id === rx?.productId);
    if (!rx || !p) throw new Error("seed missing RX-2441 or its product");

    const input = claimFromRx(rx, p, "BlueCross PBM", DEFAULT_ORG_ID);
    expect(input.prescriptionId).toBe(rx.id);
    expect(input.patient).toBe(rx.patient);
    expect(input.drug).toBe(p.name);
    expect(input.qty).toBe(rx.qty);
    expect(input.payer).toBe("BlueCross PBM");
    expect(input.amount).toBe(Math.round(p.price * rx.qty * 100)); // minor units
    expect(input.organizationId).toBe(DEFAULT_ORG_ID);
  });

  it("makeClaimsAdapter selects sandbox by default and refuses live", () => {
    expect(makeClaimsAdapter({ claimsMode: "sandbox" }).mode).toBe("sandbox");
    expect(() => makeClaimsAdapter({ claimsMode: "live" })).toThrow(/not configured/);
  });

  it("default settings run in sandbox mode (no partner account)", () => {
    expect(makeSettings().claimsMode).toBe("sandbox");
  });
});

describe("W4.1 reducer claim actions", () => {
  type State = Parameters<typeof import("../store").reducer>[0];
  const makeState = async (): Promise<State> => {
    const { seed } = await import("../store");
    return {
      ...seed(),
      user: null, backendAuthenticated: false, backendOffline: false, lockouts: {}, restrictedLog: [], online: true,
      cart: [], held: [], saleCustomerId: null, redeemPoints: 0, currentShift: null,
      view: "register", invPreset: "all", payOpen: false, receipt: null, toasts: [], flashId: null, flashKey: 0,
      snapshotVersion: 0, outboxCount: 0, conflicts: [], notificationLog: [],
    } as unknown as State;
  };

  it("CLAIM_SUBMIT from a dispensed Rx appends a submitted claim", async () => {
    const { reducer } = await import("../store");
    const base = await makeState();
    const rx = base.prescriptions.find((r) => r.status === "dispensed");
    if (!rx) throw new Error("seed produced no dispensed Rx");

    const next = reducer(base, { type: "CLAIM_SUBMIT", prescriptionId: rx.id });
    expect(next.rxClaims.length).toBe(base.rxClaims.length + 1);
    const claim = next.rxClaims[0];
    expect(claim.prescriptionId).toBe(rx.id);
    expect(claim.patient).toBe(rx.patient);
    expect(claim.status).toBe("submitted");
    expect(claim.payer).toBe(rx.insurance?.plan ?? "Cash");
  });

  it("CLAIM_SUBMIT is rejected for non-dispensed Rx", async () => {
    const { reducer } = await import("../store");
    const base = await makeState();
    const rx = base.prescriptions.find((r) => r.status !== "dispensed");
    if (!rx) throw new Error("seed produced no non-dispensed Rx");
    const next = reducer(base, { type: "CLAIM_SUBMIT", prescriptionId: rx.id });
    expect(next.rxClaims.length).toBe(base.rxClaims.length);
  });

  it("CLAIM_ADJUDICATE + CLAIM_REVERSE run the full sandbox lifecycle", async () => {
    const { reducer } = await import("../store");
    const base = await makeState();
    const rx = base.prescriptions.find((r) => r.status === "dispensed");
    if (!rx) throw new Error("seed produced no dispensed Rx");

    const submitted = reducer(base, { type: "CLAIM_SUBMIT", prescriptionId: rx.id });
    const claim = submitted.rxClaims[0];

    const adjudicated = reducer(submitted, { type: "CLAIM_ADJUDICATE", id: claim.id });
    expect(["paid", "rejected"]).toContain(adjudicated.rxClaims[0].status);

    // Reverse is only valid on a paid claim; force one under the threshold.
    let current = adjudicated;
    if (adjudicated.rxClaims[0].status !== "paid") {
      // amount >= $500 → rejected; re-submit and lower the price via a small claim instead.
      current = { ...adjudicated, rxClaims: [{ ...adjudicated.rxClaims[0], amount: 100_00, status: "submitted" as const }] };
      current = reducer(current, { type: "CLAIM_ADJUDICATE", id: claim.id });
      expect(current.rxClaims[0].status).toBe("paid");
    }

    const reversed = reducer(current, { type: "CLAIM_REVERSE", id: claim.id });
    expect(reversed.rxClaims[0].status).toBe("resubmitted");
    expect(reversed.rxClaims[0].adjudication.reversedFrom).toBe(claim.id);
  });

  it("CLAIM_REVERSE is a no-op on a non-paid claim", async () => {
    const { reducer } = await import("../store");
    const base = await makeState();
    const rx = base.prescriptions.find((r) => r.status === "dispensed");
    if (!rx) throw new Error("seed produced no dispensed Rx");

    const submitted = reducer(base, { type: "CLAIM_SUBMIT", prescriptionId: rx.id });
    const claim = submitted.rxClaims[0];
    const next = reducer(submitted, { type: "CLAIM_REVERSE", id: claim.id });
    expect(next.rxClaims[0].status).toBe("submitted");
  });
});
