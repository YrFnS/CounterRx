import { describe, it, expect } from "vitest";
import { medHistory, normalizeAllergies, allergyConflicts } from "../data";
import type { Product, Transaction, Prescription, Customer, AllergyEntry, TxLine } from "../data";
import { reducer, patientProfilePayload } from "../store";

/* Minimal fixtures — only what the tests touch. */
function makeProduct(id: string, name: string, rx = true): Product {
  return {
    id, brand: name, name, generic: "", form: "tab", category: "cat", price: 10, cost: 5,
    rx, batches: [{ code: "B1", qty: 50, cost: 5, expiry: Date.now() + 1e9, receivedAt: Date.now() }],
    reorderLevel: 3, supplierId: "s", priceTiers: [], uoms: [],
  } as unknown as Product;
}

const amox = makeProduct("AMX", "Amoxicillin 500mg");
const ibu = makeProduct("IBU", "Ibuprofen 400mg", false);

function rxLine(name: string, qty: number): TxLine {
  return { productId: "x", name, form: "tab", qty, price: 10, rx: true };
}

const T0 = 1_700_000_000_000;
const prescriptions: Prescription[] = [
  { id: "RX-9", patient: "Marta Kessler", age: 33, productId: "AMX", qty: 30, prescriberId: "DR-01", status: "dispensed", createdAt: T0 + 2_000 },
];
const transactions: Transaction[] = [
  { id: "TX-1", at: T0 + 3_000, customerId: "C-003", lines: [rxLine("Amoxicillin 500mg", 20)], total: 200 } as unknown as Transaction,
  /* refunded sale — must never appear in med history */
  { id: "TX-2", at: T0 + 4_000, customerId: "C-003", lines: [rxLine("Ibuprofen 400mg", 5)], total: 50, refundOf: "TX-1" } as unknown as Transaction,
];
const products = [amox, ibu];

const marta: Customer = { id: "C-003", name: "Marta Kessler", phone: "(555) 774-2910", createdAt: T0, points: 0 };

describe("W3.6 med history derivation", () => {
  it("derives entries from dispensed Rx (matched by patient name) and ℞ sale lines (matched by customerId)", () => {
    const meds = medHistory(marta.name, marta.id, prescriptions, transactions, products);
    expect(meds).toHaveLength(2);
    const sale = meds.find((m) => m.source === "sale")!;
    expect(sale).toMatchObject({ product: "Amoxicillin 500mg", qty: 20, rxRef: "TX-1" });
    const script = meds.find((m) => m.source === "rx")!;
    expect(script).toMatchObject({ product: "Amoxicillin 500mg", qty: 30, rxRef: "RX-9" });
  });

  it("sorts newest first and excludes refunds and OTC (non-rx) lines", () => {
    const meds = medHistory(marta.name, marta.id, prescriptions, transactions, products);
    expect(meds[0].at).toBeGreaterThanOrEqual(meds[1].at);
    expect(meds.some((m) => m.rxRef === "TX-2")).toBe(false); // refund
    const otcOnly = medHistory("Someone Else", "C-999", [], [{ id: "TX-3", at: T0, customerId: "C-999", lines: [{ ...rxLine("Vitamin C", 1), rx: false }] } as unknown as Transaction], products);
    expect(otcOnly).toHaveLength(0);
  });
});

type TestState = Parameters<typeof reducer>[0];
function baseState(customers: Customer[] = []): TestState {
  return {
    view: "register", cart: [], products, customers, prescriptions, transactions: [],
    categories: [], staff: [], user: { id: "S-1", name: "Rex Chen", role: "pharmacist", pinHash: "x", initials: "RC", active: true, createdAt: T0 },
    settings: { orgName: "Wellfield Pharmacy", loyalty: { ptsPerUnit: 1, redeemThreshold: 1000, redeemValue: 5 } } as any,
    toasts: [], audit: [], shifts: [], currentShift: null, storeCredits: [], held: [], saleCustomerId: null,
    redeemPoints: 0, restrictedLog: [], transfers: [], purchaseOrders: [], apInvoices: [], expenses: [],
    suppliers: [], deliveries: [], webOrders: [], timeEntries: [], backorders: [], rxTransfers: [],
    prescribers: [], coldChainLogs: [], cardPrograms: [], coupons: [], reportCache: {}, drawer: { open: false, balance: 0, floats: [], movements: [], expected: 0, lastReconciled: 0, lastReconBy: null },
    payOpen: false, receipt: null, noteFor: null, scanMiss: 0, flashId: null, flashKey: 0, lang: "en",
  } as unknown as TestState;
}

describe("W3.6 structured allergies", () => {
  it("adds an allergen with severity + reaction, removes it again", () => {
    const s0 = baseState([marta]);
    const s1 = reducer(s0, { type: "CUSTOMER_ALLERGIES", id: "C-003", allergies: [{ allergen: "Penicillin", severity: "severe", reaction: "anaphylaxis" }] });
    const stored = s1.customers[0].allergies as AllergyEntry[];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ allergen: "Penicillin", severity: "severe", reaction: "anaphylaxis" });
    const s2 = reducer(s1, { type: "CUSTOMER_ALLERGIES", id: "C-003", allergies: [] });
    expect(s2.customers[0].allergies).toBeUndefined();
  });

  it("screens legacy strings and drops archived entries from conflicts", () => {
    const conflictsLegacy = allergyConflicts(["Penicillin"], amox);
    expect(conflictsLegacy).toHaveLength(1);
    expect(conflictsLegacy[0]).toMatchObject({ allergen: "Penicillin", severity: "moderate", reason: "amoxicillin" });
    const archived: AllergyEntry = { allergen: "Penicillin", severity: "severe", archived: true };
    expect(allergyConflicts([archived], amox)).toHaveLength(0);
    expect(normalizeAllergies(["Iodine"])[0]).toMatchObject({ allergen: "Iodine", severity: "moderate" });
  });
});

describe("W3.6 conditions + notes timeline", () => {
  it("PATIENT_CONDITIONS stores free-text conditions with optional ICD-style code", () => {
    const s0 = baseState([marta]);
    const s1 = reducer(s0, { type: "PATIENT_CONDITIONS", id: "C-003", conditions: [{ name: "Type 2 diabetes", code: "E11.9" }, { name: "Hypertension" }] });
    expect(s1.customers[0].conditions).toEqual([{ name: "Type 2 diabetes", code: "E11.9" }, { name: "Hypertension" }]);
    const s2 = reducer(s1, { type: "PATIENT_CONDITIONS", id: "C-003", conditions: [] });
    expect(s2.customers[0].conditions).toBeUndefined();
  });

  it("ADD_PATIENT_NOTE appends staff-attributed entries newest-first", () => {
    const s0 = baseState([marta]);
    const s1 = reducer(s0, { type: "ADD_PATIENT_NOTE", id: "C-003", text: "First counseling session" });
    const s2 = reducer(s1, { type: "ADD_PATIENT_NOTE", id: "C-003", text: "Refill follow-up call" });
    const notes = s2.customers[0].patientNotes!;
    expect(notes).toHaveLength(2);
    expect(notes[0].text).toBe("Refill follow-up call"); // newest first
    expect(notes[0].at).toBeGreaterThanOrEqual(notes[1].at);
    expect(notes.every((n) => n.author === "Rex Chen")).toBe(true);
    const s3 = reducer(s2, { type: "ADD_PATIENT_NOTE", id: "C-003", text: "   " }); // blank ignored
    expect(s3.customers[0].patientNotes).toHaveLength(2);
  });
});

describe("W3.6 printable profile payload", () => {
  it("assembles demographics, derived meds, active allergies, conditions and sorted notes", () => {
    const cWithHistory: Customer = {
      ...marta,
      dob: "1991-07-29", gender: "F", address: "9 Aspen Row", insurancePlan: "MediPlan",
      allergies: ["Penicillin"],
      conditions: [{ name: "Asthma", code: "J45" }],
      patientNotes: [{ at: T0, author: "Old", text: "older note" }, { at: T0 + 9_000, author: "New", text: "newer note" }],
    };
    const state = { ...baseState([cWithHistory]), transactions, prescriptions };
    const p = patientProfilePayload(state as never, "C-003")!;
    expect(p.orgName).toBe("Wellfield Pharmacy");
    expect(p.customer.phone).toBe("(555) 774-2910");
    expect(p.meds.map((m) => m.rxRef)).toContain("RX-9");
    expect(p.allergies).toEqual([{ allergen: "Penicillin", severity: "moderate" }]);
    expect(p.conditions).toEqual([{ name: "Asthma", code: "J45" }]);
    expect(p.notes.map((n) => n.text)).toEqual(["newer note", "older note"]); // sorted newest first
    expect(patientProfilePayload(state as never, "C-404")).toBeNull();
  });
});
