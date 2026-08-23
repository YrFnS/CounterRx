import { describe, it, expect } from "vitest";
import { checkEligibility } from "../lib/eligibility";
import { reducer, seed } from "../store";
import type { Customer } from "../data";

type State = Parameters<typeof reducer>[0];
type Action = Parameters<typeof reducer>[1];

function makeTestState(overrides: Partial<State> = {}): State {
  const baseSeed = seed();
  return {
    ...baseSeed,
    user: null,
    backendAuthenticated: false,
    backendOffline: false,
    lockouts: {},
    restrictedLog: [],
    online: true,
    cart: [],
    held: [],
    saleCustomerId: null,
    redeemPoints: 0,
    currentShift: null,
    view: "register",
    invPreset: "all",
    payOpen: false,
    receipt: null,
    toasts: [],
    flashId: null,
    flashKey: 0,
    snapshotVersion: 0,
    outboxCount: 0,
    conflicts: [],
    promotions: [],
    vaccinations: [],
    shifts: [],
    storeCredits: [],
    notificationLog: [],
    ...overrides,
  };
}

describe("W4.2 sandbox eligibility responder", () => {
  it("is active for a memberId that does not end in 9", () => {
    const r = checkEligibility({ name: "Helen Okafor", memberId: "BXC-44712" }, "BlueCross PBM");
    expect(r.active).toBe(true);
    expect(r.source).toBe("sandbox");
    expect(r.payer).toBe("BlueCross PBM");
  });

  it("is inactive for a memberId ending in 9 (consistent with prior-auth rule)", () => {
    const r = checkEligibility({ name: "Victor Adeyemi", memberId: "MPR-22109" }, "MediPlan Rx");
    expect(r.active).toBe(false);
    expect(r.copay).toBe(0);
  });

  it("falls back to the patient name when no memberId is on file", () => {
    const withId = checkEligibility({ name: "Priya Nair", memberId: "AET-9001" }, "Aetna Rx");
    const noId = checkEligibility({ name: "Priya Nair" }, "Aetna Rx");
    expect(withId.active).toBe(true);
    expect(noId.active).toBe(true);
    expect(noId.copay).toBeGreaterThan(0);
  });

  it("returns deterministic copay math (5/10/15/20/25 tier) and sane deductible sums", () => {
    const r = checkEligibility({ name: "Grace Lin", memberId: "AET-7712" }, "Aetna Rx");
    expect([5, 10, 15, 20, 25]).toContain(r.copay);
    expect(r.deductible.remaining).toBeGreaterThanOrEqual(0);
    expect(r.deductible.met).toBeGreaterThanOrEqual(0);
    expect(r.deductible.met + r.deductible.remaining).toBe(r.deductible.annual);
    expect([500, 1000, 1500, 2500]).toContain(r.deductible.annual);
  });

  it("is fully deterministic — same input, same output", () => {
    const a = checkEligibility({ name: "Daniel Osei", memberId: "BXC-8810", dob: "1964-05-18" }, "BlueCross PBM");
    const b = checkEligibility({ name: "Daniel Osei", memberId: "BXC-8810", dob: "1964-05-18" }, "BlueCross PBM");
    expect(a).toEqual(b);
  });

  it("reports a valid formulary tier", () => {
    const r = checkEligibility({ name: "Helen Okafor", memberId: "BXC-44712" }, "BlueCross PBM");
    expect(["preferred", "non-preferred", "not-covered"]).toContain(r.formulary);
  });
});

describe("W4.2 insurance card reducer actions", () => {
  it("CUSTOMER_CARD_ATTACH stores the dataUrl on the customer and audits it", () => {
    const state = makeTestState();
    const c: Customer = { id: "C-X", name: "Test Patient", phone: "555", createdAt: 1, points: 0 };
    const withCust = makeTestState({ customers: [...state.customers, c] });
    const next = reducer(withCust, { type: "CUSTOMER_CARD_ATTACH", id: "C-X", dataUrl: "data:image/jpeg;base64,AAA" });
    const updated = next.customers.find((x) => x.id === "C-X")!;
    expect(updated.insuranceCardImage).toBe("data:image/jpeg;base64,AAA");
    expect(next.audit.some((a) => a.detail.includes("Insurance card scan attached"))).toBe(true);
  });

  it("CUSTOMER_CARD_REMOVE clears the stored image", () => {
    const c: Customer = { id: "C-X", name: "Test Patient", phone: "555", createdAt: 1, points: 0, insuranceCardImage: "data:image/jpeg;base64,AAA" };
    const state = makeTestState({ customers: [c] });
    const next = reducer(state, { type: "CUSTOMER_CARD_REMOVE", id: "C-X" });
    expect(next.customers.find((x) => x.id === "C-X")!.insuranceCardImage).toBeUndefined();
  });

  it("ignores attach/remove for an unknown customer id", () => {
    const state = makeTestState();
    expect(reducer(state, { type: "CUSTOMER_CARD_ATTACH", id: "NOPE", dataUrl: "x" })).toBe(state);
    expect(reducer(state, { type: "CUSTOMER_CARD_REMOVE", id: "NOPE" })).toBe(state);
  });
});
