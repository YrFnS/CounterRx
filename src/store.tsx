import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { ReactNode, Dispatch } from "react";
import {
  makeProducts, makePrescriptions, makeTransactions, TAX_RATE, CASHIER,
  stockOf, nearestExpiry, allocFEFO, newBatchCode, daysUntil,
} from "./data";
import type {
  Product, Transaction, Prescription, HeldSale, TxLine, PayMethod, PaymentLeg, RxStatus, Batch,
} from "./data";

export type View = "register" | "dashboard" | "inventory" | "prescriptions" | "history";
export type InventoryPreset = "all" | "low" | "expiring";

export interface Toast { id: number; kind: "success" | "warn" | "error" | "info"; msg: string; }

interface State {
  products: Product[];
  transactions: Transaction[];
  prescriptions: Prescription[];
  cart: { productId: string; qty: number; note?: string; priceOverride?: number }[];
  held: HeldSale[];
  view: View;
  invPreset: InventoryPreset;
  payOpen: boolean;
  receipt: Transaction | null;
  toasts: Toast[];
  flashId: string | null;
  flashKey: number;
}

type Action =
  | { type: "GO"; view: View; invPreset?: InventoryPreset }
  | { type: "ADD_CART"; productId: string }
  | { type: "SET_QTY"; productId: string; qty: number }
  | { type: "REMOVE_LINE"; productId: string }
  | { type: "CLEAR_CART" }
  | { type: "HOLD_SALE"; label: string }
  | { type: "RECALL_HELD"; id: string }
  | { type: "DROP_HELD"; id: string }
  | { type: "OPEN_PAY"; open: boolean }
  | { type: "COMPLETE_SALE"; payments: PaymentLeg[]; tendered?: number; discountPct: number }
  | { type: "OPEN_RECEIPT"; tx: Transaction | null }
  | { type: "ADJUST_BATCH"; productId: string; batch: string; newQty: number; reason: string }
  | { type: "RESTOCK"; productId: string; amount: number; batch: string; expiry: string }
  | { type: "SET_NOTE"; productId: string; note: string }
  | { type: "SET_PRICE"; productId: string; price: number | null }
  | { type: "REMIND_RX"; id: string }
  | { type: "NEW_REFILL"; rxId: string }
  | { type: "RESTORE"; products: Product[]; transactions: Transaction[]; prescriptions: Prescription[] }
  | { type: "ADD_PRODUCT"; product: Product }
  | { type: "REFUND_TX"; txId: string; reason: string }
  | { type: "RX_STATUS"; id: string; status: RxStatus }
  | { type: "RX_TO_CART"; id: string }
  | { type: "TOAST"; kind: Toast["kind"]; msg: string }
  | { type: "DISMISS_TOAST"; id: number }
  | { type: "RESET" };

let toastSeq = 1;
let heldSeq = 1;

const seed = (): Pick<State, "products" | "transactions" | "prescriptions"> => {
  const now = Date.now();
  const products = makeProducts(now);
  return { products, transactions: makeTransactions(products, now), prescriptions: makePrescriptions(now) };
};

const LS_KEY = "counterrx:v3";

function load(): State {
  const base: State = {
    ...seed(), cart: [], held: [], view: "register", invPreset: "all",
    payOpen: false, receipt: null, toasts: [], flashId: null, flashKey: 0,
  };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<State>;
      if (saved.products && saved.transactions && saved.prescriptions) {
        return { ...base, products: saved.products, transactions: saved.transactions, prescriptions: saved.prescriptions };
      }
    }
  } catch { /* corrupted storage — fall back to seed */ }
  return base;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function cartTotals(state: State, discountPct: number) {
  const lines: TxLine[] = state.cart.map((c) => {
    const p = state.products.find((x) => x.id === c.productId)!;
    const overridden = c.priceOverride !== undefined && c.priceOverride > 0 && c.priceOverride !== p.price;
    return {
      productId: p.id, name: p.name, form: p.form, qty: c.qty,
      price: overridden ? c.priceOverride! : p.price,
      rx: p.rx, note: c.note,
      override: overridden || undefined,
      listPrice: overridden ? p.price : undefined,
    };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));
  const discount = round2((subtotal * discountPct) / 100);
  const tax = round2((subtotal - discount) * TAX_RATE);
  return { lines, subtotal, discount, tax, total: round2(subtotal - discount + tax) };
}

function withToast(s: State, kind: Toast["kind"], msg: string): State {
  return { ...s, toasts: [...s.toasts.slice(-3), { id: toastSeq++, kind, msg }] };
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
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
      return { ...state, cart: [], payOpen: false };

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
      const t = cartTotals(state, a.discountPct);
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
      const tx: Transaction = {
        id: `T-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        at: Date.now(), lines: t.lines,
        subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total,
        method: primary.method, cashier: CASHIER,
        payments: a.payments.length > 1 ? a.payments : undefined,
        tendered: singleCash ? (a.tendered ?? primary.amount) : undefined,
        change: singleCash ? round2((a.tendered ?? primary.amount) - t.total) : undefined,
      };
      const tenderLabel = a.payments.length > 1
        ? `split ${a.payments.map((p) => p.method).join(" + ")}`
        : primary.method;
      return withToast(
        { ...state, products, transactions: [tx, ...state.transactions], cart: [], payOpen: false, receipt: tx },
        "success", `Payment captured — ${tx.id} · $${t.total.toFixed(2)} · ${tenderLabel}`,
      );
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
      return withToast(
        { ...state, products }, delta >= 0 ? "success" : "warn",
        `${p.name} · ${a.batch} set to ${newQty} (${delta >= 0 ? "+" : ""}${delta}) — ${a.reason}`,
      );
    }

    case "RESTOCK": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const lot: Batch = { batch: a.batch, expiry: a.expiry, qty: a.amount };
      const products = state.products.map((x) => (x.id === a.productId ? { ...x, batches: [...x.batches, lot] } : x));
      return withToast({ ...state, products }, "success", `Received +${a.amount} × ${p.name} → lot ${a.batch} (exp ${a.expiry})`);
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
        : withToast({ ...state, cart }, "success", `${p.name} overridden to ${money(round2(a.price))} (list ${money(p.price)})`);
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

    case "RESTORE":
      return withToast(
        { ...state, products: a.products, transactions: a.transactions, prescriptions: a.prescriptions, cart: [], held: [], receipt: null, payOpen: false },
        "success", `Backup restored — ${a.products.length} products · ${a.transactions.length} receipts`,
      );

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
      return withToast(
        { ...state, products, transactions },
        "success", `${orig.id} refunded — ${money(-orig.total)} returned, stock restored to lots`,
      );
    }

    case "ADD_PRODUCT":
      return withToast(
        { ...state, products: [a.product, ...state.products] },
        "success", `${a.product.name} added to catalog`,
      );

    case "RX_STATUS": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      if (!rx) return state;
      const msg =
        a.status === "verifying" ? `${rx.id} moved to pharmacist review` :
        a.status === "ready" ? `${rx.id} ready for pickup` :
        a.status === "dispensed" ? `${rx.id} dispensed — logged` : `${rx.id} reopened`;
      return withToast(
        {
          ...state,
          prescriptions: state.prescriptions.map((x) => (x.id === a.id
            ? { ...x, status: a.status, dispensedAt: a.status === "dispensed" ? (x.dispensedAt ?? Date.now()) : x.dispensedAt }
            : x)),
        },
        "success", msg,
      );
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
      return { ...state, ...seed(), cart: [], held: [], receipt: null, payOpen: false };
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

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        products: state.products, transactions: state.transactions.slice(0, 400), prescriptions: state.prescriptions,
      }));
    } catch { /* storage full — ignore */ }
  }, [state.products, state.transactions, state.prescriptions]);

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
