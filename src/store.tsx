import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { ReactNode, Dispatch } from "react";
import {
  makeProducts, makePrescriptions, makeTransactions, makeCustomers, makeTransfers, TAX_RATE, CASHIER,
  stockOf, nearestExpiry, allocFEFO, fefoBatches, newBatchCode, daysUntil,
  bulkPct, REDEEM_CHUNK_PTS, REDEEM_CHUNK_VALUE,
} from "./data";
import type {
  Product, Transaction, Prescription, Customer, AuditEntry, AuditKind, User,
  HeldSale, TxLine, PayMethod, PaymentLeg, RxStatus, Batch, Transfer, TransferStatus, Field,
} from "./data";

export type View = "register" | "dashboard" | "customers" | "inventory" | "prescriptions" | "history";
export type InventoryPreset = "all" | "low" | "expiring";

export interface Toast { id: number; kind: "success" | "warn" | "error" | "info"; msg: string; }

interface State {
  user: User | null;
  online: boolean;
  products: Product[];
  transactions: Transaction[];
  prescriptions: Prescription[];
  transfers: Transfer[];
  cart: { productId: string; qty: number; note?: string; priceOverride?: number }[];
  held: HeldSale[];
  customers: Customer[];
  audit: AuditEntry[];
  saleCustomerId: string | null;
  redeemPoints: number;
  view: View;
  invPreset: InventoryPreset;
  payOpen: boolean;
  receipt: Transaction | null;
  toasts: Toast[];
  flashId: string | null;
  flashKey: number;
}

type Action =
  | { type: "LOGIN"; user: User }
  | { type: "LOGOUT" }
  | { type: "GO"; view: View; invPreset?: InventoryPreset }
  | { type: "ADD_CART"; productId: string }
  | { type: "SET_QTY"; productId: string; qty: number }
  | { type: "REMOVE_LINE"; productId: string }
  | { type: "CLEAR_CART" }
  | { type: "HOLD_SALE"; label: string }
  | { type: "RECALL_HELD"; id: string }
  | { type: "DROP_HELD"; id: string }
  | { type: "OPEN_PAY"; open: boolean }
  | { type: "COMPLETE_SALE"; payments: PaymentLeg[]; tendered?: number; discountPct: number; taxExempt: boolean; idChecked: boolean }
  | { type: "OPEN_RECEIPT"; tx: Transaction | null }
  | { type: "ADJUST_BATCH"; productId: string; batch: string; newQty: number; reason: string }
  | { type: "RESTOCK"; productId: string; amount: number; batch: string; expiry: string }
  | { type: "SET_NOTE"; productId: string; note: string }
  | { type: "SET_PRICE"; productId: string; price: number | null }
  | { type: "SET_BATCH_PRICE"; productId: string; batch: string; price: number | null }
  | { type: "ADD_TRANSFER"; productId: string; qty: number; toBranch: string; note?: string }
  | { type: "TRANSFER_STATUS"; id: string; status: TransferStatus }
  | { type: "SET_FIELD"; target: "product" | "customer"; id: string; field: Field }
  | { type: "CLEAR_FIELD"; target: "product" | "customer"; id: string; key: string }
  | { type: "SET_ONLINE"; online: boolean }
  | { type: "SET_SALE_CUSTOMER"; id: string | null }
  | { type: "ADD_CUSTOMER"; name: string; phone: string; email?: string; notes?: string }
  | { type: "SET_REDEEM"; points: number }
  | { type: "VERIFY_RX"; id: string }
  | { type: "COUNT_APPLY"; entries: { productId: string; counted: number }[] }
  | { type: "REMIND_RX"; id: string }
  | { type: "NEW_REFILL"; rxId: string }
  | { type: "RESTORE"; products: Product[]; transactions: Transaction[]; prescriptions: Prescription[]; customers?: Customer[]; audit?: AuditEntry[] }
  | { type: "ADD_PRODUCT"; product: Product }
  | { type: "REFUND_TX"; txId: string; reason: string }
  | { type: "RX_STATUS"; id: string; status: RxStatus }
  | { type: "RX_TO_CART"; id: string }
  | { type: "TOAST"; kind: Toast["kind"]; msg: string }
  | { type: "DISMISS_TOAST"; id: number }
  | { type: "RESET" };

let toastSeq = 1;
let heldSeq = 1;
let auditSeq = 100;

const seed = (): Pick<State, "products" | "transactions" | "prescriptions" | "customers" | "audit" | "transfers"> => {
  const now = Date.now();
  const products = makeProducts(now);
  const customers = makeCustomers(now);
  const transactions = makeTransactions(products, now);
  /* link ~40% of seeded sales to loyalty customers (deterministic) */
  transactions.forEach((t, i) => { if (!t.refundOf && i % 3 === 0) t.customerId = customers[i % customers.length].id; });
  return {
    products, transactions, customers,
    prescriptions: makePrescriptions(now),
    transfers: makeTransfers(now),
    audit: [{ id: auditSeq++, at: now - 36 * 60_000, actor: "system", kind: "system", detail: "Ledger initialized — demo dataset v5" }],
  };
};

const LS_KEY = "counterrx:v5";

function load(): State {
  const base: State = {
    ...seed(), user: null, online: typeof navigator === "undefined" ? true : navigator.onLine,
    cart: [], held: [], saleCustomerId: null, redeemPoints: 0,
    view: "register", invPreset: "all",
    payOpen: false, receipt: null, toasts: [], flashId: null, flashKey: 0,
  };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<State>;
      if (saved.products && saved.transactions && saved.prescriptions && saved.customers) {
        return {
          ...base,
          products: saved.products, transactions: saved.transactions,
          prescriptions: saved.prescriptions, customers: saved.customers,
          transfers: saved.transfers ?? makeTransfers(Date.now()),
          audit: saved.audit ?? [],
        };
      }
    }
  } catch { /* corrupted storage — fall back to seed */ }
  return base;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* Effective unit price: manual override > FEFO lot price > list price (1.4 lot pricing) */
export function unitPrice(state: State, productId: string): number {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return 0;
  const lotPrice = fefoBatches(p)[0]?.price;
  return lotPrice !== undefined ? lotPrice : p.price;
}

export function cartTotals(state: State, discountPct: number, taxExempt = false) {
  const lines: TxLine[] = state.cart.map((c) => {
    const p = state.products.find((x) => x.id === c.productId)!;
    const base = unitPrice(state, p.id);
    const overridden = c.priceOverride !== undefined && c.priceOverride > 0 && c.priceOverride !== base;
    return {
      productId: p.id, name: p.name, form: p.form, qty: c.qty,
      price: overridden ? c.priceOverride! : base,
      rx: p.rx, note: c.note,
      override: overridden || undefined,
      listPrice: overridden ? p.price : base !== p.price ? p.price : undefined,
    };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));
  /* bulk tiers apply per non-Rx line */
  const bulkSavings = round2(lines.reduce((s, l) => s + (l.rx ? 0 : (l.price * l.qty * bulkPct(l.qty)) / 100), 0));
  const discount = round2((subtotal * discountPct) / 100);
  /* loyalty redemption — chunks of 100 pts = $5, capped by the payable balance */
  const payable = Math.max(0, subtotal - bulkSavings - discount);
  const loyaltyDeduct = round2(Math.min((state.redeemPoints / REDEEM_CHUNK_PTS) * REDEEM_CHUNK_VALUE, payable));
  const tax = taxExempt ? 0 : round2((payable - loyaltyDeduct) * TAX_RATE);
  return {
    lines, subtotal, bulkSavings, discount, loyaltyDeduct, tax,
    total: round2(payable - loyaltyDeduct + tax),
  };
}

function withToast(s: State, kind: Toast["kind"], msg: string): State {
  return { ...s, toasts: [...s.toasts.slice(-3), { id: toastSeq++, kind, msg }] };
}

function withAudit(s: State, kind: AuditKind, detail: string): State {
  return { ...s, audit: [{ id: auditSeq++, at: Date.now(), actor: s.user?.name ?? CASHIER, kind, detail }, ...s.audit].slice(0, 250) };
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "LOGIN":
      return withAudit(
        withToast({ ...state, user: a.user }, "success", `Signed in — ${a.user.name} (${a.user.role})`),
        "system", `${a.user.name} signed in · role ${a.user.role} · Terminal 01`);

    case "LOGOUT":
      return withAudit(
        withToast({ ...state, user: null, payOpen: false }, "info", `${state.user?.name ?? "User"} signed out — terminal locked`),
        "system", `${state.user?.name ?? "User"} signed out`);

    case "GO":
      return { ...state, view: a.view, invPreset: a.invPreset ?? state.invPreset, payOpen: false };

    case "ADD_CART": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const avail = stockOf(p);
      if (avail <= 0) return withToast(state, "error", `${p.name} is out of stock`);
      const line = state.cart.find((c) => c.productId === p.id);
      if (line) {
        if (line.qty >= avail) return withToast(state, "warn", `Only ${avail} × ${p.name} on the shelf`);
        return {
          ...state, flashId: p.id, flashKey: state.flashKey + 1,
          cart: state.cart.map((c) => (c.productId === p.id ? { ...c, qty: c.qty + 1 } : c)),
        };
      }
      return {
        ...state, flashId: p.id, flashKey: state.flashKey + 1,
        cart: [...state.cart, { productId: p.id, qty: 1 }],
      };
    }

    case "SET_QTY": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const avail = stockOf(p);
      const qty = Math.min(Math.max(0, a.qty), avail);
      if (a.qty > avail) return withToast(state, "warn", `Only ${avail} in stock`);
      if (qty === 0) return { ...state, cart: state.cart.filter((c) => c.productId !== a.productId) };
      return { ...state, cart: state.cart.map((c) => (c.productId === a.productId ? { ...c, qty } : c)) };
    }

    case "REMOVE_LINE":
      return { ...state, cart: state.cart.filter((c) => c.productId !== a.productId) };

    case "CLEAR_CART":
      return { ...state, cart: [], payOpen: false, redeemPoints: 0 };

    case "HOLD_SALE": {
      if (state.cart.length === 0) return state;
      const h: HeldSale = { id: `H-${heldSeq++}`, label: a.label || `Hold ${state.held.length + 1}`, at: Date.now(), items: state.cart };
      return withToast({ ...state, held: [...state.held, h], cart: [] }, "info", `Sale parked as “${h.label}”`);
    }

    case "RECALL_HELD": {
      const h = state.held.find((x) => x.id === a.id);
      if (!h) return state;
      const heldNow = state.held.filter((x) => x.id !== a.id);
      if (state.cart.length > 0) {
        const auto: HeldSale = { id: `H-${heldSeq++}`, label: "Auto-parked", at: Date.now(), items: state.cart };
        return withToast(
          { ...state, held: [...heldNow, auto], cart: h.items, view: "register" },
          "info", `Recalled “${h.label}” — current cart auto-parked`,
        );
      }
      return withToast({ ...state, held: heldNow, cart: h.items, view: "register" }, "success", `Recalled “${h.label}”`);
    }

    case "DROP_HELD":
      return { ...state, held: state.held.filter((x) => x.id !== a.id) };

    case "OPEN_PAY":
      return { ...state, payOpen: a.open };

    case "COMPLETE_SALE": {
      if (state.cart.length === 0) return state;
      const t = cartTotals(state, a.discountPct, a.taxExempt);
      const customer = state.customers.find((c) => c.id === state.saleCustomerId) ?? null;
      /* DEA controlled substances — require an identified customer and an ID check */
      const controlledLines = t.lines.filter((l) => state.products.find((p) => p.id === l.productId)?.controlled);
      if (controlledLines.length > 0) {
        if (!customer) return withToast(state, "error", "Controlled substance in cart — attach a customer (photo ID required)");
        if (!a.idChecked) return withToast(state, "error", "Confirm the ID check before completing a controlled sale");
      }
      /* guard: every cart line must be coverable by on-hand lots */
      for (const l of t.lines) {
        const p = state.products.find((x) => x.id === l.productId)!;
        if (stockOf(p) < l.qty) return withToast(state, "error", `${p.name} short on stock — only ${stockOf(p)} left`);
      }
      /* consume lots FEFO — earliest expiry leaves the shelf first */
      const products = state.products.map((p) => {
        const line = t.lines.find((l) => l.productId === p.id);
        if (!line) return p;
        const res = allocFEFO(p.batches, line.qty);
        line.alloc = res.alloc.filter((x) => x.qty > 0);
        return { ...p, batches: res.batches };
      });
      const primary = a.payments[0];
      const singleCash = a.payments.length === 1 && primary.method === "cash";
      /* loyalty: earn 1 pt/$1, spend redeemed points */
      const pointsEarned = Math.floor(t.total);
      const customers = customer
        ? state.customers.map((c) => (c.id === customer.id
            ? { ...c, points: Math.max(0, c.points + pointsEarned - state.redeemPoints) }
            : c))
        : state.customers;
      const tx: Transaction = {
        id: `T-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        at: Date.now(), lines: t.lines,
        subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total,
        method: primary.method, cashier: state.user?.name ?? CASHIER,
        taxExempt: a.taxExempt || undefined,
        payments: a.payments.length > 1 ? a.payments : undefined,
        tendered: singleCash ? (a.tendered ?? primary.amount) : undefined,
        change: singleCash ? round2((a.tendered ?? primary.amount) - t.total) : undefined,
        customerId: customer?.id,
        bulkSavings: t.bulkSavings > 0 ? t.bulkSavings : undefined,
        loyaltyDeduct: t.loyaltyDeduct > 0 ? t.loyaltyDeduct : undefined,
        pointsEarned: customer ? pointsEarned : undefined,
        pointsRedeemed: state.redeemPoints > 0 ? state.redeemPoints : undefined,
      };
      const tenderLabel = a.payments.length > 1
        ? `split ${a.payments.map((p) => p.method).join(" + ")}`
        : primary.method;
      const ptsLabel = customer ? ` · +${pointsEarned}${state.redeemPoints ? ` / −${state.redeemPoints} pts` : ""} pts` : "";
      let next: State = {
        ...state, products, customers,
        transactions: [tx, ...state.transactions],
        cart: [], payOpen: false, receipt: tx,
        saleCustomerId: null, redeemPoints: 0,
      };
      next = withAudit(next, "sale", `${tx.id} · $${t.total.toFixed(2)} · ${tenderLabel}${customer ? ` · ${customer.name}` : ""}${a.taxExempt ? " · TAX EXEMPT" : ""}`);
      if (controlledLines.length > 0 && customer) {
        next = withAudit(next, "rx", `⚠ Controlled sale ${tx.id} — ${controlledLines.map((l) => `${l.name} ×${l.qty}`).join(", ")} · ${customer.name} · ID verified ✓`);
      }
      return withToast(next, "success", `Payment captured — ${tx.id} · $${t.total.toFixed(2)} · ${tenderLabel}${ptsLabel}`);
    }

    case "OPEN_RECEIPT":
      return { ...state, receipt: a.tx };

    case "ADJUST_BATCH": {
      const p = state.products.find((x) => x.id === a.productId);
      const b = p?.batches.find((x) => x.batch === a.batch);
      if (!p || !b) return state;
      const newQty = Math.max(0, a.newQty);
      const delta = newQty - b.qty;
      const products = state.products.map((x) => x.id !== p.id ? x : {
        ...x,
        batches: newQty === 0
          ? x.batches.filter((bb) => bb.batch !== a.batch)
          : x.batches.map((bb) => (bb.batch === a.batch ? { ...bb, qty: newQty } : bb)),
      });
      const next = withAudit({ ...state, products }, "stock", `${a.reason} — ${p.name} · ${a.batch} ${delta >= 0 ? "+" : ""}${delta} → ${newQty}`);
      return withToast(next, delta >= 0 ? "success" : "warn",
        `${p.name} · ${a.batch} set to ${newQty} (${delta >= 0 ? "+" : ""}${delta}) — ${a.reason}`);
    }

    case "RESTOCK": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const lot: Batch = { batch: a.batch, expiry: a.expiry, qty: a.amount };
      const products = state.products.map((x) => (x.id === a.productId ? { ...x, batches: [...x.batches, lot] } : x));
      const next = withAudit({ ...state, products }, "stock", `Received +${a.amount} × ${p.name} → lot ${a.batch} (exp ${a.expiry})`);
      return withToast(next, "success", `Received +${a.amount} × ${p.name} → lot ${a.batch} (exp ${a.expiry})`);
    }

    case "SET_NOTE": {
      const note = a.note.trim();
      return {
        ...state,
        cart: state.cart.map((c) => (c.productId === a.productId ? { ...c, note: note || undefined } : c)),
      };
    }

    case "SET_PRICE": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const cart = state.cart.map((c) =>
        c.productId === a.productId ? { ...c, priceOverride: a.price === null ? undefined : round2(a.price) } : c);
      return a.price === null
        ? withToast({ ...state, cart }, "info", `${p.name} back to list price ${money(p.price)}`)
        : withToast(
            withAudit({ ...state, cart }, "money", `Price override — ${p.name} → ${money(round2(a.price))} (list ${money(p.price)})`),
            "success", `${p.name} overridden to ${money(round2(a.price))} (list ${money(p.price)})`);
    }

    case "SET_BATCH_PRICE": {
      const p = state.products.find((x) => x.id === a.productId);
      const b = p?.batches.find((x) => x.batch === a.batch);
      if (!p || !b) return state;
      const products = state.products.map((x) => x.id !== p.id ? x : {
        ...x,
        batches: x.batches.map((bb) => (bb.batch === a.batch ? { ...bb, price: a.price === null ? undefined : round2(a.price) } : bb)),
      });
      const next = withAudit({ ...state, products }, "money",
        `Lot price — ${p.name} · ${a.batch} → ${a.price === null ? `list ${money(p.price)}` : money(round2(a.price))}`);
      return withToast(next, "success",
        a.price === null ? `${a.batch} back to list price` : `Lot ${a.batch} priced at ${money(round2(a.price))} (list ${money(p.price)})`);
    }

    case "ADD_TRANSFER": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const onHand = stockOf(p);
      if (a.qty > onHand) return withToast(state, "error", `Only ${onHand} × ${p.name} on hand`);
      const id = `TR-${312 + state.transfers.length}`;
      const tr: Transfer = { id, productId: p.id, qty: a.qty, toBranch: a.toBranch, status: "requested", createdAt: Date.now(), requestedBy: state.user?.name ?? CASHIER, note: a.note?.trim() || undefined };
      const next = withAudit({ ...state, transfers: [tr, ...state.transfers] }, "stock", `Transfer ${id} requested — ${a.qty} × ${p.name} → ${a.toBranch}`);
      return withToast(next, "success", `${id} requested — ${a.qty} × ${p.name} → ${a.toBranch}`);
    }

    case "TRANSFER_STATUS": {
      const tr = state.transfers.find((x) => x.id === a.id);
      if (!tr) return state;
      const p = state.products.find((x) => x.id === tr.productId);
      let products = state.products;
      /* shipping pulls stock off our shelf via FEFO allocation */
      if (a.status === "shipped" && p) {
        products = state.products.map((x) => (x.id === p.id ? { ...x, batches: allocFEFO(x.batches, tr.qty).batches } : x));
      }
      const transfers = state.transfers.map((x) => (x.id === tr.id ? { ...x, status: a.status } : x));
      const verb = a.status === "approved" ? "approved" : a.status === "shipped" ? "shipped — stock allocated" : a.status === "received" ? "received at destination" : "rejected";
      const next = withAudit({ ...state, transfers, products }, "stock", `Transfer ${tr.id} ${verb} (${tr.qty} × ${p?.name ?? tr.productId})`);
      return withToast(next, a.status === "rejected" ? "warn" : "success", `${tr.id} ${verb}`);
    }

    case "SET_FIELD": {
      if (a.target === "product") {
        const products = state.products.map((x) => {
          if (x.id !== a.id) return x;
          const rest = (x.fields ?? []).filter((f) => f.key !== a.field.key);
          return { ...x, fields: a.field.value.trim() ? [...rest, a.field] : rest };
        });
        return { ...state, products };
      }
      const customers = state.customers.map((x) => {
        if (x.id !== a.id) return x;
        const rest = (x.fields ?? []).filter((f) => f.key !== a.field.key);
        return { ...x, fields: a.field.value.trim() ? [...rest, a.field] : rest };
      });
      return { ...state, customers };
    }

    case "CLEAR_FIELD": {
      if (a.target === "product") {
        const products = state.products.map((x) => x.id === a.id ? { ...x, fields: (x.fields ?? []).filter((f) => f.key !== a.key) } : x);
        return { ...state, products };
      }
      const customers = state.customers.map((x) => x.id === a.id ? { ...x, fields: (x.fields ?? []).filter((f) => f.key !== a.key) } : x);
      return { ...state, customers };
    }

    case "SET_ONLINE":
      if (a.online === state.online) return state;
      return withToast({ ...state, online: a.online }, a.online ? "success" : "warn",
        a.online ? "Back online — local changes will sync" : "Offline — sales keep working, saved locally");

    case "SET_SALE_CUSTOMER":
      return { ...state, saleCustomerId: a.id, redeemPoints: 0 };

    case "ADD_CUSTOMER": {
      const name = a.name.trim();
      const phone = a.phone.trim();
      if (!name || !phone) return state;
      const existing = state.customers.find((c) => c.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""));
      if (existing) {
        return withToast(
          { ...state, saleCustomerId: existing.id, redeemPoints: 0 },
          "info", `${existing.name} already on file — attached to this sale`);
      }
      const id = `C-${String(state.customers.length + 1).padStart(3, "0")}`;
      const c: Customer = { id, name, phone, email: a.email?.trim() || undefined, notes: a.notes?.trim() || undefined, createdAt: Date.now(), points: 0 };
      return withToast(
        withAudit({ ...state, customers: [c, ...state.customers], saleCustomerId: id, redeemPoints: 0 }, "system", `Customer created — ${name} (${id})`),
        "success", `${name} added to the book — earning points from this sale`);
    }

    case "SET_REDEEM":
      return { ...state, redeemPoints: Math.max(0, Math.round(a.points)) };

    case "VERIFY_RX": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      if (!rx?.insurance) return state;
      if (state.user?.role === "cashier") {
        return withToast(state, "error", "Eligibility checks require a pharmacist or manager sign-in");
      }
      /* simulated PBM adjudication — member ids ending in 9 fail eligibility */
      const ok = !/9$/.test(rx.insurance.memberId);
      const status = ok ? "verified" as const : "rejected" as const;
      const prescriptions = state.prescriptions.map((x) =>
        x.id === a.id ? { ...x, insurance: { ...x.insurance!, status } } : x);
      const next = withAudit(
        { ...state, prescriptions }, "rx",
        `${rx.id} claim ${status} — ${rx.insurance.plan} · ${rx.insurance.memberId}`);
      return ok
        ? withToast(next, "success", `${rx.id} · ${rx.insurance.plan} claim verified ✓`)
        : withToast(next, "error", `${rx.id} claim rejected by ${rx.insurance.plan} — check member eligibility`);
    }

    case "COUNT_APPLY": {
      let units = 0, skus = 0;
      const products = state.products.map((p) => {
        const e = a.entries.find((x) => x.productId === p.id);
        if (!e) return p;
        const delta = e.counted - stockOf(p);
        if (delta === 0) return p;
        skus++; units += delta;
        const sorted = fefoBatches(p);
        const first = sorted[0];
        if (!first) {
          return { ...p, batches: [{ batch: newBatchCode(), expiry: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10), qty: e.counted }] };
        }
        const newQty = Math.max(0, first.qty + delta);
        const rest = sorted.slice(1);
        return { ...p, batches: newQty > 0 ? [{ ...first, qty: newQty }, ...rest] : rest };
      });
      if (skus === 0) return withToast(state, "info", "Count sheet clean — no variances");
      const next = withAudit(
        { ...state, products }, "stock",
        `Physical count applied — ${skus} SKUs, ${units >= 0 ? "+" : ""}${units} units variance`);
      return withToast(next, "success", `Count applied — ${skus} variance${skus === 1 ? "" : "s"}, ${units >= 0 ? "+" : ""}${units} units`);
    }

    case "REMIND_RX": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      if (!rx) return state;
      return withToast(
        { ...state, prescriptions: state.prescriptions.map((x) => (x.id === a.id ? { ...x, remindedAt: Date.now() } : x)) },
        "info", `Refill reminder sent to ${rx.patient} (${rx.id})`,
      );
    }

    case "NEW_REFILL": {
      const rx = state.prescriptions.find((x) => x.id === a.rxId);
      if (!rx) return state;
      const nextNum = 2482 + state.prescriptions.filter((x) => x.id.startsWith("RX-")).length;
      const copy: Prescription = {
        id: `RX-${nextNum}`, patient: rx.patient, age: rx.age, productId: rx.productId, qty: rx.qty,
        prescriber: rx.prescriber, status: "new", createdAt: Date.now(),
        daysSupply: rx.daysSupply, note: `Refill of ${rx.id} · ${rx.patient}`,
      };
      return withToast(
        { ...state, prescriptions: [copy, ...state.prescriptions], view: "prescriptions" },
        "success", `Refill ${copy.id} queued for ${rx.patient}`,
      );
    }

    case "RESTORE": {
      const next = withAudit(
        {
          ...state, products: a.products, transactions: a.transactions,
          prescriptions: a.prescriptions, customers: a.customers ?? state.customers,
          audit: a.audit ?? state.audit,
          cart: [], held: [], receipt: null, payOpen: false, saleCustomerId: null, redeemPoints: 0,
        }, "system", `Backup restored — ${a.products.length} products · ${a.transactions.length} receipts`);
      return withToast(next, "success", `Backup restored — ${a.products.length} products · ${a.transactions.length} receipts`);
    }

    case "REFUND_TX": {
      const orig = state.transactions.find((t) => t.id === a.txId);
      if (!orig) return state;
      if (orig.refundOf) return withToast(state, "error", "Refund records can't be refunded");
      if (orig.refundedAt) return withToast(state, "warn", `${orig.id} was already refunded`);
      /* return every unit to its original lot (or the longest-dated lot) */
      const products = state.products.map((p) => {
        const line = orig.lines.find((l) => l.productId === p.id);
        if (!line) return p;
        let batches = [...p.batches];
        const give = (batchCode: string, qty: number) => {
          const idx = batches.findIndex((b) => b.batch === batchCode);
          if (idx >= 0) batches = batches.map((b, i) => (i === idx ? { ...b, qty: b.qty + qty } : b));
          else batches = [...batches, {
            batch: batchCode,
            expiry: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
            qty,
          }];
        };
        if (line.alloc && line.alloc.length > 0) line.alloc.forEach((al) => give(al.batch, al.qty));
        else {
          const latest = [...batches].sort((x, y) => y.expiry.localeCompare(x.expiry))[0];
          give(latest ? latest.batch : `RTN-${orig.id.slice(2)}`, line.qty);
        }
        return { ...p, batches };
      });
      const refund: Transaction = {
        id: `R-${orig.id.slice(2)}`, at: Date.now(), lines: orig.lines,
        subtotal: -orig.subtotal, discount: -orig.discount, tax: -orig.tax, total: -orig.total,
        method: orig.method, cashier: CASHIER, refundOf: orig.id, reason: a.reason,
      };
      const transactions = [refund, ...state.transactions.map((t) => (t.id === orig.id ? { ...t, refundedAt: Date.now() } : t))];
      const next = withAudit({ ...state, products, transactions }, "money",
        `Refund ${refund.id} of ${orig.id} — ${money(-orig.total)} · ${a.reason}`);
      return withToast(next, "success", `${orig.id} refunded — ${money(-orig.total)} returned, stock restored to lots`);
    }

    case "ADD_PRODUCT":
      return withToast(
        withAudit({ ...state, products: [a.product, ...state.products] }, "stock", `New SKU — ${a.product.name} (${a.product.sku})`),
        "success", `${a.product.name} added to catalog`,
      );

    case "RX_STATUS": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      if (!rx) return state;
      const msg =
        a.status === "verifying" ? `${rx.id} moved to pharmacist review` :
        a.status === "ready" ? `${rx.id} ready for pickup` :
        a.status === "dispensed" ? `${rx.id} dispensed — logged` : `${rx.id} reopened`;
      let next: State = {
        ...state,
        prescriptions: state.prescriptions.map((x) => (x.id === a.id
          ? { ...x, status: a.status, dispensedAt: a.status === "dispensed" ? (x.dispensedAt ?? Date.now()) : x.dispensedAt }
          : x)),
      };
      if (a.status === "dispensed") next = withAudit(next, "rx", `${rx.id} dispensed — ${rx.patient} · ${rx.qty} × ${rx.productId}`);
      return withToast(next, "success", msg);
    }

    case "RX_TO_CART": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      const p = rx && state.products.find((x) => x.id === rx.productId);
      if (!rx || !p) return state;
      const avail = stockOf(p);
      if (avail <= 0) return withToast(state, "error", `${p.name} out of stock — cannot attach`);
      const qty = Math.min(rx.qty, avail);
      const existing = state.cart.find((c) => c.productId === p.id);
      const cart = existing
        ? state.cart.map((c) => (c.productId === p.id ? { ...c, qty: Math.min(c.qty + qty, avail) } : c))
        : [...state.cart, { productId: p.id, qty }];
      return withToast(
        { ...state, cart, view: "register", flashId: p.id, flashKey: state.flashKey + 1 },
        "info", `${rx.id} attached to register — ${qty} × ${p.name}`,
      );
    }

    case "TOAST":
      return withToast(state, a.kind, a.msg);

    case "DISMISS_TOAST":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== a.id) };

    case "RESET": {
      localStorage.removeItem(LS_KEY);
      return {
        ...state, ...seed(), cart: [], held: [], receipt: null, payOpen: false,
        saleCustomerId: null, redeemPoints: 0,
      };
    }

    default:
      return state;
  }
}

interface Ctx {
  state: State;
  dispatch: Dispatch<Action>;
  product: (id: string) => Product | undefined;
  lowStock: Product[];
  expiring: Product[];
  newRx: number;
  todayStats: { revenue: number; count: number; avg: number; items: number };
}

const PosCtx = createContext<Ctx | null>(null);

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  /* track connectivity so the UI can show offline state (6.5) */
  useEffect(() => {
    const on = () => dispatch({ type: "SET_ONLINE", online: true });
    const off = () => dispatch({ type: "SET_ONLINE", online: false });
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        products: state.products, transactions: state.transactions.slice(0, 400),
        prescriptions: state.prescriptions, customers: state.customers,
        transfers: state.transfers, audit: state.audit,
      }));
    } catch { /* storage full — ignore */ }
  }, [state.products, state.transactions, state.prescriptions, state.customers, state.transfers, state.audit]);

  const value = useMemo<Ctx>(() => {
    const product = (id: string) => state.products.find((p) => p.id === id);
    const lowStock = state.products.filter((p) => stockOf(p) <= p.reorderLevel);
    const expiring = state.products
      .filter((p) => { const e = nearestExpiry(p); return e !== null && daysUntil(e) <= 60; })
      .sort((a, b) => (nearestExpiry(a) ?? "").localeCompare(nearestExpiry(b) ?? ""));
    const newRx = state.prescriptions.filter((r) => r.status === "new" || r.status === "verifying").length;

    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const today = state.transactions.filter((t) => t.at >= dayStart.getTime());
    /* revenue nets refunds (negative records); counts/units ignore refund records */
    const revenue = round2(today.reduce((s, t) => s + t.total, 0));
    const sales = today.filter((t) => !t.refundOf);
    const items = sales.reduce((s, t) => s + t.lines.reduce((x, l) => x + l.qty, 0), 0);

    return {
      state, dispatch, product, lowStock, expiring, newRx,
      todayStats: { revenue, count: sales.length, avg: sales.length ? round2(revenue / sales.length) : 0, items },
    };
  }, [state]);

  return <PosCtx.Provider value={value}>{children}</PosCtx.Provider>;
}

export function usePos(): Ctx {
  const ctx = useContext(PosCtx);
  if (!ctx) throw new Error("usePos outside provider");
  return ctx;
}

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
