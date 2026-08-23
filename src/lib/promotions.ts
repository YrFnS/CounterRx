import type { Customer, Product, Promotion, Transaction } from "../data";

/** A promotion matched against the current cart/customer, with its computed discount. */
export interface AppliedPromotion {
  promotion: Promotion;
  /** Invoice-level (birthday/first-visit) or per-category-line (category_pct). */
  scope: "invoice" | "category";
  /** Discount amount in currency, rounded to 2dp. */
  amount: number;
  /** Lines the discount applies to (category_pct) — empty for invoice scope. */
  lineProductIds?: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Is the customer's birthday today? Compares month/day only (year-blind), UTC-safe on ISO strings. */
export function isBirthdayToday(dobIso: string | undefined, now = new Date()): boolean {
  if (!dobIso || dobIso.length < 10) return false;
  const mm = dobIso.slice(5, 7);
  const dd = dobIso.slice(8, 10);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` ===
    `${dobIso.slice(0, 4)}-${mm}-${dd}`
    ? true
    : now.getMonth() + 1 === Number(mm) && now.getDate() === Number(dd);
}

/** True when the customer has no prior non-refund transactions. */
export function isFirstVisit(customerId: string | null | undefined, transactions: Pick<Transaction, "id" | "customerId" | "refundOf">[]): boolean {
  if (!customerId) return false;
  return !transactions.some((t) => t.customerId === customerId && !t.refundOf);
}

/** Is a category_pct window active at `now`? Open-ended when a bound is missing. */
export function isWindowActive(p: Promotion, now = Date.now()): boolean {
  if (p.windowStart !== undefined && now < p.windowStart) return false;
  if (p.windowEnd !== undefined && now > p.windowEnd) return false;
  return true;
}

/**
 * Compute every applicable promotion for the current cart.
 * - birthday / first_visit → invoice-scope % off the pre-discount subtotal
 * - category_pct → % off lines whose product.category matches categoryId
 * Stacking: one rule of each kind can apply; amounts are computed independently and capped
 * so total discounts never exceed the subtotal.
 */
export function applicablePromotions(
  state: { promotions: Promotion[]; products: Product[]; transactions: Pick<Transaction, "id" | "customerId" | "refundOf">[] },
  cart: { productId: string; qty: number }[],
  customer: Pick<Customer, "id" | "dob"> | null,
  now = new Date(),
): AppliedPromotion[] {
  const out: AppliedPromotion[] = [];
  const active = state.promotions.filter((p) => p.active);
  if (active.length === 0 || cart.length === 0) return out;

  const priceOf = (productId: string): number => state.products.find((x) => x.id === productId)?.price ?? 0;
  const gross = round2(cart.reduce((s, c) => s + priceOf(c.productId) * c.qty, 0));
  if (gross <= 0) return out;

  let applied = 0;

  for (const p of active) {
    if (p.kind === "birthday") {
      if (!customer || !isBirthdayToday(customer.dob, now)) continue;
      // cap at what remains of the subtotal
      const amount = Math.min(round2((gross * p.pct) / 100), round2(gross - applied));
      if (amount <= 0) continue;
      applied += amount;
      out.push({ promotion: p, scope: "invoice", amount });
    } else if (p.kind === "first_visit") {
      if (!isFirstVisit(customer?.id, state.transactions)) continue;
      const amount = Math.min(round2((gross * p.pct) / 100), round2(gross - applied));
      if (amount <= 0) continue;
      applied += amount;
      out.push({ promotion: p, scope: "invoice", amount });
    } else if (p.kind === "category_pct") {
      if (!isWindowActive(p, now.getTime())) continue;
      if (!p.categoryId) continue;
      const lineGross = round2(cart.reduce((s, c) => {
        const prod = state.products.find((x) => x.id === c.productId);
        return prod?.category === p.categoryId ? s + priceOf(c.productId) * c.qty : s;
      }, 0));
      if (lineGross <= 0) continue;
      const amount = Math.min(round2((lineGross * p.pct) / 100), round2(gross - applied));
      if (amount <= 0) continue;
      applied += amount;
      out.push({
        promotion: p,
        scope: "category",
        amount,
        lineProductIds: cart.filter((c) => state.products.find((x) => x.id === c.productId)?.category === p.categoryId).map((c) => c.productId),
      });
    }
  }
  return out;
}
