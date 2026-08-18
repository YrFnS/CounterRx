import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type { ReactNode, Dispatch } from "react";
import {
  makeProducts, makePrescriptions, makeTransactions, TAX_RATE, CASHIER,
} from "./data";
import type {
  Product, Transaction, Prescription, HeldSale, TxLine, PayMethod, RxStatus,
} from "./data";

export type View = "register" | "dashboard" | "inventory" | "prescriptions" | "history";
export type InventoryPreset = "all" | "low" | "expiring";

export interface Toast { id: number; kind: "success" | "warn" | "error" | "info"; msg: string; }

interface State {
  products: Product[];
  transactions: Transaction[];
  prescriptions: Prescription[];
  cart: { productId: string; qty: number }[];
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
  | { type: "COMPLETE_SALE"; method: PayMethod; tendered: number; discountPct: number }
  | { type: "OPEN_RECEIPT"; tx: Transaction | null }
  | { type: "ADJUST_STOCK"; productId: string; newQty: number }
  | { type: "RESTOCK"; productId: string; amount: number }
  | { type: "ADD_PRODUCT"; product: Product }
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

const LS_KEY = "counterrx:v2";

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
    return { productId: p.id, name: p.name, form: p.form, qty: c.qty, price: p.price, rx: p.rx };
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
      if (p.stock <= 0) return withToast(state, "error", `${p.name} is out of stock`);
      const line = state.cart.find((c) => c.productId === p.id);
      if (line) {
        if (line.qty >= p.stock) return withToast(state, "warn", `Only ${p.stock} × ${p.name} on the shelf`);
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
      const qty = Math.min(Math.max(0, a.qty), p.stock);
      if (a.qty > p.stock) return withToast(state, "warn", `Only ${p.stock} in stock`);
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
      const tx: Transaction = {
        id: `T-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        at: Date.now(), lines: t.lines,
        subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total,
        method: a.method, cashier: CASHIER,
        tendered: a.method === "cash" ? a.tendered : undefined,
        change: a.method === "cash" ? round2(a.tendered - t.total) : undefined,
      };
      const products = state.products.map((p) => {
        const line = t.lines.find((l) => l.productId === p.id);
        return line ? { ...p, stock: Math.max(0, p.stock - line.qty) } : p;
      });
      return withToast(
        { ...state, products, transactions: [tx, ...state.transactions], cart: [], payOpen: false, receipt: tx },
        "success", `Payment captured — ${tx.id} · $${t.total.toFixed(2)}`,
      );
    }

    case "OPEN_RECEIPT":
      return { ...state, receipt: a.tx };

    case "ADJUST_STOCK": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const products = state.products.map((x) => (x.id === a.productId ? { ...x, stock: Math.max(0, a.newQty) } : x));
      const delta = Math.max(0, a.newQty) - p.stock;
      return withToast({ ...state, products }, delta >= 0 ? "success" : "warn", `${p.name} stock set to ${Math.max(0, a.newQty)} (${delta >= 0 ? "+" : ""}${delta})`);
    }

    case "RESTOCK": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const products = state.products.map((x) => (x.id === a.productId ? { ...x, stock: x.stock + a.amount } : x));
      return withToast({ ...state, products }, "success", `Received +${a.amount} × ${p.name}`);
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
        { ...state, prescriptions: state.prescriptions.map((x) => (x.id === a.id ? { ...x, status: a.status } : x)) },
        "success", msg,
      );
    }

    case "RX_TO_CART": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      const p = rx && state.products.find((x) => x.id === rx.productId);
      if (!rx || !p) return state;
      if (p.stock <= 0) return withToast(state, "error", `${p.name} out of stock — cannot attach`);
      const qty = Math.min(rx.qty, p.stock);
      const existing = state.cart.find((c) => c.productId === p.id);
      const cart = existing
        ? state.cart.map((c) => (c.productId === p.id ? { ...c, qty: Math.min(c.qty + qty, p.stock) } : c))
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
    const lowStock = state.products.filter((p) => p.stock <= p.reorderLevel);
    const expiring = state.products.filter((p) => {
      const d = Math.ceil((new Date(p.expiry + "T00:00:00").getTime() - Date.now()) / 86_400_000);
      return d <= 60;
    }).sort((a, b) => a.expiry.localeCompare(b.expiry));
    const newRx = state.prescriptions.filter((r) => r.status === "new" || r.status === "verifying").length;

    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const today = state.transactions.filter((t) => t.at >= dayStart.getTime());
    const revenue = round2(today.reduce((s, t) => s + t.total, 0));
    const items = today.reduce((s, t) => s + t.lines.reduce((x, l) => x + l.qty, 0), 0);

    return {
      state, dispatch, product, lowStock, expiring, newRx,
      todayStats: { revenue, count: today.length, avg: today.length ? round2(revenue / today.length) : 0, items },
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
