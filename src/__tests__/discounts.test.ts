import { describe, it, expect } from "vitest";
import { cartTotals, seed } from "../store";

/* Deterministic cart over the seeded catalog. */
function stateWithCart(lines: { productId: string; qty: number; lineDiscount?: { mode: "amt" | "pct"; value: number } }[]) {
  return { ...seed(), redeemPoints: 0, cart: lines };
}

describe("discounts (P3)", () => {
  it("applies a per-line percentage discount", () => {
    const p = seed().products.find((x) => !x.rx && x.price > 10)!;
    const state = stateWithCart([{ productId: p.id, qty: 1, lineDiscount: { mode: "pct", value: 10 } }]);
    const t = cartTotals(state as never, 0);
    expect(t.lineDiscounts).toBeCloseTo(p.price * 0.1, 2);
    expect(t.total).toBeCloseTo(p.price * 0.9, 2);
    expect(t.lines[0].lineDiscount).toEqual({ mode: "pct", value: 10 });
  });

  it("caps an amount discount at the line gross", () => {
    const p = seed().products.find((x) => x.price < 10)!;
    const state = stateWithCart([{ productId: p.id, qty: 1, lineDiscount: { mode: "amt", value: p.price + 50 } }]);
    const t = cartTotals(state as never, 0);
    expect(t.lineDiscounts).toBeCloseTo(p.price, 2);
    expect(t.total).toBe(0);
  });

  it("stacks line discounts with invoice % and capped invoice $", () => {
    const products = seed().products;
    const a = products.find((x) => !x.rx && x.price > 5)!;
    const b = products.find((x) => !x.rx && x.price > 5 && x.id !== a.id)!;
    const state = stateWithCart([
      { productId: a.id, qty: 1, lineDiscount: { mode: "amt", value: 1 } },
      { productId: b.id, qty: 2 },
    ]);
    const subtotal = Math.round((a.price + b.price * 2) * 100) / 100;
    // 20% invoice discount + $9999 amount discount (capped at the remaining base)
    const t = cartTotals(state as never, 20, false, 0, 9999);
    expect(t.subtotal).toBe(subtotal);
    expect(t.discount).toBeGreaterThan(0);
    expect(t.discount).toBeLessThanOrEqual(subtotal - 1); // never exceeds the post-line-discount base
    expect(t.total).toBeGreaterThanOrEqual(0);
  });

  it("keeps tax at zero after tax removal", () => {
    const p = seed().products.find((x) => !x.rx)!;
    const state = stateWithCart([{ productId: p.id, qty: 1 }]);
    const t = cartTotals(state as never, 0);
    expect(t.tax).toBe(0);
  });
});
