import { describe, it, expect } from "vitest";
import { applicablePromotions, isBirthdayToday, isFirstVisit, isWindowActive } from "../lib/promotions";
import type { Promotion } from "../data";

const DAY = 86_400_000;

function promo(over: Partial<Promotion>): Promotion {
  return {
    id: over.id ?? "P1",
    name: "Test promo",
    kind: "birthday",
    pct: 10,
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

/* Fixed date: 2026-08-23 (Sunday) */
const TODAY = new Date("2026-08-23T12:00:00Z");

describe("promotions — birthday match", () => {
  it("matches month/day regardless of birth year", () => {
    expect(isBirthdayToday("1990-08-23", TODAY)).toBe(true);
    expect(isBirthdayToday("2001-02-14", TODAY)).toBe(false);
  });

  it("ignores missing or malformed dob", () => {
    expect(isBirthdayToday(undefined, TODAY)).toBe(false);
    expect(isBirthdayToday("", TODAY)).toBe(false);
    expect(isBirthdayToday("1990-08", TODAY)).toBe(false);
  });

  it("fires the birthday promotion for a matching customer", () => {
    const state = {
      promotions: [promo({ kind: "birthday", pct: 15 })],
      products: [{ id: "p1", price: 100, category: "vitamins" }],
      transactions: [],
    };
    const cart = [{ productId: "p1", qty: 2 }];
    const out = applicablePromotions(state as never, cart, { id: "C1", dob: "1985-08-23" }, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].scope).toBe("invoice");
    expect(out[0].amount).toBe(30); // 15% of 200
  });

  it("does not fire birthday without an attached customer", () => {
    const state = {
      promotions: [promo({ kind: "birthday" })],
      products: [{ id: "p1", price: 100, category: "vitamins" }],
      transactions: [],
    };
    const out = applicablePromotions(state as never, [{ productId: "p1", qty: 1 }], null, TODAY);
    expect(out).toHaveLength(0);
  });
});

describe("promotions — first-visit detection", () => {
  it("fires when the customer has no prior transactions", () => {
    expect(isFirstVisit("C1", [])).toBe(true);
    expect(isFirstVisit(null, [])).toBe(false);
  });

  it("does not fire once the customer has a prior sale", () => {
    const txs: { id: string; customerId: string; refundOf?: string }[] = [
      { id: "T1", customerId: "C1" },
      { id: "T2", customerId: "C2" },
    ];
    expect(isFirstVisit("C1", txs)).toBe(false);
    // refunded sales don't count as history
    expect(isFirstVisit("C1", txs.concat([{ id: "T3", customerId: "C1", refundOf: "T0" }]))).toBe(false);
    expect(isFirstVisit("C1", [{ id: "T9", customerId: "C1", refundOf: "T8" }])).toBe(true);
  });

  it("applies first_visit % to the subtotal", () => {
    const state = {
      promotions: [promo({ id: "PFV", kind: "first_visit", pct: 10 })],
      products: [{ id: "p1", price: 50, category: "pain" }],
      transactions: [],
    };
    const out = applicablePromotions(state as never, [{ productId: "p1", qty: 1 }], { id: "C-new", dob: undefined }, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(5);
  });
});

describe("promotions — category window math", () => {
  const nowMs = TODAY.getTime();

  it("window open on both bounds", () => {
    const p = promo({ kind: "category_pct", windowStart: nowMs - DAY, windowEnd: nowMs + DAY });
    expect(isWindowActive(p, nowMs)).toBe(true);
  });

  it("inactive before start / after end / open-ended always active", () => {
    expect(isWindowActive(promo({ kind: "category_pct", windowStart: nowMs + DAY }), nowMs)).toBe(false);
    expect(isWindowActive(promo({ kind: "category_pct", windowEnd: nowMs - DAY }), nowMs)).toBe(false);
    expect(isWindowActive(promo({ kind: "category_pct" }), nowMs)).toBe(true);
  });

  it("discounts only lines from the matching category", () => {
    const state = {
      promotions: [promo({
        id: "PCAT", kind: "category_pct", categoryId: "vitamins", pct: 20,
        windowStart: nowMs - DAY, windowEnd: nowMs + DAY,
      })],
      products: [
        { id: "v1", price: 30, category: "vitamins" },
        { id: "o1", price: 40, category: "pain" },
      ],
      transactions: [],
    };
    const cart = [{ productId: "v1", qty: 2 }, { productId: "o1", qty: 1 }];
    const out = applicablePromotions(state as never, cart, null, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].scope).toBe("category");
    expect(out[0].amount).toBe(12); // 20% of (30×2), not the $40 pain line
    expect(out[0].lineProductIds).toEqual(["v1"]);
  });

  it("skips expired windows and inactive rules", () => {
    const state = {
      promotions: [
        promo({ id: "EXP", kind: "category_pct", categoryId: "pain", pct: 50, windowEnd: nowMs - DAY }),
        promo({ id: "OFF", kind: "category_pct", categoryId: "pain", pct: 50, active: false }),
      ],
      products: [{ id: "p1", price: 10, category: "pain" }],
      transactions: [],
    };
    expect(applicablePromotions(state as never, [{ productId: "p1", qty: 1 }], null, TODAY)).toHaveLength(0);
  });
});

describe("promotions — stacking, caps and audit trail", () => {
  it("stacks invoice + category promos but never exceeds the subtotal", () => {
    const nowMs = TODAY.getTime();
    const state = {
      promotions: [
        promo({ id: "PB", kind: "birthday", pct: 60 }),
        promo({ id: "PV", kind: "first_visit", pct: 60 }),
        promo({ id: "PC", kind: "category_pct", categoryId: "pain", pct: 60, windowStart: nowMs - DAY }),
      ],
      products: [{ id: "p1", price: 100, category: "pain" }],
      transactions: [],
    };
    const cart = [{ productId: "p1", qty: 1 }];
    const out = applicablePromotions(state as never, cart, { id: "C1", dob: "1990-08-23" }, TODAY);
    const total = out.reduce((s, a) => s + a.amount, 0);
    expect(total).toBeLessThanOrEqual(100);
    expect(out.length).toBeGreaterThan(1); // all three fired
  });

  it("returns nothing for an empty cart or no active rules", () => {
    const state = {
      promotions: [promo({})],
      products: [{ id: "p1", price: 100, category: "pain" }],
      transactions: [],
    };
    expect(applicablePromotions(state as never, [], { id: "C1", dob: "1990-08-23" }, TODAY)).toHaveLength(0);
    expect(applicablePromotions({ ...state, promotions: [] } as never, [{ productId: "p1", qty: 1 }], null, TODAY)).toHaveLength(0);
  });
});

/* ---- reducer integration: COMPLETE_SALE records the promotion + audit trail (W3.4) ---- */
import { reducer, seed, cartTotals } from "../store";

type State = Parameters<typeof reducer>[0];
type Action = Parameters<typeof reducer>[1];

function promoState(): State {
  const base = seed() as unknown as State;
  return {
    ...base,
    user: { id: "S1", name: "Manager", role: "manager", pinHash: "x", initials: "M", active: true, createdAt: 0 },
    promotions: [promo({ id: "PB", name: "Birthday reward", kind: "birthday", pct: 10 })],
    products: [{ ...(base.products[0]), price: 100, category: "pain" }],
    cart: [{ productId: base.products[0].id, qty: 1 }],
    customers: [{ id: "C-BD", name: "Birthday Kid", phone: "", points: 0, createdAt: 0, dob: "1990-08-23" }],
    saleCustomerId: "C-BD",
    /* UI/session fields seed() does not carry but the reducer touches */
    toasts: [], redeemPoints: 0, payOpen: false, receipt: null,
  } as State;
}

describe("promotions — COMPLETE_SALE audit + totals", () => {
  it("cartTotals applies promoDiscount on top of coupon and caps at the payable base", () => {
    const state = promoState();
    const full = cartTotals(state, 0, false, 0, 0, 10); // $10 promo on $100
    expect(full.promo).toBe(10);
    expect(full.total).toBe(90);
    // over-the-top promo is capped so total never goes negative
    const capped = cartTotals(state, 0, false, 95, 0, 50); // $95 coupon + $50 promo vs $100 subtotal
    expect(capped.total).toBe(0);
    expect(capped.coupon).toBe(95);
    expect(capped.promo).toBe(5);
  });

  it("records an audit entry naming the fired rules on COMPLETE_SALE", () => {
    const state = promoState();
    const next = reducer(state, {
      type: "COMPLETE_SALE",
      payments: [{ method: "cash", amount: 90 }],
      discountPct: 0, taxExempt: false, idChecked: false,
      promotionDiscount: 10,
      promotionNames: ["Birthday reward"],
    } as Action);
    const tx = next.transactions[0];
    expect(tx.promotionDiscount).toBe(10);
    expect(tx.promotionNames).toEqual(["Birthday reward"]);
    const auditText = next.audit.map((a) => a.detail).join("\n");
    expect(auditText).toContain("promotion auto-applied");
    expect(auditText).toContain("Birthday reward");
  });

  it("no promotion audit entry when no rule fired (dismissed by manager)", () => {
    const state = promoState();
    const dismissed = { ...state, promotions: [] }; // manager override removes the rule before payment
    const next = reducer(dismissed, {
      type: "COMPLETE_SALE",
      payments: [{ method: "cash", amount: 100 }],
      discountPct: 0, taxExempt: false, idChecked: false,
    } as Action);
    expect(next.transactions[0].promotionDiscount).toBeUndefined();
    expect(next.audit.some((a) => a.detail.includes("promotion auto-applied"))).toBe(false);
  });
});
