import { describe, it, expect } from "vitest";
import { makeVaccinations, vaccinationsDue, buildVaxCardData, VACCINATION_SITES } from "../data";
import type { Vaccination } from "../data";
import { makeProducts } from "../data";

const now = Date.now();
const vax = makeVaccinations(now);
const products = makeProducts(now);

describe("vaccinationsDue — 30-day window math", () => {
  it("returns only rows whose nextDue is within the next 30 days", () => {
    const due = vaccinationsDue(vax, 30, now);
    expect(due.length).toBe(2);
    expect(due.every((v) => (v.nextDue ?? 0) >= now && (v.nextDue ?? 0) <= now + 30 * 86_400_000)).toBe(true);
  });

  it("excludes already-administered or past-due doses", () => {
    const due = vaccinationsDue(vax, 30, now);
    // VAX-1003 (Tdap) has no nextDue → excluded
    expect(due.find((v) => v.id === "VAX-1003")).toBeUndefined();
    // only the two seeded due rows (VAX-1001, VAX-1002)
    expect(due.map((v) => v.id).sort()).toEqual(["VAX-1002", "VAX-1001"].sort());
  });

  it("is sorted soonest-first", () => {
    const due = vaccinationsDue(vax, 30, now);
    expect(due[0].nextDue! - (due[1].nextDue ?? 0)).toBeLessThan(0);
  });

  it("windowDays=0 returns nothing", () => {
    expect(vaccinationsDue(vax, 0, now)).toEqual([]);
  });

  it("returns all rows for a wide window", () => {
    expect(vaccinationsDue(vax, 400, now).length).toBe(4);
  });
});

describe("reducer ADD / UPDATE vaccination", () => {
  /* state/action types aren't exported from store.tsx; derive them like reducer.test.ts */
  type State = Parameters<typeof import("../store").reducer>[0];
  const makeState = async (): Promise<State> => {
    const { seed } = await import("../store");
    return {
      ...seed(),
      user: null, backendAuthenticated: false, backendOffline: false, lockouts: {}, restrictedLog: [], online: true,
      cart: [], held: [], saleCustomerId: null, redeemPoints: 0, currentShift: null,
      view: "register", invPreset: "all", payOpen: false, receipt: null, toasts: [], flashId: null, flashKey: 0,
      snapshotVersion: 0, snapshots: [],
    } as unknown as State;
  };

  it("add record appends to state.vaccinations", async () => {
    const { reducer } = await import("../store");
    const base = await makeState();
    const before = base.vaccinations.length;
    const next = reducer(base, {
      type: "ADD_VACCINATION",
      vax: {
        patientId: "C-001", productId: "fluq", lot: "TEST-001", doseNumber: 1,
        site: "Right deltoid", administrator: "Test Staff",
        administeredAt: now, nextDue: now + 365 * 86_400_000,
      },
    });
    expect(next.vaccinations.length).toBe(before + 1);
    const added = next.vaccinations.find((v) => v.lot === "TEST-001");
    expect(added).toBeTruthy();
    expect(added?.patientId).toBe("C-001");
    expect(added?.productId).toBe("fluq");
    expect(added?.createdAt).toBeTypeOf("number");
  });

  it("add record is rejected for an unknown patient or product", async () => {
    const { reducer } = await import("../store");
    const base = await makeState();
    const patientBad = reducer(base, {
      type: "ADD_VACCINATION",
      vax: { patientId: "NOPE-999", productId: "fluq", doseNumber: 1, administrator: "X", administeredAt: now },
    });
    expect(patientBad.vaccinations.length).toBe(base.vaccinations.length);
    const productBad = reducer(base, {
      type: "ADD_VACCINATION",
      vax: { patientId: "C-001", productId: "NOPE", doseNumber: 1, administrator: "X", administeredAt: now },
    });
    expect(productBad.vaccinations.length).toBe(base.vaccinations.length);
  });

  it("update record edits nextDue / lot in place", async () => {
    const { reducer } = await import("../store");
    const base = await makeState();
    const target = base.vaccinations[0];
    if (!target) throw new Error("seed produced no vaccinations");
    const next = reducer(base, {
      type: "UPDATE_VACCINATION", id: target.id,
      patch: { lot: "UPD-999", doseNumber: 2 },
    });
    const updated = next.vaccinations.find((v) => v.id === target.id);
    expect(updated?.lot).toBe("UPD-999");
    expect(updated?.doseNumber).toBe(2);
    // other rows untouched
    expect(next.vaccinations.filter((v) => v.id !== target.id).length).toBe(base.vaccinations.length - 1);
  });

  it("update record is a no-op for an unknown id", async () => {
    const { reducer } = await import("../store");
    const base = await makeState();
    const next = reducer(base, { type: "UPDATE_VACCINATION", id: "VAX-NOPE", patch: { lot: "X" } });
    expect(next.vaccinations).toBe(base.vaccinations);
  });
});

describe("buildVaxCardData — CDC card data shape", () => {
  it("produces oldest→newest rows with required fields and metadata", () => {
    const card = buildVaxCardData("Test Patient", "1990-01-01", "Test Pharmacy", vax,
      (id) => products.find((p) => p.id === id)?.name ?? id);
    expect(card.patientName).toBe("Test Patient");
    expect(card.dob).toBe("1990-01-01");
    expect(card.orgName).toBe("Test Pharmacy");
    expect(card.rows.length).toBe(vax.length);
    // rows sorted oldest→newest
    for (let i = 1; i < card.rows.length; i++) {
      expect(card.rows[i].administeredAt).toBeGreaterThanOrEqual(card.rows[i - 1].administeredAt);
    }
    const first = card.rows[0];
    expect(first.vaccine).toBeTruthy();
    expect(first.doseNumber).toBeTypeOf("number");
    expect(first.lot).toBeTypeOf("string");
    expect(first.administrator).toBeTypeOf("string");
    expect(first.administeredAt).toBeTypeOf("number");
  });

  it("omits doses without an administeredAt", () => {
    const incomplete: Vaccination[] = [
      { id: "X1", patientId: "C-001", productId: "fluq", doseNumber: 1, administrator: "A", administeredAt: now, createdAt: now },
      { id: "X2", patientId: "C-001", productId: "fluq", doseNumber: 2, administrator: "B", administeredAt: undefined as never, createdAt: now },
    ];
    const card = buildVaxCardData("Test", undefined, "Pharm", incomplete, () => "name");
    expect(card.rows.length).toBe(1);
    expect(card.rows[0].doseNumber).toBe(1);
  });

  it("exposes the canonical vaccination site list", () => {
    expect(VACCINATION_SITES.length).toBeGreaterThanOrEqual(4);
    expect(VACCINATION_SITES).toContain("Left deltoid");
    expect(VACCINATION_SITES).toContain("Right deltoid");
  });
});
