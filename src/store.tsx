import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type { ReactNode, Dispatch } from "react";
import {
  makeProducts, makePrescriptions, makeTransactions, makeCustomers, makeTransfers, makePrescribers,
  makeSuppliers, makePurchaseOrders, makeApInvoices, makeExpenses, invoiceBalance,
  makeDeliveries, makeWebOrders, makeTimeEntries, makeColdChainLogs,
  stockOf, nearestExpiry, allocFEFO, fefoBatches, newBatchCode, daysUntil,
  genericSubstituteFor, substitutionSaving,
  bulkPct, REDEEM_CHUNK_PTS, REDEEM_CHUNK_VALUE, can, tenderTypeOf, applyStoreCredit, pruneExpiredHolds,
  LINE_DISCOUNT_PIN_THRESHOLD, CATEGORIES_FALLBACK, BRANCHES_FALLBACK, outstandingBalance,
  type Category,
  createShift, recordShiftTransaction, recordCashMovement, closeShift, generateXReport, generateZReport,
  deductFromLot, tempInRange,
} from "./data";
import type {
  Product, Transaction, Prescription, Customer, AuditEntry, AuditKind, Staff, Role, OrgSettings,
  HeldSale, TxLine, PayMethod, PaymentLeg, RxStatus, Batch, Transfer, TransferStatus, Field,
  Snapshot, SnapshotMeta, RestrictedLogEntry, Prescriber, BackOrder, BackOrderStatus, RxTransfer,
  Supplier, PurchaseOrder, ApInvoice, ApPayMethod, Expense,
  Delivery, DeliveryStatus, WebOrder, WebOrderStatus, TimeEntry,
  Shift, XReport, ZReport, CashMovement, ShiftTransaction, TxType, TenderType, StoreCredit,
  InteractionPair, ColdChainLog, Coupon, Branch,
} from "./data";
import { makeStaff, makeSettings, makeBackOrders, makeRxTransfers, SNAPS_KEY, hashPin, ROLE_LABEL } from "./data";
import type { BackendData, LoadResult } from "./lib/sync";
import { loadBackendData, persistBackendData, signOutStaff, subscribeToBackend, getSessionStaffId } from "./lib/sync";
import { setRuntimeInteractions } from "./lib/clinical";
import i18n from "./i18n";

export type View = "register" | "dashboard" | "customers" | "inventory" | "finance" | "reports" | "prescriptions" | "deliveries" | "history" | "settings";
export type InventoryPreset = "all" | "low" | "expiring";

export interface Toast { id: number; kind: "success" | "warn" | "error" | "info"; msg: string; }

interface State {
  user: Staff | null;
  /** True only after the current PIN was accepted by Supabase; false keeps the local fallback offline-safe. */
  backendAuthenticated: boolean;
  /** Backend is unavailable; UI should show offline banner and never present seed as live-synced. */
  backendOffline: boolean;
  staff: Staff[];
  settings: OrgSettings;
  lockouts: Record<string, { fails: number; until: number }>;
  restrictedLog: RestrictedLogEntry[];
  online: boolean;
  products: Product[];
  transactions: Transaction[];
  prescriptions: Prescription[];
  prescribers: Prescriber[];
  transfers: Transfer[];
  backorders: BackOrder[];
  rxTransfers: RxTransfer[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  apInvoices: ApInvoice[];
  expenses: Expense[];
  deliveries: Delivery[];
  webOrders: WebOrder[];
  timeEntries: TimeEntry[];
  shifts: Shift[];
  interactionPairs: InteractionPair[];
  coldChainLog: ColdChainLog[];
  coupons: Coupon[];
  categories: Category[];
  branches: Branch[];
  currentShift: Shift | null;
  cart: { productId: string; qty: number; note?: string; priceOverride?: number; daw?: number; substitutedFrom?: string; uom?: string; lineDiscount?: { mode: "amt" | "pct"; value: number }; rxId?: string }[];
  held: HeldSale[];
  storeCredits: StoreCredit[];
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
  snapshotVersion: number;
}

type Action =
  | { type: "LOGIN"; staffId: string; pin?: string }
  | { type: "BACKEND_AUTH"; staffId: string; authenticated: boolean }
  | { type: "LOGOUT"; auto?: boolean }
  | { type: "ADD_STAFF"; name: string; role: Role; pin: string }
  | { type: "UPDATE_STAFF"; id: string; patch: Partial<Pick<Staff, "name" | "role" | "active">> }
  | { type: "SET_STAFF_PIN"; id: string; pin: string }
  | { type: "ADD_PRESCRIBER"; prescriber: Omit<Prescriber, "id"> }
  | { type: "PRESCRIBER_SAVE"; prescriber: Prescriber }
  | { type: "PRESCRIBER_DELETE"; id: string }
  | { type: "FLAG_RECALL"; productId: string; batch: string; flagged: boolean }
  | { type: "RTV"; productId: string; batch: string; qty: number; reason: string }
  | { type: "WRITE_OFF"; productId: string; batch: string; reason: string; approvedBy?: string }
  | { type: "COLD_CHAIN_LOG"; productId: string; tempC: number; note?: string }
  | { type: "TOGGLE_RESTRICTED"; productId: string; restricted: { limitPerSale: number } | undefined }
  | { type: "UPDATE_SETTINGS"; patch: Partial<Omit<OrgSettings, "loyalty">> & { loyalty?: Partial<OrgSettings["loyalty"]> } }
  | { type: "SNAPSHOT_SAVE"; label: string; auto: boolean }
  | { type: "SNAPSHOT_DELETE"; id: string }
  | { type: "SNAPSHOT_RESTORE"; id: string }
  | { type: "GO"; view: View; invPreset?: InventoryPreset }
  | { type: "ADD_CART"; productId: string; daw?: number; substitutedFrom?: string; uom?: string }
  | { type: "NOTIFY_RX"; id: string }
  | { type: "SAVE_UOMS"; productId: string; uoms: import("./data").Uom[] }
  | { type: "SET_LINE_UOM"; productId: string; uom?: string }
  | { type: "ADD_VARIANT"; parentId: string; name: string; price: number; cost: number; stock: number }
  | { type: "SAVE_KIT"; productId: string; name: string; price: number; components: { productId: string; qty: number }[] }
  | { type: "PA_SUBMIT"; id: string }
  | { type: "PA_CHECK"; id: string }
  | { type: "PA_RESUBMIT"; id: string }
  | { type: "CREATE_BACKORDER"; patient: string; phone?: string; productId: string; qty: number }
  | { type: "BACKORDER_STATUS"; id: string; to: BackOrderStatus }
  | { type: "CUSTOMER_ALLERGIES"; id: string; allergies: string[] }
  | { type: "COMPOUND"; name: string; ingredients: { productId: string; qty: number }[]; fee: number; price: number }
  | { type: "NEW_PRESCRIPTION"; intake: {
      patient: string; age: number; phone?: string; productId: string; qty: number;
      prescriberId: string; daysSupply?: number; refillsAuthorized?: number;
      rxExpiry?: string; note?: string; insurancePlan?: string; memberId?: string;
    } }
  | { type: "SCAN_ATTACH"; id: string; dataUrl: string }
  | { type: "SCAN_REMOVE"; id: string }
  | { type: "TRANSFER_RX_OUT"; prescriptionId: string; otherPharmacy: string; otherPhone: string; refillsRemaining: number; note?: string }
  | { type: "TRANSFER_RX_IN"; patient: string; phone?: string; productId: string; qty: number; otherPharmacy: string; otherPhone: string; prescriberId: string; refillsRemaining: number }
  | { type: "SET_QTY"; productId: string; qty: number; uom?: string }
  | { type: "REMOVE_LINE"; productId: string; uom?: string }
  | { type: "CLEAR_CART" }
  | { type: "HOLD_SALE"; label: string; expiresAt?: number }
  | { type: "RECALL_HELD"; id: string }
  | { type: "DROP_HELD"; id: string }
  | { type: "ISSUE_STORE_CREDIT"; credit: StoreCredit }
  | { type: "REDEEM_STORE_CREDIT"; id: string; amount: number }
  | { type: "SAVE_COUPON"; coupon: Coupon }
  | { type: "DELETE_COUPON"; id: string }
  | { type: "SAVE_CATEGORY"; category: Category }
  | { type: "DELETE_CATEGORY"; id: string }
  | { type: "SUPPLIER_SAVE"; supplier: Supplier }
  | { type: "SUPPLIER_DELETE"; id: string }
  | { type: "EXPIRE_HELDS" }
  | { type: "OPEN_PAY"; open: boolean }
  | { type: "COMPLETE_SALE"; payments: PaymentLeg[]; tendered?: number; discountPct: number; taxExempt: boolean; idChecked: boolean; restricted?: { purchaser: string; idType: string; idLast4: string }; couponDiscount?: number; invoiceDiscountAmt?: number; approvedBy?: string }
  | { type: "SETTLE_PAY_LATER"; transactionId: string; legIndex: number; method: PayMethod; ref?: string }
  | { type: "OPEN_RECEIPT"; tx: Transaction | null }
  | { type: "ADJUST_BATCH"; productId: string; batch: string; newQty: number; reason: string }
  | { type: "RESTOCK"; productId: string; amount: number; batch: string; expiry: string; cost?: number }
  | { type: "SET_NOTE"; productId: string; note: string }
  | { type: "SET_PRICE"; productId: string; price: number | null }
  | { type: "SET_LINE_DISCOUNT"; productId: string; uom?: string; discount?: { mode: "amt" | "pct"; value: number }; approvedBy?: string }
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
  | { type: "SET_REORDER_LEVEL"; productId: string; reorderLevel: number }
  | { type: "REFUND_TX"; txId: string; reason: string }
  | { type: "RX_STATUS"; id: string; status: RxStatus }
  | { type: "RX_TO_CART"; id: string }
  | { type: "CHARGE_RX_PICKUP"; rxId: string }
  | { type: "SUBSTITUTE_GENERIC"; brandId: string; genericId: string; uom?: string }
  | { type: "SET_DAW"; productId: string; daw: number; uom?: string }
  | { type: "TOAST"; kind: Toast["kind"]; msg: string }
  | { type: "AUDIT_LOG"; kind: AuditKind; detail: string }
  | { type: "DISMISS_TOAST"; id: number }
  | { type: "PO_CREATE"; supplierId: string; lines: { productId: string; qty: number; unitCost: number }[]; note?: string }
  | { type: "PO_RECEIVE"; poId: string; receipts: { productId: string; qty: number; expiry: string }[] }
  | { type: "PO_CANCEL"; poId: string }
  | { type: "AP_PAY"; invoiceId: string; amount: number; method: ApPayMethod; ref?: string }
  | { type: "AP_CREDIT"; invoiceId: string; amount: number; note: string }
  | { type: "EXPENSE_ADD"; category: string; amount: number; date: number; payee: string; note?: string; recurring?: boolean }
  | { type: "EXPENSE_DELETE"; id: string }
  | { type: "DELIVERY_STATUS"; id: string; to: DeliveryStatus; driver?: string; proof?: string }
  | { type: "WEB_ORDER"; id: string; to: WebOrderStatus; reason?: string }
  | { type: "WEB_CONVERT"; id: string }
  | { type: "CLOCK" }
  | { type: "CUSTOMER_PROFILE"; id: string; patch: Partial<Pick<Customer, "dob" | "gender" | "address" | "bloodType" | "primaryPrescriberId" | "insurancePlan" | "clinicalNotes">> }
  | { type: "SHIFT_OPEN"; terminalId: string; openingBalance: number }
  | { type: "SHIFT_CLOSE"; countedCash: number; notes?: string }
  | { type: "SHIFT_CASH_MOVEMENT"; movementType: "paid_in" | "paid_out"; amount: number; reason: string; approvedBy?: string }
  | { type: "VOID_TX"; txId: string; reason: string; approvedBy?: string }
  | { type: "GENERATE_X_REPORT"; shiftId: string }
  | { type: "GENERATE_Z_REPORT"; shiftId: string }
  | { type: "HYDRATE_BACKEND"; data: BackendData }
  | { type: "BACKEND_OFFLINE" };

let toastSeq = 1;
let heldSeq = 1;
let auditSeq = 100;

export const seed = (): Pick<State, "products" | "transactions" | "prescriptions" | "prescribers" | "customers" | "audit" | "transfers" | "backorders" | "rxTransfers" | "suppliers" | "purchaseOrders" | "apInvoices" | "expenses" | "deliveries" | "webOrders" | "timeEntries" | "staff" | "settings" | "shifts" | "storeCredits" | "interactionPairs" | "coldChainLog" | "coupons" | "categories" | "branches"> => {
  const now = Date.now();
  const products = makeProducts(now);
  const customers = makeCustomers(now);
  const transactions = makeTransactions(products, now);
  /* link ~40% of seeded sales to loyalty customers (deterministic) */
  transactions.forEach((t, i) => { if (!t.refundOf && i % 3 === 0) t.customerId = customers[i % customers.length].id; });
  return {
    products, transactions, customers,
    prescriptions: makePrescriptions(now),
    prescribers: makePrescribers(),
    transfers: makeTransfers(now),
    backorders: makeBackOrders(now),
    rxTransfers: makeRxTransfers(now),
    suppliers: makeSuppliers(),
    purchaseOrders: makePurchaseOrders(now),
    apInvoices: makeApInvoices(now),
    expenses: makeExpenses(now),
    deliveries: makeDeliveries(now),
    webOrders: makeWebOrders(now),
    timeEntries: makeTimeEntries(now),
    coldChainLog: makeColdChainLogs(now),
    shifts: [],
    interactionPairs: [],
    coupons: [],
    categories: CATEGORIES_FALLBACK,
    branches: BRANCHES_FALLBACK,
    staff: makeStaff(now),
    settings: makeSettings(),
    storeCredits: [],
    audit: [],
  };
};

const LS_KEY = "counterrx:v10";

function load(): State {
  const base: State = {
    ...seed(), categories: CATEGORIES_FALLBACK, user: null, backendAuthenticated: false, backendOffline: false, lockouts: {}, restrictedLog: [], online: typeof navigator === "undefined" ? true : navigator.onLine,
    cart: [], held: [], saleCustomerId: null, redeemPoints: 0, currentShift: null,
    view: "register", invPreset: "all",
    payOpen: false, receipt: null, toasts: [], flashId: null, flashKey: 0, snapshotVersion: 0,
    storeCredits: [],
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
          prescribers: saved.prescribers ?? makePrescribers(),
          transfers: saved.transfers ?? makeTransfers(Date.now()),
          backorders: saved.backorders ?? makeBackOrders(Date.now()),
          rxTransfers: saved.rxTransfers ?? makeRxTransfers(Date.now()),
          suppliers: saved.suppliers ?? makeSuppliers(),
          purchaseOrders: saved.purchaseOrders ?? makePurchaseOrders(Date.now()),
          apInvoices: saved.apInvoices ?? makeApInvoices(Date.now()),
          expenses: saved.expenses ?? makeExpenses(Date.now()),
          deliveries: saved.deliveries ?? makeDeliveries(Date.now()),
          webOrders: saved.webOrders ?? makeWebOrders(Date.now()),
          timeEntries: saved.timeEntries ?? makeTimeEntries(Date.now()),
          staff: saved.staff ?? makeStaff(Date.now()),
          settings: { ...makeSettings(), ...(saved.settings ?? {}) },
          restrictedLog: saved.restrictedLog ?? [],
          audit: saved.audit ?? [],
          shifts: saved.shifts ?? [],
          storeCredits: saved.storeCredits ?? [],
          interactionPairs: saved.interactionPairs ?? [],
          coldChainLog: saved.coldChainLog ?? [],
          coupons: saved.coupons ?? [],
          categories: saved.categories ?? CATEGORIES_FALLBACK,
          branches: saved.branches ?? BRANCHES_FALLBACK,
        };
      }
    }
  } catch { /* corrupted storage — fall back to seed */ }
  base.held = pruneExpiredHolds(base.held);
  return base;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* Effective unit price: manual override > UOM price > FEFO lot price > list price (§5 + 1.4) */
export function unitPrice(state: State, productId: string, uomCode?: string): number {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return 0;
  if (uomCode) {
    const uom = p.uoms?.find((u) => u.code === uomCode);
    if (uom) return uom.price;                 // UOM's own price wins
    return p.price;                            // unknown code — fall back to base
  }
  const lotPrice = fefoBatches(p)[0]?.price;
  return lotPrice !== undefined ? lotPrice : p.price;
}

/* Base-unit multiplier for a cart line (UOM factor, else 1) (§5) */
export function uomFactor(state: State, productId: string, uomCode?: string): number {
  const p = state.products.find((x) => x.id === productId);
  return p?.uoms?.find((u) => u.code === uomCode)?.factor ?? 1;
}

export function cartTotals(state: State, discountPct: number, taxExempt = false, couponDiscount = 0, invoiceDiscountAmt = 0) {
  const lines: TxLine[] = state.cart.map((c) => {
    const p = state.products.find((x) => x.id === c.productId)!;
    const base = unitPrice(state, p.id, c.uom);           // UOM-aware effective price (§5)
    const factor = uomFactor(state, p.id, c.uom);
    const uomLabel = p.uoms?.find((u) => u.code === c.uom)?.label;
    const overridden = c.priceOverride !== undefined && c.priceOverride > 0 && c.priceOverride !== base;
    const kitSummary = p.kit && p.kit.length > 0
      ? p.kit.map((k) => `${k.qty}× ${state.products.find((x) => x.id === k.productId)?.name ?? k.productId}`).join(" + ")
      : undefined;
    return {
      productId: p.id, name: p.name, form: p.form, qty: c.qty,
      price: overridden ? c.priceOverride! : base,
      rx: p.rx, note: c.note,
      override: overridden || undefined,
      listPrice: overridden ? p.price : base !== p.price ? p.price : undefined,
      daw: c.daw,
      substituted: c.substitutedFrom ? state.products.find((x) => x.id === c.substitutedFrom)?.name : undefined,
      ndc: p.ndc,
      uom: uomLabel, uomFactor: factor > 1 ? factor : undefined, kitComponents: kitSummary,
      lineDiscount: c.lineDiscount,
    };
  });
  const grossTotal = (l: TxLine) => l.price * l.qty;
  const lineDiscountOf = (l: TxLine): number => {
    if (!l.lineDiscount || l.lineDiscount.value <= 0) return 0;
    return l.lineDiscount.mode === "pct"
      ? round2((grossTotal(l) * Math.min(100, l.lineDiscount.value)) / 100)
      : round2(Math.min(l.lineDiscount.value, grossTotal(l)));
  };
  const subtotal = round2(lines.reduce((s, l) => s + grossTotal(l), 0));
  const lineDiscounts = round2(lines.reduce((s, l) => s + lineDiscountOf(l), 0));
  /* bulk tiers apply per non-Rx line */
  const bulkSavings = round2(lines.reduce((s, l) => s + (l.rx ? 0 : ((grossTotal(l) - lineDiscountOf(l)) * bulkPct(l.qty)) / 100), 0));
  const discountBase = Math.max(0, subtotal - lineDiscounts);
  const discount = round2((discountBase * discountPct) / 100);
  const invoiceAmt = round2(Math.max(0, Math.min(invoiceDiscountAmt, discountBase - discount)));
  const totalInvoiceDiscount = round2(discount + invoiceAmt);
  const coupon = round2(Math.max(0, couponDiscount));
  /* loyalty redemption — org-configurable chunks (§7), capped by the payable balance */
  const loy = state.settings.loyalty;
  const payable = round2(Math.max(0, subtotal - lineDiscounts - totalInvoiceDiscount - coupon));
  const loyaltyDeduct = round2(Math.min((state.redeemPoints / Math.max(1, loy.chunkPts)) * loy.chunkValue, payable));
  /* tax removed per product decision — field kept so persisted rows stay shape-stable */
  const tax = 0;
  return {
    lines, subtotal, bulkSavings, discount: totalInvoiceDiscount, lineDiscounts, invoiceAmt, coupon, loyaltyDeduct, tax,
    total: round2(payable - loyaltyDeduct + tax),
  };
}

function withToast(s: State, kind: Toast["kind"], msg: string): State {
  return { ...s, toasts: [...s.toasts.slice(-3), { id: toastSeq++, kind, msg }] };
}

function withAudit(s: State, kind: AuditKind, detail: string): State {
  // actor comes from the session staff (F9); the DB trigger stamps it server-side,
  // so a client-supplied value can never falsify it. Never mint an id that already
  // exists in the (hydrated) ledger either: auditSeq resets per session, and a
  // duplicate id inside one upsert batch makes Postgres fail with 21000.
  const nextId = Math.max(auditSeq, (s.audit[0]?.id ?? 0) + 1);
  auditSeq = nextId + 1;
  return { ...s, audit: [{ id: nextId, at: Date.now(), actor: s.user?.name ?? "", kind, detail }, ...s.audit].slice(0, 250) };
}

/* ---------------- snapshot persistence (§9 automated backups) ---------------- */
export function listSnapshots(): Snapshot[] {
  try { return JSON.parse(localStorage.getItem(SNAPS_KEY) ?? "[]") as Snapshot[]; } catch { return []; }
}
function writeSnapshots(snaps: Snapshot[]) {
  try { localStorage.setItem(SNAPS_KEY, JSON.stringify(snaps.slice(0, 8))); } catch { /* full — drop oldest and retry once */
    try { localStorage.setItem(SNAPS_KEY, JSON.stringify(snaps.slice(0, 4))); } catch { /* give up */ }
  }
}

const LOCK_AFTER = 5;          // failed attempts before lockout
const LOCK_MS = 60_000;        // 60s lockout window

export function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "LOGIN": {
      const s = state.staff.find((x) => x.id === a.staffId);
      if (!s || !s.active) return state;
      const lock = state.lockouts[s.id];
      // pin === undefined → email/password flow: credentials were already verified
      // (Supabase auth or the offline seed-password table), skip the local PIN check.
      if (a.pin !== undefined && lock && lock.until > Date.now()) return state; // still locked
      if (a.pin !== undefined && s.pinHash !== hashPin(a.pin)) {
        const fails = (lock && lock.until <= Date.now() ? 0 : lock?.fails ?? 0) + 1;
        const lockouts = { ...state.lockouts, [s.id]: { fails, until: fails >= LOCK_AFTER ? Date.now() + LOCK_MS : 0 } };
        return { ...state, lockouts };
      }
      const lockouts = { ...state.lockouts };
      delete lockouts[s.id];
      return withAudit(
        withToast({ ...state, user: s, backendAuthenticated: false, lockouts }, "success", i18n.t("toast.signedIn", { name: s.name, role: ROLE_LABEL[s.role] })),
        "system", `${s.name} signed in · role ${s.role} · ${state.settings.terminalId}`);
    }

    case "BACKEND_AUTH":
      return state.user?.id === a.staffId
        ? { ...state, backendAuthenticated: a.authenticated }
        : state;

    case "LOGOUT":
      return withAudit(
        withToast({
          ...state, user: null, backendAuthenticated: false, payOpen: false,
          cart: [], held: [], currentShift: null, saleCustomerId: null, redeemPoints: 0,
          receipt: null, view: "register",
        }, "info",
          a.auto ? "Terminal locked after inactivity" : `${state.user?.name ?? "User"} signed out — terminal locked`),
        "system", `${state.user?.name ?? "User"} ${a.auto ? "auto-locked (idle)" : "signed out"}`);

    case "ADD_STAFF": {
      const id = `S-${String(state.staff.length + 1).padStart(3, "0")}`;
      const s: Staff = {
        id, name: a.name.trim(), role: a.role, pinHash: hashPin(a.pin),
        initials: a.name.trim().replace(/,.*$/, "").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(),
        active: true, createdAt: Date.now(),
      };
      return withAudit(
        withToast({ ...state, staff: [s, ...state.staff] }, "success", i18n.t("toast.staffAdded", { name: s.name, role: ROLE_LABEL[a.role] })),
        "system", `Staff created — ${s.name} (${id}, ${a.role})`);
    }

    case "UPDATE_STAFF": {
      const prev = state.staff.find((x) => x.id === a.id);
      if (!prev) return state;
      const staff = state.staff.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x));
      const user = state.user?.id === a.id ? { ...state.user, ...a.patch } : state.user;
      const what = a.patch.active === false ? "deactivated" : a.patch.active === true ? "reactivated" : "updated";
      return withAudit(
        withToast({ ...state, staff, user }, "success", `${prev.name} ${what}`),
        "system", `Staff ${what} — ${prev.name}${a.patch.role && a.patch.role !== prev.role ? ` → ${a.patch.role}` : ""}`);
    }

    case "SET_STAFF_PIN": {
      const staff = state.staff.map((x) => (x.id === a.id ? { ...x, pinHash: hashPin(a.pin) } : x));
      const lockouts = { ...state.lockouts }; delete lockouts[a.id];
      return withAudit(
        withToast({ ...state, staff, lockouts }, "success", i18n.t("toast.pinReset")),
        "system", `PIN reset for ${state.staff.find((x) => x.id === a.id)?.name ?? a.id}`);
    }

    case "ADD_PRESCRIBER": {
      const id = `DR-${String(state.prescribers.length + 1).padStart(2, "0")}`;
      const pr: Prescriber = { ...a.prescriber, id };
      return withAudit(
        withToast({ ...state, prescribers: [...state.prescribers, pr] }, "success", i18n.t("toast.prescriberAdded", { name: pr.name })),
        "rx", `Prescriber added — ${pr.name} · NPI ${pr.npi}`);
    }

    /* Prescriber directory (W1.3) — admin/pharmacist CRUD with delete reference guard.
       Archived prescribers stay resolvable for Rx history. */
    case "PRESCRIBER_SAVE": {
      if (!can(state.user?.role, "manage_settings") && state.user?.role !== "pharmacist") {
        return withToast(state, "error", "Pharmacist or admin required to manage prescribers");
      }
      const exists = state.prescribers.findIndex((p) => p.id === a.prescriber.id);
      const prescriber: Prescriber = (!a.prescriber.id && exists < 0)
        ? { ...a.prescriber, id: `DR-${String(state.prescribers.length + 1).padStart(2, "0")}` }
        : a.prescriber;
      const prescribers = exists >= 0
        ? state.prescribers.map((p) => (p.id === a.prescriber.id ? prescriber : p))
        : [...state.prescribers, prescriber];
      return withToast(withAudit({ ...state, prescribers }, "rx",
        exists >= 0 ? `Prescriber ${prescriber.name} updated` : `Prescriber ${prescriber.name} created`),
        "success", exists >= 0 ? i18n.t("prescribers.updated", { name: prescriber.name }) : i18n.t("prescribers.created", { name: prescriber.name }));
    }

    case "PRESCRIBER_DELETE": {
      if (!can(state.user?.role, "manage_settings") && state.user?.role !== "pharmacist") {
        return withToast(state, "error", "Pharmacist or admin required to manage prescribers");
      }
      const pr = state.prescribers.find((p) => p.id === a.id);
      if (!pr) return state;
      const referenced = state.prescriptions.some((rx) => rx.prescriberId === a.id);
      if (referenced) return withToast(state, "error", i18n.t("prescribers.deleteBlocked"));
      const prescribers = state.prescribers.filter((p) => p.id !== a.id);
      return withToast(withAudit({ ...state, prescribers }, "rx", `Prescriber ${pr.name} deleted`),
        "success", i18n.t("prescribers.deleted", { name: pr.name }));
    }

    case "FLAG_RECALL": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const lot = p.batches.find((b) => b.batch === a.batch);
      if (!lot) return state;
      const products = state.products.map((x) => x.id === p.id
        ? { ...x, batches: x.batches.map((b) => (b.batch === a.batch ? { ...b, recalled: a.flagged || undefined } : b)) }
        : x);
      const next = withAudit(
        { ...state, products }, "rx",
        a.flagged
          ? `⚠ RECALL — lot ${a.batch} of ${p.name} flagged · quarantine & trace patients`
          : `Recall flag cleared on lot ${a.batch} of ${p.name}`);
      return withToast(next, a.flagged ? "warn" : "success",
        a.flagged ? `Lot ${a.batch} flagged for recall — trace affected patients` : `Recall flag cleared on ${a.batch}`);
    }

    case "TOGGLE_RESTRICTED": {
      const products = state.products.map((p) => p.id === a.productId ? { ...p, restricted: a.restricted } : p);
      return withAudit({ ...state, products }, "system",
        a.restricted ? `Restricted OTC flag set on ${state.products.find((p) => p.id === a.productId)?.name ?? a.productId} (limit ${a.restricted.limitPerSale}/sale)`
          : `Restricted OTC flag cleared`);
    }

    /* -------- supply chain depth (§5) -------- */

    case "SAVE_UOMS": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const products = state.products.map((x) => (x.id === p.id ? { ...x, uoms: a.uoms } : x));
      const label = a.uoms.length
        ? a.uoms.map((u) => `${u.label} (×${u.factor} @ ${money(u.price)})`).join(" · ")
        : "none — base unit only";
      return withToast(
        withAudit({ ...state, products }, "stock", `UOM packs updated — ${p.name}: ${label}`),
        "success", `${p.name} — ${a.uoms.length} unit${a.uoms.length === 1 ? "" : "s"} of measure saved`);
    }

    /* Return-to-vendor: pull units off a lot, book an AP credit against the supplier (§5) */
    case "RTV": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const lot = p.batches.find((b) => b.batch === a.batch);
      if (!lot || a.qty <= 0 || a.qty > lot.qty) return state;
      const reason = a.reason.trim();
      if (reason.length < 3) return state;
      const products = state.products.map((x) =>
        x.id === p.id ? { ...x, batches: deductFromLot(x.batches, a.batch, a.qty) } : x);
      const value = round2(a.qty * (lot.cost ?? p.cost));
      const sup = state.suppliers.find((s) => s.name === p.supplier);
      let apInvoices = state.apInvoices;
      let creditLabel = `${p.supplier} (no open invoice — logged for next invoice)`;
      if (sup) {
        const open = state.apInvoices.find((inv) => inv.supplierId === sup.id && invoiceBalance(inv) > 0);
        if (open) {
          apInvoices = state.apInvoices.map((inv) =>
            inv.id === open.id
              ? { ...inv, credits: [...inv.credits, { at: Date.now(), amount: value, note: `RTV ${a.qty}× ${p.name} (lot ${a.batch}) — ${reason}` }] }
              : inv);
          creditLabel = `credit ${money(value)} on ${open.number}`;
        }
      }
      const next = withAudit({ ...state, products, apInvoices }, "stock",
        `RTV — ${a.qty}× ${p.name} lot ${a.batch} returned to ${p.supplier} · ${creditLabel} · ${reason}`);
      return withToast(next, "success", `RTV booked — ${money(value)} credit against ${p.supplier}`);
    }

    /* Expiry / damaged write-off — manager approval + mandatory reason (mirrors Phase A voids) */
    case "WRITE_OFF": {
      if (!can(state.user?.role, "apply_count")) {
        return withToast(state, "error", "Write-offs require a manager or admin approval");
      }
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const lot = p.batches.find((b) => b.batch === a.batch);
      if (!lot || lot.qty <= 0) return state;
      const reason = a.reason.trim();
      if (reason.length < 3) return state;
      const products = state.products.map((x) =>
        x.id === p.id ? { ...x, batches: x.batches.filter((b) => b.batch !== a.batch) } : x);
      const value = round2(lot.qty * (lot.cost ?? p.cost));
      const next = withAudit({ ...state, products }, "stock",
        `⚠ WRITE-OFF — ${p.name} · lot ${a.batch} ×${lot.qty} (${money(value)} at cost) · ${reason}${a.approvedBy ? ` · approved by ${a.approvedBy}` : ` · ${state.user?.name ?? ""}`}`);
      return withToast(next, "warn", `Wrote off ${lot.qty} × ${p.name} — lot ${a.batch} removed from shelf`);
    }

    /* Cold-chain temperature reading — appended to the compliance log (§5) */
    case "COLD_CHAIN_LOG": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p || !Number.isFinite(a.tempC)) return state;
      const entry: ColdChainLog = {
        id: `CCL-${Date.now().toString(36)}`, productId: p.id, tempC: round2(a.tempC),
        inRange: tempInRange(a.tempC), staff: state.user?.name ?? "Staff", note: a.note?.trim() || undefined,
        at: Date.now(),
      };
      const next = withAudit({ ...state, coldChainLog: [entry, ...state.coldChainLog] }, "stock",
        `Cold-chain temp ${entry.tempC}°C ${entry.inRange ? "✓" : "⚠ OUT OF RANGE"} — ${p.name}${entry.note ? ` · ${entry.note}` : ""}`);
      return withToast(next, entry.inRange ? "success" : "warn",
        `${p.name} logged at ${entry.tempC}°C — ${entry.inRange ? "in range (2–8°C)" : "OUT OF RANGE — quarantine & re-verify"}`);
    }

    case "UPDATE_SETTINGS": {
      const settings = { ...state.settings, ...a.patch, loyalty: { ...state.settings.loyalty, ...(a.patch.loyalty ?? {}) } };
      return withAudit({ ...state, settings }, "system", "Organization settings updated");
    }

    case "SNAPSHOT_SAVE": {
      const meta: SnapshotMeta = {
        id: `snap-${Date.now().toString(36)}`, at: Date.now(), label: a.label, auto: a.auto,
      };
      const data = {
        products: state.products, transactions: state.transactions.slice(0, 400),
        prescriptions: state.prescriptions, customers: state.customers,
        transfers: state.transfers, audit: state.audit, staff: state.staff, settings: state.settings,
      };
      writeSnapshots([{ meta, data }, ...listSnapshots()]);
      return withToast({ ...state, snapshotVersion: state.snapshotVersion + 1 }, "success", i18n.t("toast.snapshotSaved", { label: a.label }));
    }

    case "SNAPSHOT_DELETE": {
      writeSnapshots(listSnapshots().filter((s) => s.meta.id !== a.id));
      return withToast({ ...state, snapshotVersion: state.snapshotVersion + 1 }, "info", i18n.t("toast.snapshotDeleted"));
    }

    case "SNAPSHOT_RESTORE": {
      const snap = listSnapshots().find((s) => s.meta.id === a.id);
      if (!snap) return withToast(state, "error", i18n.t("toast.snapshotNotFound"));
      const d = snap.data as Partial<State>;
      return withToast(
        withAudit({
          ...state,
          products: d.products ?? state.products, transactions: d.transactions ?? state.transactions,
          prescriptions: d.prescriptions ?? state.prescriptions, customers: d.customers ?? state.customers,
          transfers: d.transfers ?? state.transfers, staff: d.staff ?? state.staff,
          settings: { ...makeSettings(), ...(d.settings ?? {}) }, audit: d.audit ?? state.audit,
          cart: [], held: [], receipt: null, payOpen: false, saleCustomerId: null, redeemPoints: 0,
        }, "system", `Snapshot restored — ${snap.meta.label}`),
        "success", `Restored from “${snap.meta.label}” (${new Date(snap.meta.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`);
    }

    case "GO":
      return { ...state, view: a.view, invPreset: a.invPreset ?? state.invPreset, payOpen: false };

    case "ADD_CART": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const avail = stockOf(p, state.products);              // kit-aware on-hand (§5)
      if (avail <= 0) return withToast(state, "error", i18n.t("toast.outOfStock", { name: p.name }));
      const factor = uomFactor(state, p.id, a.uom);
      const maxUom = Math.max(1, Math.floor(avail / factor));  // sellable count in this UOM
      const uomLabel = p.uoms?.find((u) => u.code === a.uom)?.label;
      const same = (c: { productId: string; uom?: string }) => c.productId === p.id && (c.uom ?? "") === (a.uom ?? "");
      const line = state.cart.find(same);
      if (line) {
        if (line.qty >= maxUom) return withToast(state, "warn", i18n.t("toast.lowUnits", { avail, name: p.name }));
        return {
          ...state, flashId: p.id, flashKey: state.flashKey + 1,
          cart: state.cart.map((c) => (same(c) ? { ...c, qty: c.qty + 1 } : c)),
        };
      }
      return {
        ...state, flashId: p.id, flashKey: state.flashKey + 1,
        cart: [...state.cart, {
          productId: p.id, qty: 1, uom: a.uom,
          daw: a.daw, substitutedFrom: a.substitutedFrom,
        }],
      };
    }

    case "NOTIFY_RX": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      if (!rx) return state;
      const prescriptions = state.prescriptions.map((x) => (x.id === a.id ? { ...x, notifiedAt: Date.now() } : x));
      return withToast(
        withAudit({ ...state, prescriptions }, "rx", `Pickup notification sent — ${rx.id} · ${rx.patient}${rx.phone ? ` · ${rx.phone}` : ""}`),
        "success", `"Ready for pickup" sent to ${rx.patient}${rx.phone ? ` · ${rx.phone}` : ""}`);
    }

    /* -------- prior authorization (§3) -------- */
    case "PA_SUBMIT": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      if (!rx || rx.pa) return state;
      const prescriptions = state.prescriptions.map((x) => (x.id === a.id
        ? { ...x, pa: { status: "pending" as const, requestedAt: Date.now(), note: `Submitted to ${x.insurance?.plan ?? "payer"} — awaiting clinical review` } }
        : x));
      return withToast(
        withAudit({ ...state, prescriptions }, "rx", `Prior auth requested — ${rx.id} · ${rx.patient} · ${rx.insurance?.plan ?? "payer"}`),
        "success", `PA submitted for ${rx.id} — tracking with ${rx.insurance?.plan ?? "the payer"}`);
    }

    case "PA_CHECK": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      if (!rx?.pa || rx.pa.status !== "pending") return state;
      /* simulated payer adjudication — deterministic, consistent with eligibility rule */
      const ok = !/9$/.test(rx.insurance?.memberId ?? "");
      const pa = ok
        ? { status: "approved" as const, requestedAt: rx.pa.requestedAt, decidedAt: Date.now(), note: "Approved — clinical criteria met" }
        : { status: "rejected" as const, requestedAt: rx.pa.requestedAt, decidedAt: Date.now(), note: "Clinical criteria not met — resubmit with chart notes" };
      const prescriptions = state.prescriptions.map((x) => (x.id === a.id ? { ...x, pa } : x));
      const next = withAudit({ ...state, prescriptions }, "rx",
        `Prior auth ${pa.status} — ${rx.id} · ${rx.patient}${pa.note ? ` · ${pa.note}` : ""}`);
      return ok
        ? withToast(next, "success", i18n.t("toast.paApproved", { id: rx.id }))
        : withToast(next, "error", i18n.t("toast.paRejected", { id: rx.id, note: pa.note }));
    }

    case "PA_RESUBMIT": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      if (!rx?.pa || rx.pa.status !== "rejected") return state;
      const prescriptions = state.prescriptions.map((x) => (x.id === a.id
        ? { ...x, pa: { status: "pending" as const, requestedAt: Date.now(), note: "Resubmitted with supporting chart notes" } }
        : x));
      return withToast(
        withAudit({ ...state, prescriptions }, "rx", `Prior auth resubmitted — ${rx.id} · ${rx.patient}`),
        "info", `${rx.id} PA resubmitted — back in the payer queue`);
    }

    /* -------- patient back-orders (§3) -------- */
    case "CREATE_BACKORDER": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const dupe = state.backorders.find((b) => b.productId === a.productId && b.patient === a.patient && (b.status === "ordered" || b.status === "arrived" || b.status === "notified"));
      if (dupe) return withToast(state, "warn", i18n.t("toast.dupeBackorder", { patient: a.patient, name: p.name }));
      const id = `BO-${101 + state.backorders.length}`;
      const bo: BackOrder = {
        id, patient: a.patient, phone: a.phone, productId: a.productId, qty: a.qty,
        createdAt: Date.now(), status: "ordered", etaDays: 3, supplier: p.supplier,
      };
      return withToast(
        withAudit({ ...state, backorders: [bo, ...state.backorders] }, "stock", `Back-order ${id} — ${a.qty} × ${p.name} for ${a.patient} · ETA 3d · ${p.supplier}`),
        "success", `Back-order ${id} placed for ${a.patient} — we'll notify when it lands`);
    }

    case "BACKORDER_STATUS": {
      const bo = state.backorders.find((x) => x.id === a.id);
      if (!bo) return state;
      const p = state.products.find((x) => x.id === bo.productId);
      const now = Date.now();
      const backorders = state.backorders.map((x) => (x.id === a.id ? {
        ...x, status: a.to,
        arrivedAt: a.to === "arrived" ? (x.arrivedAt ?? now) : x.arrivedAt,
        notifiedAt: a.to === "notified" ? (x.notifiedAt ?? now) : x.notifiedAt,
      } : x));
      const verb = a.to === "arrived" ? "stock arrived" : a.to === "notified" ? "patient notified" : a.to === "fulfilled" ? "handed over & fulfilled" : "cancelled";
      return withToast(
        withAudit({ ...state, backorders }, "stock", `Back-order ${bo.id} ${verb} — ${bo.qty} × ${p?.name ?? bo.productId} · ${bo.patient}`),
        a.to === "cancelled" ? "info" : "success", `${bo.id} ${verb}`);
    }

    case "TRANSFER_RX_OUT": {
      const rx = state.prescriptions.find((x) => x.id === a.prescriptionId);
      if (!rx || rx.transferredOut) return state;
      const p = state.products.find((x) => x.id === rx.productId);
      const transferNo = `TF-${88131 + state.rxTransfers.length}`;
      const rec: RxTransfer = {
        id: `RT-${Date.now().toString(36)}`, transferNo, direction: "out",
        prescriptionId: rx.id, patient: rx.patient,
        drug: `${p?.name ?? rx.productId} × ${rx.qty}`, qty: rx.qty,
        otherPharmacy: a.otherPharmacy, otherPhone: a.otherPhone,
        prescriber: state.prescribers.find((x) => x.id === rx.prescriberId)?.name ?? rx.prescriberId,
        refillsRemaining: a.refillsRemaining, pharmacist: state.user?.name ?? "Pharmacist on duty",
        at: Date.now(), note: a.note?.trim() || undefined,
      };
      const prescriptions = state.prescriptions.map((x) => (x.id === rx.id ? { ...x, transferredOut: { at: Date.now(), to: a.otherPharmacy } } : x));
      return withToast(
        withAudit(
          { ...state, prescriptions, rxTransfers: [rec, ...state.rxTransfers] },
          "rx", `Rx transfer OUT ${transferNo} — ${rx.id} · ${rx.patient} → ${a.otherPharmacy} (${a.refillsRemaining} refills)`),
        "success", `${transferNo} sent to ${a.otherPharmacy} — fill authority released`);
    }

    case "TRANSFER_RX_IN": {
      const p = state.products.find((x) => x.id === a.productId);
      const prescriber = state.prescribers.find((x) => x.id === a.prescriberId);
      if (!p || !prescriber) return state;
      const rxId = `RX-${2490 + state.prescriptions.length}`;
      const transferNo = `TF-${88131 + state.rxTransfers.length}`;
      const rx: Prescription = {
        id: rxId, patient: a.patient, age: 0, productId: p.id, qty: a.qty,
        prescriberId: a.prescriberId, status: "new", createdAt: Date.now(),
        refillsRemaining: a.refillsRemaining, phone: a.phone?.trim() || undefined,
        note: `Transferred in from ${a.otherPharmacy} — verify against original before review`,
      };
      const rec: RxTransfer = {
        id: `RT-${Date.now().toString(36)}`, transferNo, direction: "in",
        prescriptionId: rxId, patient: a.patient,
        drug: `${p.name} × ${a.qty}`, qty: a.qty,
        otherPharmacy: a.otherPharmacy, otherPhone: a.otherPhone,
        prescriber: prescriber.name, refillsRemaining: a.refillsRemaining,
        pharmacist: state.user?.name ?? "Pharmacist on duty", at: Date.now(),
        note: "Incoming transfer accepted",
      };
      return withToast(
        withAudit(
          { ...state, prescriptions: [rx, ...state.prescriptions], rxTransfers: [rec, ...state.rxTransfers] },
          "rx", `Rx transfer IN ${transferNo} — ${a.patient} · ${p.name} from ${a.otherPharmacy} → ${rxId}`),
        "success", `${rxId} created from ${a.otherPharmacy}'s transfer — queued for review`);
    }

    case "NEW_PRESCRIPTION": {
      const { intake } = a;
      const p = state.products.find((x) => x.id === intake.productId);
      const prescriber = state.prescribers.find((x) => x.id === intake.prescriberId);
      if (!p || !prescriber) return state;
      const rxId = `RX-${2490 + state.prescriptions.length}`;
      const rx: Prescription = {
        id: rxId, patient: intake.patient.trim(), age: intake.age,
        phone: intake.phone?.trim() || undefined,
        productId: p.id, qty: intake.qty,
        prescriberId: prescriber.id, status: "new", createdAt: Date.now(),
        daysSupply: intake.daysSupply, refillsAuthorized: intake.refillsAuthorized,
        refillsRemaining: intake.refillsAuthorized, rxExpiry: intake.rxExpiry,
        note: intake.note?.trim() || undefined,
        insurance: intake.insurancePlan?.trim()
          ? { plan: intake.insurancePlan.trim(), memberId: intake.memberId?.trim() || "—", status: "pending" }
          : undefined,
      };
      return withToast(
        withAudit(
          { ...state, prescriptions: [rx, ...state.prescriptions] },
          "rx", `New Rx intake ${rxId} — ${rx.patient} · ${p.name} × ${rx.qty} · ${prescriber.name}${rx.insurance ? ` · ${rx.insurance.plan}` : ""}`),
        "success", `${rxId} dropped off — queued for pharmacist review`);
    }

    case "SCAN_ATTACH": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      if (!rx) return state;
      const prescriptions = state.prescriptions.map((x) => (x.id === a.id ? { ...x, scan: a.dataUrl, scanAt: Date.now() } : x));
      return withToast(
        withAudit({ ...state, prescriptions }, "rx", `Hard-copy scan attached to ${rx.id} — ${rx.patient}`),
        "success", `Scan attached to ${rx.id} — stored with the prescription`);
    }

    case "SCAN_REMOVE": {
      const prescriptions = state.prescriptions.map((x) => (x.id === a.id ? { ...x, scan: undefined, scanAt: undefined } : x));
      return withToast({ ...state, prescriptions }, "info", "Scan removed");
    }

    case "CUSTOMER_ALLERGIES": {
      const c = state.customers.find((x) => x.id === a.id);
      if (!c) return state;
      const customers = state.customers.map((x) => (x.id === a.id ? { ...x, allergies: a.allergies.length ? a.allergies : undefined } : x));
      return withToast(
        withAudit({ ...state, customers }, "rx", `Allergy profile updated — ${c.name}: ${a.allergies.length ? a.allergies.join(", ") : "none on file"}`),
        "success", a.allergies.length ? `${c.name} — ${a.allergies.length} allergen${a.allergies.length === 1 ? "" : "s"} on file` : `${c.name} — allergies cleared`);
    }

    case "COMPOUND": {
      /* validate every ingredient has stock before touching anything */
      for (const ing of a.ingredients) {
        const src = state.products.find((x) => x.id === ing.productId);
        if (!src || stockOf(src) < ing.qty) {
          return withToast(state, "error", `Not enough ${src?.name ?? "stock"} on hand to compound`);
        }
      }
      let cost = 0;
      let minExp = "9999-12-31";
      /* pull each ingredient FEFO and capture the soonest expiry that goes into the batch */
      const products = state.products.map((x) => {
        const ing = a.ingredients.find((i) => i.productId === x.id);
        if (!ing) return x;
        cost += ing.qty * x.cost;
        const e = nearestExpiry(x);
        if (e && e < minExp) minExp = e;
        return { ...x, batches: allocFEFO(x.batches, ing.qty).batches };
      });
      cost = round2(cost + a.fee);
      const id = `cmp-${Date.now().toString(36)}`;
      const compound: Product = {
        id, sku: `CMP-${id.slice(-5).toUpperCase()}`, barcode: `892${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`,
        name: a.name.trim(), generic: "Compounded preparation", brand: "In-house compound",
        category: "compound", form: `Compound · ${a.ingredients.length} ingredient${a.ingredients.length === 1 ? "" : "s"}`,
        price: round2(a.price), cost, reorderLevel: 2, rx: true,
        supplier: "Compounded in-house", compound: true,
        batches: [{ batch: newBatchCode(), expiry: minExp === "9999-12-31" ? new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10) : minExp, qty: 1 }],
      };
      const ingLabel = a.ingredients.map((i) => `${i.qty}× ${state.products.find((x) => x.id === i.productId)?.name ?? i.productId}`).join(" + ");
      return withToast(
        withAudit(
          { ...state, products: [compound, ...products] },
          "stock", `Compound batch made — ${compound.name} (${ingLabel}) · cost ${money(cost)} · exp ${compound.batches[0].expiry}`),
        "success", `${compound.name} compounded — 1 unit in stock @ ${money(compound.price)}`);
    }

    case "SET_QTY": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const avail = stockOf(p, state.products);
      const factor = uomFactor(state, p.id, a.uom);
      const maxUom = Math.max(1, Math.floor(avail / factor));
      const same = (c: { productId: string; uom?: string }) => c.productId === a.productId && (c.uom ?? "") === (a.uom ?? "");
      const qty = Math.min(Math.max(0, a.qty), maxUom);
      if (a.qty > maxUom) return withToast(state, "warn", `Only ${avail} base units in stock`);
      if (qty === 0) return { ...state, cart: state.cart.filter((c) => !same(c)) };
      return { ...state, cart: state.cart.map((c) => (same(c) ? { ...c, qty } : c)) };
    }

    /* Switch the unit of measure on an existing cart line (§5) — qty clamps to the UOM's sellable max */
    case "SET_LINE_UOM": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const factor = uomFactor(state, p.id, a.uom);
      const maxUom = Math.max(1, Math.floor(stockOf(p, state.products) / factor));
      const cart = state.cart.map((c) =>
        c.productId === a.productId
          ? { ...c, uom: a.uom || undefined, qty: Math.min(Math.max(1, c.qty), maxUom) }
          : c);
      return { ...state, cart };
    }

    case "REMOVE_LINE":
      return { ...state, cart: state.cart.filter((c) => !(c.productId === a.productId && (c.uom ?? "") === (a.uom ?? ""))) };

    case "CLEAR_CART":
      return { ...state, cart: [], payOpen: false, redeemPoints: 0 };

    case "HOLD_SALE": {
      if (state.cart.length === 0) return state;
      const h: HeldSale = { id: `H-${heldSeq++}`, label: a.label || `Hold ${state.held.length + 1}`, at: Date.now(), expiresAt: a.expiresAt, items: state.cart };
      return withToast({ ...state, held: [...state.held, h], cart: [] }, "info", `Sale parked as “${h.label}”`);
    }

    case "EXPIRE_HELDS": {
      const pruned = pruneExpiredHolds(state.held);
      if (pruned.length === state.held.length) return state;
      const dropped = state.held.length - pruned.length;
      return withAudit({ ...state, held: pruned }, "shift", `${dropped} layaway/expired hold(s) auto-removed`);
    }

    case "ISSUE_STORE_CREDIT": {
      if (!can(state.user?.role, "refund")) return withToast(state, "error", "Manager approval required to issue store credit");
      return withToast(withAudit({ ...state, storeCredits: [...state.storeCredits, a.credit] }, "money", `Store credit ${a.credit.id} issued — ${money(a.credit.balance)}${a.credit.code ? ` (code ${a.credit.code})` : ""}`), "success", `Store credit issued — ${money(a.credit.balance)}`);
    }

    case "REDEEM_STORE_CREDIT": {
      const exists = state.storeCredits.some((c) => c.id === a.id);
      if (!exists) return withToast(state, "error", "Credit not found");
      return { ...state, storeCredits: applyStoreCredit(state.storeCredits, a.id, a.amount) };
    }

    case "SAVE_COUPON": {
      if (!can(state.user?.role, "manage_settings")) return withToast(state, "error", "Admin required to manage coupons");
      const exists = state.coupons.findIndex((c) => c.id === a.coupon.id);
      const coupons = exists >= 0 ? state.coupons.map((c) => (c.id === a.coupon.id ? a.coupon : c)) : [...state.coupons, a.coupon];
      return withToast(withAudit({ ...state, coupons }, "settings", exists >= 0 ? `Coupon ${a.coupon.code} updated` : `Coupon ${a.coupon.code} created`), "success", exists >= 0 ? i18n.t("toast.couponUpdated", { code: a.coupon.code }) : i18n.t("toast.couponCreated", { code: a.coupon.code }));
    }

    case "DELETE_COUPON": {
      if (!can(state.user?.role, "manage_settings")) return withToast(state, "error", "Admin required to manage coupons");
      const coupons = state.coupons.filter((c) => c.id !== a.id);
      return withToast(withAudit({ ...state, coupons }, "settings", `Coupon ${a.id} deleted`), "success", i18n.t("toast.couponDeleted"));
    }

    /* Dynamic categories (P4) — archived categories stay resolvable for history. */
    case "SAVE_CATEGORY": {
      if (!can(state.user?.role, "manage_settings")) return withToast(state, "error", "Admin required to manage categories");
      const exists = state.categories.findIndex((c) => c.id === a.category.id);
      const categories = exists >= 0 ? state.categories.map((c) => (c.id === a.category.id ? a.category : c)) : [...state.categories, a.category];
      return withToast(withAudit({ ...state, categories }, "settings", exists >= 0 ? `Category ${a.category.label} updated` : `Category ${a.category.label} created`), "success", `Category saved — ${a.category.label}`);
    }

    case "DELETE_CATEGORY": {
      if (!can(state.user?.role, "manage_settings")) return withToast(state, "error", "Admin required to manage categories");
      const inUse = state.products.some((p) => p.category === a.id);
      if (inUse) return withToast(state, "error", "Category still assigned to products — archive it instead");
      const categories = state.categories.filter((c) => c.id !== a.id);
      return withToast(withAudit({ ...state, categories }, "settings", `Category ${a.id} deleted`), "success", "Category deleted");
    }

    /* Suppliers (R5) — archived suppliers stay resolvable for PO/invoice history. */
    case "SUPPLIER_SAVE": {
      if (!can(state.user?.role, "manage_settings")) return withToast(state, "error", "Admin required to manage suppliers");
      const exists = state.suppliers.findIndex((s) => s.id === a.supplier.id);
      let supplier = a.supplier;
      if (exists < 0 && !a.supplier.id) {
        const seq = state.suppliers.length + 1;
        supplier = { ...a.supplier, id: `SUP-${String(seq).padStart(2, "0")}` };
      }
      const suppliers = exists >= 0 ? state.suppliers.map((s) => (s.id === supplier.id ? supplier : s)) : [...state.suppliers, supplier];
      return withToast(withAudit({ ...state, suppliers }, "settings", exists >= 0 ? `Supplier ${supplier.name} updated` : `Supplier ${supplier.name} created`), "success", exists >= 0 ? i18n.t("suppliers.updated", { name: supplier.name }) : i18n.t("suppliers.created", { name: supplier.name }));
    }

    case "SUPPLIER_DELETE": {
      if (!can(state.user?.role, "manage_settings")) return withToast(state, "error", "Admin required to manage suppliers");
      const sup = state.suppliers.find((s) => s.id === a.id);
      if (!sup) return state;
      const usedByProducts = state.products.some((p) => p.supplier === sup.name);
      const usedByOrders = state.purchaseOrders.some((po) => po.supplierId === a.id);
      if (usedByProducts || usedByOrders) return withToast(state, "error", i18n.t("suppliers.deleteBlocked"));
      const suppliers = state.suppliers.filter((s) => s.id !== a.id);
      return withToast(withAudit({ ...state, suppliers }, "settings", `Supplier ${sup.name} deleted`), "success", i18n.t("suppliers.deleted", { name: sup.name }));
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
      const t = cartTotals(state, a.discountPct, a.taxExempt, a.couponDiscount ?? 0, a.invoiceDiscountAmt ?? 0);
      const customer = state.customers.find((c) => c.id === state.saleCustomerId) ?? null;
      /* DEA controlled substances — require an identified customer and an ID check */
      const controlledLines = t.lines.filter((l) => state.products.find((p) => p.id === l.productId)?.controlled);
      if (controlledLines.length > 0) {
        if (!customer) return withToast(state, "error", "Controlled substance in cart — attach a customer (photo ID required)");
        if (!a.idChecked) return withToast(state, "error", "Confirm the ID check before completing a controlled sale");
      }
      /* aggregate base-unit demand per product across UOM lines + kit components (§5) */
      const demand = new Map<string, number>();
      for (const l of t.lines) {
        const p = state.products.find((x) => x.id === l.productId)!;
        if (p.kit && p.kit.length > 0) {
          for (const comp of p.kit) demand.set(comp.productId, (demand.get(comp.productId) ?? 0) + l.qty * comp.qty);
        } else {
          demand.set(p.id, (demand.get(p.id) ?? 0) + l.qty * (l.uomFactor ?? 1));
        }
      }
      /* guard: every demanded product must be coverable by on-hand base units */
      for (const [pid, need] of demand) {
        const p = state.products.find((x) => x.id === pid)!;
        const onHand = stockOf(p, state.products);
        if (onHand < need) return withToast(state, "error", `${p.name} short on stock — only ${onHand} base units left`);
      }
      /* consume lots FEFO — earliest expiry leaves the shelf first */
      const products = state.products.map((p) => {
        const need = demand.get(p.id);
        if (!need) return p;
        const res = allocFEFO(p.batches, need);
        /* FIFO unit cost from the allocated lots (§5/§6) — falls back to product cost */
        const allocQty = res.alloc.reduce((s, x) => s + x.qty, 0);
        const fifoCost = allocQty > 0
          ? round2(res.alloc.reduce((s, x) => s + x.qty * (x.cost ?? p.cost), 0) / allocQty)
          : p.cost;
        /* attach the lot trail + cost to this product's non-kit lines */
        for (const l of t.lines) {
          const lp = state.products.find((x) => x.id === l.productId)!;
          const isKit = !!(lp.kit && lp.kit.length > 0);
          if (!isKit && l.productId === p.id) {
            if (!l.alloc) l.alloc = res.alloc.filter((x) => x.qty > 0);
            l.cost = fifoCost;
          }
        }
        return { ...p, batches: res.batches };
      });
      /* kit lines: cost rolls up from component costs (§5) */
      for (const l of t.lines) {
        const lp = state.products.find((x) => x.id === l.productId)!;
        if (lp.kit && lp.kit.length > 0) {
          l.cost = round2(lp.kit.reduce((s, comp) => {
            const cp = state.products.find((x) => x.id === comp.productId);
            return s + (cp?.cost ?? 0) * comp.qty;
          }, 0));
        }
      }
      const primary = a.payments[0];
      const singleCash = a.payments.length === 1 && primary.method === "cash";
      /* loyalty: earn at the org-configured rate, spend redeemed points */
      const pointsEarned = Math.floor(t.total * state.settings.loyalty.ptsPerUnit);
      const customers = customer
        ? state.customers.map((c) => (c.id === customer.id
            ? { ...c, points: Math.max(0, c.points + pointsEarned - state.redeemPoints) }
            : c))
        : state.customers;
      const tx: Transaction = {
        id: `T-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        at: Date.now(), lines: t.lines,
        subtotal: t.subtotal, discount: t.discount, couponDiscount: t.coupon > 0 ? t.coupon : undefined, tax: t.tax, total: t.total,
        invoiceDiscountAmt: (a.invoiceDiscountAmt ?? 0) > 0 ? t.invoiceAmt : undefined,
        method: primary.method, cashier: state.user?.name ?? "Staff",
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
      /* deduct any store_credit / gift-card tender legs from their balances (Phase A) */
      const creditDeductions = a.payments.filter((p) => p.method === "store_credit" && p.ref);
      const storeCredits = creditDeductions.reduce(
        (acc, p) => (p.ref ? applyStoreCredit(acc, p.ref, p.amount) : acc),
        state.storeCredits,
      );
      let next: State = {
        ...state, products, customers, storeCredits,
        transactions: [tx, ...state.transactions],
        cart: [], payOpen: false, receipt: tx,
        saleCustomerId: null, redeemPoints: 0,
      };
      /* pay_later audit entry */
      const payLaterLeg = a.payments.find((p) => p.method === "pay_later");
      if (payLaterLeg && customer) {
        const dueStr = payLaterLeg.dueDate ? new Date(payLaterLeg.dueDate).toLocaleDateString() : "TBD";
        next = withAudit(next, "sale", `${tx.id} · pay_later $${payLaterLeg.amount.toFixed(2)} due ${dueStr} · ${customer.name}`);
      }
      const ptsLabel = customer ? ` · +${pointsEarned}${state.redeemPoints ? ` / −${state.redeemPoints} pts` : ""} pts` : "";
      next = withAudit(next, "sale", `${tx.id} · $${t.total.toFixed(2)} · ${tenderLabel}${customer ? ` · ${customer.name}` : ""}${a.taxExempt ? " · TAX EXEMPT" : ""}`);
      /* record the sale on the open shift ledger so X/Z reports reflect it (Phase A) */
      if (next.currentShift) {
        const updated = recordShiftTransaction(next.currentShift, tx, "sale", tenderTypeOf(primary.method));
        next = { ...next, shifts: next.shifts.map((s) => (s.id === updated.id ? updated : s)), currentShift: updated };
      }
      if (controlledLines.length > 0 && customer) {
        next = withAudit(next, "rx", `⚠ Controlled sale ${tx.id} — ${controlledLines.map((l) => `${l.name} ×${l.qty}`).join(", ")} · ${customer.name} · ID verified ✓`);
      }
      /* charge-on-pickup: any cart line stamped with an rxId dispenses that Rx on payment (W1.4) */
      const pickupRxIds = [...new Set(state.cart.map((c) => c.rxId).filter((id): id is string => !!id))]
        .filter((id) => next.prescriptions.some((x) => x.id === id && x.status !== "dispensed"));
      if (pickupRxIds.length > 0) {
        next = {
          ...next,
          prescriptions: next.prescriptions.map((x) => (pickupRxIds.includes(x.id)
            ? {
                ...x, status: "dispensed" as RxStatus,
                dispensedAt: x.dispensedAt ?? tx.at,
                refillsRemaining: x.refillsRemaining !== undefined ? Math.max(0, x.refillsRemaining - 1) : x.refillsRemaining,
              }
            : x)),
        };
        for (const rxId of pickupRxIds) {
          const rx = state.prescriptions.find((x) => x.id === rxId)!;
          next = withAudit(next, "rx", `${rxId} dispensed on pickup via ${tx.id} — ${rx.patient} · ${rx.qty} × ${state.products.find((p) => p.id === rx.productId)?.name ?? rx.productId}`);
        }
      }
      /* restricted / behind-the-counter OTC — mandatory purchase log with ID capture (§3) */
      if (a.restricted && a.restricted.purchaser.trim()) {
        let logSeq = (next.restrictedLog[0]?.id ?? 9000) + 1;
        const entries: RestrictedLogEntry[] = t.lines
          .map((l) => {
            const p = state.products.find((x) => x.id === l.productId);
            return p?.restricted ? { p, l } : null;
          })
          .filter((x): x is { p: Product; l: TxLine } => x !== null)
          .map(({ p, l }) => ({
            id: logSeq++, at: tx.at, productId: p.id, qty: l.qty,
            purchaser: a.restricted!.purchaser.trim(), idType: a.restricted!.idType,
            idLast4: a.restricted!.idLast4, cashier: state.user?.name ?? "Staff",
          }));
        next = { ...next, restrictedLog: [...entries, ...next.restrictedLog] };
        next = withAudit(next, "sale", `⚠ BTC log ${tx.id} — ${entries.map((e) => `${e.qty}× ${state.products.find((p) => p.id === e.productId)?.name ?? e.productId}`).join(", ")} · ${a.restricted!.purchaser} (${a.restricted!.idType} ····${a.restricted!.idLast4})`);
      }
      return withToast(next, "success", `Payment captured — ${tx.id} · $${t.total.toFixed(2)} · ${tenderLabel}${ptsLabel}`);
    }

    case "OPEN_RECEIPT":
      return { ...state, receipt: a.tx };

    case "SETTLE_PAY_LATER": {
      const tx = state.transactions.find((t) => t.id === a.transactionId);
      if (!tx) return withToast(state, "error", "Transaction not found");
      if (!tx.payments || !tx.payments[a.legIndex]) return withToast(state, "error", "Payment leg not found");
      const leg = tx.payments[a.legIndex];
      if (leg.method !== "pay_later") return withToast(state, "error", "Not a pay_later leg");
      if (leg.settledAt) {
        const settledDate = new Date(leg.settledAt).toLocaleDateString();
        return withToast(state, "error", `Cannot settle — already settled on ${settledDate}`);
      }
      const now = Date.now();
      const settledLeg: PaymentLeg = { method: a.method, amount: leg.amount, ref: a.ref, settledAt: now };
      const updatedPayments = [...tx.payments];
      updatedPayments[a.legIndex] = { ...leg, settledAt: now };
      updatedPayments.push(settledLeg);
      const transactions = state.transactions.map((t) =>
        t.id === a.transactionId ? { ...t, payments: updatedPayments } : t
      );
      const next = withAudit(
        { ...state, transactions },
        "sale",
        `Settled pay_later ${tx.id} leg ${a.legIndex} · $${leg.amount.toFixed(2)} via ${a.method}${a.ref ? ` (${a.ref})` : ""}`
      );
      return withToast(next, "success", `Pay later settled — $${leg.amount.toFixed(2)} via ${a.method}`);
    }

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
      /* §5 lot costing — the cost entered at receive rides on the Batch; FIFO margin uses it */
      const lot: Batch = { batch: a.batch, expiry: a.expiry, qty: a.amount, cost: a.cost !== undefined ? round2(a.cost) : p.cost };
      const products = state.products.map((x) => (x.id === a.productId ? { ...x, batches: [...x.batches, lot] } : x));
      /* receiving stock flips any matching open back-orders to "arrived" (§3) */
      const matched = state.backorders.filter((b) => b.productId === a.productId && b.status === "ordered");
      const backorders = matched.length > 0
        ? state.backorders.map((b) => (b.productId === a.productId && b.status === "ordered" ? { ...b, status: "arrived" as const, arrivedAt: Date.now() } : b))
        : state.backorders;
      const suffix = matched.length > 0 ? ` — ${matched.length} back-order${matched.length === 1 ? "" : "s"} now in` : "";
      const costLabel = ` @ ${money(lot.cost!)}/unit`;
      const next = withAudit({ ...state, products, backorders }, "stock", `Received +${a.amount} × ${p.name} → lot ${a.batch} (exp ${a.expiry})${costLabel}${suffix}`);
      return withToast(next, "success", `Received +${a.amount} × ${p.name} → lot ${a.batch}${costLabel}${suffix}`);
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

    /* Per-line discount ($ or %). Discounts ≥ LINE_DISCOUNT_PIN_THRESHOLD need manager approval. */
    case "SET_LINE_DISCOUNT": {
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const same = (c: { productId: string; uom?: string }) => c.productId === a.productId && (c.uom ?? "") === (a.uom ?? "");
      if (!a.discount || a.discount.value <= 0) {
        const cart = state.cart.map((c) => (same(c) ? { ...c, lineDiscount: undefined } : c));
        return withToast({ ...state, cart }, "info", `${p.name} line discount removed`);
      }
      const base = unitPrice(state, p.id, a.uom);
      const factor = uomFactor(state, p.id, a.uom);
      const qty = state.cart.filter(same).reduce((s, c) => s + c.qty, 0);
      const gross = base * qty;
      const frac = a.discount.mode === "pct" ? Math.min(100, a.discount.value) / 100 : Math.min(1, a.discount.value / Math.max(0.01, gross));
      if (frac >= LINE_DISCOUNT_PIN_THRESHOLD && !can(state.user?.role, "approve_discount") && !a.approvedBy) {
        return withToast(state, "error", `Discount of ${(frac * 100).toFixed(0)}% needs manager PIN approval`);
      }
      const cart = state.cart.map((c) => (same(c) ? { ...c, lineDiscount: a.discount } : c));
      return withToast(
        withAudit({ ...state, cart }, "money",
          `Line discount — ${p.name} ×${qty}: ${a.discount.mode === "pct" ? `${a.discount.value}%` : money(a.discount.value)}${a.approvedBy ? ` · approved by ${a.approvedBy}` : ""}`),
        "success", `Discount applied — ${p.name}`);
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
      const tr: Transfer = { id, productId: p.id, qty: a.qty, toBranch: a.toBranch, status: "requested", createdAt: Date.now(), requestedBy: state.user?.name ?? "Staff", note: a.note?.trim() || undefined };
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
        prescriberId: rx.prescriberId, status: "new", createdAt: Date.now(),
        refillsAuthorized: rx.refillsAuthorized, refillsRemaining: rx.refillsAuthorized, rxExpiry: rx.rxExpiry,
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
        method: orig.method, cashier: state.user?.name ?? "Staff", refundOf: orig.id, reason: a.reason,
      };
      const transactions = [refund, ...state.transactions.map((t) => (t.id === orig.id ? { ...t, refundedAt: Date.now() } : t))];
      let next = withAudit({ ...state, products, transactions }, "money",
        `Refund ${refund.id} of ${orig.id} — ${money(-orig.total)} · ${a.reason}`);
      /* record the refund on the open shift ledger (Phase A) */
      if (next.currentShift) {
        const updated = recordShiftTransaction(next.currentShift, refund, "refund", tenderTypeOf(orig.method));
        next = { ...next, shifts: next.shifts.map((s) => (s.id === updated.id ? updated : s)), currentShift: updated };
      }
      return withToast(next, "success", `${orig.id} refunded — ${money(-orig.total)} returned, stock restored to lots`);
    }

    case "ADD_PRODUCT":
      return withToast(
        withAudit({ ...state, products: [a.product, ...state.products] }, "stock", `New SKU — ${a.product.name} (${a.product.sku})`),
        "success", `${a.product.name} added to catalog`,
      );

    /* Phase G: apply an AI-suggested reorder level — user-initiated from the forecast dialog */
    case "SET_REORDER_LEVEL": {
      const target = state.products.find((x) => x.id === a.productId);
      if (!target) return state;
      return withAudit(
        { ...state, products: state.products.map((x) => (x.id === a.productId ? { ...x, reorderLevel: Math.max(0, Math.round(a.reorderLevel)) } : x)) },
        "stock", `Reorder level for ${target.name} set to ${Math.max(0, Math.round(a.reorderLevel))} (AI forecast, user-applied)`,
      );
    }

    case "RX_STATUS": {
      const rx = state.prescriptions.find((x) => x.id === a.id);
      if (!rx) return state;
      const msg =
        a.status === "verifying" ? `${rx.id} moved to pharmacist review` :
        a.status === "ready" ? `${rx.id} ready for pickup` :
        a.status === "dispensed" ? `${rx.id} dispensed — logged` : `${rx.id} reopened`;
      let next: State = {
        ...state,
        prescriptions: state.prescriptions.map((x) => {
          if (x.id !== a.id) return x;
          /* on dispense: stamp the time and consume one authorized refill (§3) */
          const dispensing = a.status === "dispensed" && x.status !== "dispensed";
          return {
            ...x, status: a.status,
            dispensedAt: dispensing ? (x.dispensedAt ?? Date.now()) : x.dispensedAt,
            refillsRemaining: dispensing && x.refillsRemaining !== undefined
              ? Math.max(0, x.refillsRemaining - 1) : x.refillsRemaining,
          };
        }),
      };
      if (a.status === "dispensed") {
        next = withAudit(next, "rx", `${rx.id} dispensed — ${rx.patient} · ${rx.qty} × ${rx.productId}${rx.refillsRemaining !== undefined ? ` · ${Math.max(0, rx.refillsRemaining - 1)} refill(s) left` : ""}`);
      }
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

    case "SUBSTITUTE_GENERIC": {
      /* Swap a cart line brand → generic, keeping qty and stamping substitutedFrom (W1.4).
         Guards: both SKUs must exist, the pair must be a real cheaper in-stock
         substitution, and the generic must cover the qty already on the ticket. */
      const brand = state.products.find((x) => x.id === a.brandId);
      const gen = state.products.find((x) => x.id === a.genericId);
      if (!brand || !gen) return state;
      if (genericSubstituteFor(brand, state.products)?.id !== gen.id) {
        return withToast(state, "error", `${gen.name} is not a cheaper in-stock generic for ${brand.name}`);
      }
      const same = (c: { productId: string; uom?: string }) => c.productId === brand.id && (c.uom ?? "") === (a.uom ?? "");
      const line = state.cart.find(same);
      if (!line) return state;
      const avail = stockOf(gen, state.products);
      const factor = uomFactor(state, gen.id, a.uom);
      const maxUom = Math.max(1, Math.floor(avail / factor));
      if (line.qty > maxUom) return withToast(state, "error", `Only ${maxUom} × ${gen.name} on the shelf — keeping ${brand.name}`);
      /* merge onto an existing generic line if one is already on the ticket */
      const genSame = (c: { productId: string; uom?: string }) => c.productId === gen.id && (c.uom ?? "") === (a.uom ?? "");
      const genLine = state.cart.find(genSame);
      const swapped = { ...line, productId: gen.id, daw: undefined, substitutedFrom: brand.id, priceOverride: undefined };
      const cart = genLine
        ? state.cart.filter((c) => !same(c)).map((c) => (genSame(c) ? { ...c, qty: Math.min(c.qty + line.qty, maxUom), substitutedFrom: brand.id } : c))
        : state.cart.map((c) => (same(c) ? swapped : c));
      const saving = substitutionSaving(brand, gen) * line.qty;
      return withToast(
        withAudit({ ...state, cart, flashId: gen.id, flashKey: state.flashKey + 1 }, "rx",
          `Generic substitution — ${gen.name} (${gen.brand}) dispensed for ${brand.name} (${brand.brand}) ×${line.qty} · patient saves ${money(saving)}`),
        "success", `${gen.name} substituted for ${brand.name} — saves ${money(saving)}`);
    }

    case "SET_DAW": {
      /* Dispense-as-written: stamp the DAW code on the line so it prints on the receipt (§3). */
      const p = state.products.find((x) => x.id === a.productId);
      if (!p) return state;
      const same = (c: { productId: string; uom?: string }) => c.productId === p.id && (c.uom ?? "") === (a.uom ?? "");
      if (!state.cart.some(same)) return state;
      const code = a.daw === 2 ? 2 : 1;
      const cart = state.cart.map((c) => (same(c) ? { ...c, daw: code, substitutedFrom: undefined } : c));
      return withToast(
        withAudit({ ...state, cart }, "rx",
          `DAW-${code} documented — ${p.name} dispensed as written (${code === 1 ? "prescriber directed" : "patient requested brand"})`),
        "info", `DAW-${code} recorded for ${p.name}`);
    }

    case "CHARGE_RX_PICKUP": {
      /* Waiting-bin charge-on-pickup: pre-fill the cart from the Rx at Rx price/qty,
         attach the patient as the sale customer, and stamp rxId on the cart line so
         COMPLETE_SALE marks the Rx dispensed. Guards: unknown Rx/product,
         out-of-stock (FEFO on-hand), and already-dispensed (double-charge). */
      const rx = state.prescriptions.find((x) => x.id === a.rxId);
      if (!rx) return withToast(state, "error", `Rx ${a.rxId} not found`);
      if (rx.status === "dispensed") return withToast(state, "error", `${rx.id} already dispensed — cannot charge twice`);
      const p = state.products.find((x) => x.id === rx.productId);
      if (!p) return withToast(state, "error", `Product for ${rx.id} is not in the catalog`);
      const avail = stockOf(p, state.products);
      if (avail <= 0) return withToast(state, "error", `${p.name} out of stock — cannot charge ${rx.id} on pickup`);
      const qty = Math.min(rx.qty, avail);
      /* Seat the patient as the sale customer (name match against the book); walk-in stays otherwise. */
      const match = state.customers.find((c) => c.name.toLowerCase() === rx.patient.toLowerCase());
      const customerId = state.saleCustomerId ?? match?.id ?? null;
      const same = (c: { productId: string; rxId?: string }) => c.productId === p.id && c.rxId === rx.id;
      const cart = state.cart.some(same)
        ? state.cart.map((c) => (same(c) ? { ...c, qty: Math.min(qty, avail) } : c))
        : [...state.cart, { productId: p.id, qty, rxId: rx.id }];
      const next = withAudit(
        { ...state, cart, saleCustomerId: customerId, redeemPoints: 0, view: "register" as View, flashId: p.id, flashKey: state.flashKey + 1 },
        "rx", `${rx.id} queued for charge-on-pickup — ${qty} × ${p.name} · ${rx.patient}`);
      return withToast(next, "info",
        `${rx.id} on the register — ${qty} × ${p.name}${customerId ? ` · ${state.customers.find((c) => c.id === customerId)?.name}` : ""}`);
    }

    case "TOAST":
      return withToast(state, a.kind, a.msg);

    case "AUDIT_LOG":
      return withAudit(state, a.kind, a.detail);

    case "DISMISS_TOAST":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== a.id) };

    case "PO_CREATE": {
      const sup = state.suppliers.find((s) => s.id === a.supplierId);
      if (!sup || a.lines.length === 0) return state;
      const id = `PO-${2204 + state.purchaseOrders.length}`;
      const po: PurchaseOrder = {
        id, supplierId: a.supplierId, status: "ordered",
        createdAt: Date.now(), expectedAt: Date.now() + sup.leadDays * 86_400_000,
        lines: a.lines.map((l) => ({ ...l, received: 0 })),
        note: a.note?.trim() || undefined,
      };
      const total = round2(a.lines.reduce((s, l) => s + l.qty * l.unitCost, 0));
      return withToast(
        withAudit({ ...state, purchaseOrders: [po, ...state.purchaseOrders] }, "stock",
          `PO ${id} placed with ${sup.name} — ${a.lines.length} line(s), ${money(total)}, ETA ${sup.leadDays}d`),
        "success", `${id} sent to ${sup.name} · ${money(total)}`);
    }

    case "PO_RECEIVE": {
      const po = state.purchaseOrders.find((x) => x.id === a.poId);
      const sup = po ? state.suppliers.find((s) => s.id === po.supplierId) : undefined;
      if (!po || !sup || po.status === "received" || po.status === "cancelled") return state;
      /* add received lots (FEFO-friendly: each receipt is its own lot with its own expiry) */
      const products = state.products.map((p) => {
        const r = a.receipts.find((x) => x.productId === p.id);
        if (!r || r.qty <= 0) return p;
        /* per-lot cost recorded at receive — the negotiated PO price (§5 batch costing) */
        const poLine = po.lines.find((l) => l.productId === p.id);
        return { ...p, batches: [...p.batches, { batch: newBatchCode(), expiry: r.expiry, qty: r.qty, cost: poLine?.unitCost ?? p.cost }] };
      });
      const lines = po.lines.map((l) => {
        const r = a.receipts.find((x) => x.productId === l.productId);
        return r ? { ...l, received: Math.min(l.qty, l.received + r.qty) } : l;
      });
      const allIn = lines.every((l) => l.received >= l.qty);
      const status: PurchaseOrder["status"] = allIn ? "received" : "partial";
      /* one invoice per receive event, due per supplier terms */
      const receivedValue = round2(lines.reduce((s, l) => s + l.received * l.unitCost, 0)
        - po.lines.reduce((s, l) => s + l.received * l.unitCost, 0));
      const invNumber = `INV-${8805 + state.apInvoices.length}`;
      const invoice: ApInvoice = {
        id: invNumber, number: invNumber, supplierId: sup.id, poId: po.id,
        date: Date.now(), dueDays: sup.terms, total: Math.max(0, receivedValue),
        payments: [], credits: [],
      };
      const updated: PurchaseOrder = { ...po, lines, status, receivedAt: allIn ? Date.now() : po.receivedAt, invoiceId: invoice.total > 0 ? invNumber : po.invoiceId };
      let next: State = {
        ...state, products,
        purchaseOrders: state.purchaseOrders.map((x) => (x.id === po.id ? updated : x)),
        apInvoices: invoice.total > 0 ? [invoice, ...state.apInvoices] : state.apInvoices,
      };
      next = withAudit(next, "stock", `Received against ${po.id} (${sup.name}) — ${a.receipts.filter((r) => r.qty > 0).length} lot(s)${invoice.total > 0 ? ` · ${invNumber} ${money(invoice.total)} due net-${sup.terms}` : ""}`);
      return withToast(next, "success", `${po.id} received — stock added${invoice.total > 0 ? `, ${invNumber} booked ${money(invoice.total)}` : ""}`);
    }

    case "PO_CANCEL": {
      const po = state.purchaseOrders.find((x) => x.id === a.poId);
      if (!po || po.status === "received") return state;
      return withToast(
        withAudit({ ...state, purchaseOrders: state.purchaseOrders.map((x) => (x.id === a.poId ? { ...x, status: "cancelled" } : x)) },
          "stock", `PO ${a.poId} cancelled`),
        "info", `${a.poId} cancelled`);
    }

    case "AP_PAY": {
      const inv = state.apInvoices.find((x) => x.id === a.invoiceId);
      if (!inv) return state;
      const bal = invoiceBalance(inv);
      const amount = round2(Math.min(Math.max(0, a.amount), bal));
      if (amount <= 0) return state;
      const apInvoices = state.apInvoices.map((x) => (x.id === a.invoiceId
        ? { ...x, payments: [...x.payments, { at: Date.now(), amount, method: a.method, ref: a.ref?.trim() || undefined }] }
        : x));
      const nowPaid = invoiceBalance(inv) - amount <= 0.005;
      const sup = state.suppliers.find((s) => s.id === inv.supplierId);
      return withToast(
        withAudit({ ...state, apInvoices }, "money",
          `AP payment ${money(amount)} (${a.method}) on ${inv.number} · ${sup?.name ?? ""}${nowPaid ? " — settled in full" : ""}`),
        "success", nowPaid ? `${inv.number} settled in full` : `Paid ${money(amount)} on ${inv.number} · ${money(invoiceBalance(inv) - amount)} remaining`);
    }

    case "AP_CREDIT": {
      const inv = state.apInvoices.find((x) => x.id === a.invoiceId);
      if (!inv || a.amount <= 0) return state;
      const apInvoices = state.apInvoices.map((x) => (x.id === a.invoiceId
        ? { ...x, credits: [...x.credits, { at: Date.now(), amount: round2(a.amount), note: a.note?.trim() || "Credit note" }] }
        : x));
      return withToast(
        withAudit({ ...state, apInvoices }, "money", `Credit note ${money(a.amount)} on ${inv.number} — ${a.note}`),
        "success", `Credit of ${money(a.amount)} applied to ${inv.number}`);
    }

    case "EXPENSE_ADD": {
      if (a.amount <= 0) return state;
      const exp: Expense = {
        id: `EXP-${907 + state.expenses.length}`,
        category: a.category, amount: round2(a.amount), date: a.date,
        payee: a.payee.trim() || "—", note: a.note?.trim() || undefined, recurring: a.recurring || undefined,
      };
      return withToast(
        withAudit({ ...state, expenses: [exp, ...state.expenses] }, "money",
          `Expense ${money(exp.amount)} — ${exp.category} · ${exp.payee}${exp.recurring ? " (recurring)" : ""}`),
        "success", `${exp.category} expense recorded · ${money(exp.amount)}`);
    }

    case "EXPENSE_DELETE":
      return { ...state, expenses: state.expenses.filter((x) => x.id !== a.id) };

    case "DELIVERY_STATUS": {
      const d = state.deliveries.find((x) => x.id === a.id);
      if (!d) return state;
      const cust = state.customers.find((c) => c.id === d.customerId);
      const deliveries = state.deliveries.map((x) => (x.id === a.id
        ? { ...x, status: a.to, driver: a.driver !== undefined ? a.driver : x.driver, proof: a.proof !== undefined ? a.proof : x.proof }
        : x));
      const verb = a.to === "assigned" ? `assigned to ${a.driver ?? "driver"}` : a.to === "out" ? "out for delivery" : a.to === "delivered" ? "delivered ✓" : "queued";
      return withToast(
        withAudit({ ...state, deliveries }, "sale", `Delivery ${a.id} ${verb} — ${cust?.name ?? d.customerId}`),
        "success", `${a.id} ${verb}`);
    }

    case "WEB_ORDER": {
      const w = state.webOrders.find((x) => x.id === a.id);
      if (!w) return state;
      const webOrders = state.webOrders.map((x) => (x.id === a.id
        ? { ...x, status: a.to, declineReason: a.to === "declined" ? (a.reason || "Not specified") : x.declineReason }
        : x));
      return withToast(
        withAudit({ ...state, webOrders }, "sale", `Web order ${a.id} ${a.to} — ${w.customerName}`),
        a.to === "declined" ? "warn" : "success", `${a.id} ${a.to}`);
    }

    case "WEB_CONVERT": {
      const w = state.webOrders.find((x) => x.id === a.id);
      if (!w || w.status === "converted") return state;
      /* match the shopper to the customer book by name, else keep as walk-in delivery */
      const cust = state.customers.find((c) => c.name.toLowerCase() === w.customerName.toLowerCase());
      const id = `DL-${304 + state.deliveries.length}`;
      const delivery: Delivery = {
        id, customerId: cust?.id ?? "WALK-IN",
        address: w.pickup === "in_store" ? "In-store pickup" : (cust?.address ?? "Address on file"),
        lines: w.items.filter((i) => i.productId).map((i) => ({ productId: i.productId!, qty: i.qty })),
        fee: w.pickup === "delivery" ? 5 : 0,
        mode: w.pickup === "curbside" ? "curbside" : "delivery",
        status: "queued", scheduledAt: Date.now() + 4 * 3_600_000, createdAt: Date.now(),
      };
      const webOrders = state.webOrders.map((x) => (x.id === a.id ? { ...x, status: "converted" as const } : x));
      return withToast(
        withAudit({ ...state, webOrders, deliveries: [delivery, ...state.deliveries] }, "sale", `Web order ${a.id} → delivery ${id} (${w.pickup})`),
        "success", `${a.id} converted → ${id} queued`);
    }

    case "CLOCK": {
      if (!state.user) return state;
      const open = state.timeEntries.find((t) => t.staffId === state.user!.id && !t.outAt);
      if (open) {
        const timeEntries = state.timeEntries.map((t) => (t.id === open.id ? { ...t, outAt: Date.now() } : t));
        const hrs = ((Date.now() - open.inAt) / 3_600_000).toFixed(1);
        return withToast(
          withAudit({ ...state, timeEntries }, "system", `${state.user.name} clocked out — ${hrs}h shift`),
          "info", `Clocked out — ${hrs}h on shift`);
      }
      const entry: TimeEntry = { id: (state.timeEntries[0]?.id ?? 500) + 1, staffId: state.user.id, inAt: Date.now() };
      return withToast(
        withAudit({ ...state, timeEntries: [entry, ...state.timeEntries] }, "system", `${state.user.name} clocked in`),
        "success", "Clocked in — shift started");
    }

    case "CUSTOMER_PROFILE": {
      const c = state.customers.find((x) => x.id === a.id);
      if (!c) return state;
      const customers = state.customers.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x));
      return withToast(
        withAudit({ ...state, customers }, "rx", `Patient profile updated — ${c.name}`),
        "success", `${c.name}'s profile saved`);
    }

    case "HYDRATE_BACKEND": {
      const hydratedUser = state.user
        ? a.data.staff.find((staff) => staff.id === state.user?.id && staff.active) ?? state.user
        : null;
      /* push runtime interaction pairs to the clinical module so findInteractionsAtRuntime uses them */
      setRuntimeInteractions(a.data.interactionPairs ?? []);
      return {
        ...state,
        user: hydratedUser,
        backendOffline: false,
        products: a.data.products,
        transactions: a.data.transactions,
        prescriptions: a.data.prescriptions,
        prescribers: a.data.prescribers,
        customers: a.data.customers,
        transfers: a.data.transfers,
        backorders: a.data.backorders,
        rxTransfers: a.data.rxTransfers,
        suppliers: a.data.suppliers,
        purchaseOrders: a.data.purchaseOrders,
        apInvoices: a.data.apInvoices,
        expenses: a.data.expenses,
        deliveries: a.data.deliveries,
        webOrders: a.data.webOrders,
        timeEntries: a.data.timeEntries,
        staff: a.data.staff,
        settings: a.data.settings,
        restrictedLog: a.data.restrictedLog,
        audit: a.data.audit,
        shifts: a.data.shifts,
        storeCredits: a.data.storeCredits,
        interactionPairs: a.data.interactionPairs ?? [],
        coldChainLog: a.data.coldChainLog ?? [],
        coupons: a.data.coupons ?? [],
        categories: a.data.categories ?? CATEGORIES_FALLBACK,
        branches: a.data.branches ?? BRANCHES_FALLBACK,
      };
    }

    case "BACKEND_OFFLINE":
      return { ...state, backendOffline: true };

    case "SHIFT_OPEN": {
      if (!state.user) return state;
      const terminalId = a.terminalId || `T-${String(state.shifts.length + 1).padStart(2, "0")}`;
      const shift = createShift(terminalId, state.user.id, state.user.name, a.openingBalance, Date.now());
      return withToast(withAudit({ ...state, shifts: [...state.shifts, shift], currentShift: shift }, "shift", `Shift ${shift.id} opened by ${state.user.name}`), "success", `Shift opened — ${terminalId}`);
    }

    case "SHIFT_CLOSE": {
      if (!state.currentShift) return state;
      const closed = closeShift(state.currentShift, a.countedCash, a.notes, Date.now());
      const updatedShifts = state.shifts.map(s => s.id === closed.id ? closed : s);
      return withToast(withAudit({ ...state, shifts: updatedShifts, currentShift: null }, "shift", `Shift ${closed.id} closed — over/short: ${closed.overShort?.toFixed(2)}`), "info", `Shift closed — ${closed.overShort! >= 0 ? "over" : "short"} $${Math.abs(closed.overShort!).toFixed(2)}`);
    }

    case "SHIFT_CASH_MOVEMENT": {
      if (!state.currentShift || !state.user) return state;
      const managerRoles: Role[] = ["manager", "pharmacy_admin", "super_admin"];
      const needsApproval = a.amount > 100 && !managerRoles.includes(state.user.role);
      if (needsApproval && !a.approvedBy) return withToast(state, "error", "Manager approval required for large amounts");
      
      const updated = recordCashMovement(state.currentShift, a.movementType, a.amount, a.reason, state.user.name, a.approvedBy);
      const updatedShifts = state.shifts.map(s => s.id === updated.id ? updated : s);
      return withToast(withAudit({ ...state, shifts: updatedShifts, currentShift: updated }, "cash", `${a.movementType.replace("_", " ")} $${a.amount.toFixed(2)} — ${a.reason}`), "success", `${a.movementType.replace("_", " ").toUpperCase()} recorded`);
    }

    case "VOID_TX": {
      /* voids require the same approval as refunds (manager / pharmacy admin) (Phase A) */
      if (!can(state.user?.role, "refund")) return withToast(state, "error", "Manager approval required for voids");

      const tx = state.transactions.find(t => t.id === a.txId);
      if (!tx) return state;
      
      // Mark transaction as voided in the transactions list
      const updatedTransactions = state.transactions.map(t => 
        t.id === a.txId ? { ...t, voidedAt: Date.now(), voidReason: a.reason, voidedBy: a.approvedBy || state.user?.name } : t
      );
      
      // Record in shift if there's an open shift
      let newState: State = { ...state, transactions: updatedTransactions };
      if (state.currentShift) {
        const tenderType: TenderType = tx.method === "insurance" ? "insurance" : tx.method === "card" ? "card" : tx.method === "cash" ? "cash" : "store_credit";
        const updated = recordShiftTransaction(state.currentShift, tx, "void", tenderType, a.reason, a.approvedBy);
        const updatedShifts = state.shifts.map(s => s.id === updated.id ? updated : s);
        newState = { ...newState, shifts: updatedShifts, currentShift: updated };
      }
      
      return withToast(withAudit(newState, "void", `Transaction ${a.txId} voided by ${state.user?.name ?? "unknown"} — ${a.reason}`), "warn", "Transaction voided");
    }

    case "GENERATE_X_REPORT": {
      const shift = state.shifts.find(s => s.id === a.shiftId);
      if (!shift) return state;
      const report = generateXReport(shift);
      // In a real app, this would show a modal or navigate to a report view
      return withToast(state, "info", `X Report generated for shift ${shift.id}`);
    }

    case "GENERATE_Z_REPORT": {
      const shift = state.shifts.find(s => s.id === a.shiftId);
      if (!shift || shift.status !== "closed") return state;
      const report = generateZReport(shift);
      if (!report) return state;
      // In a real app, this would show a modal or navigate to a report view
      return withToast(withAudit(state, "report", `Z Report generated for shift ${shift.id}`), "success", `Z Report generated — ${report.overShort >= 0 ? "over" : "short"} $${Math.abs(report.overShort).toFixed(2)}`);
    }

    default:
      return state;
  }
}

interface Ctx {
  state: State;
  dispatch: Dispatch<Action>;
  product: (id: string) => Product | undefined;
  prescriber: (id: string) => Prescriber | undefined;
  supplier: (id: string) => Supplier | undefined;
  lowStock: Product[];
  expiring: Product[];
  newRx: number;
  todayStats: { revenue: number; count: number; avg: number; items: number };
  money: (n: number) => string;
}

const PosCtx = createContext<Ctx | null>(null);

const backendDataFromState = (state: State): BackendData => ({
  products: state.products,
  transactions: state.transactions,
  prescriptions: state.prescriptions,
  prescribers: state.prescribers,
  customers: state.customers,
  transfers: state.transfers,
  backorders: state.backorders,
  rxTransfers: state.rxTransfers,
  suppliers: state.suppliers,
  purchaseOrders: state.purchaseOrders,
  apInvoices: state.apInvoices,
  expenses: state.expenses,
  deliveries: state.deliveries,
  webOrders: state.webOrders,
  timeEntries: state.timeEntries,
  staff: state.staff,
  settings: state.settings,
  restrictedLog: state.restrictedLog,
  audit: state.audit,
  shifts: state.shifts,
  storeCredits: state.storeCredits,
  snapshots: listSnapshots(),
  interactionPairs: state.interactionPairs ?? [],
  coldChainLog: state.coldChainLog ?? [],
  coupons: state.coupons ?? [],
  categories: state.categories ?? [],
  branches: state.branches ?? [],
});

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const stateRef = useRef(state);
  const hydratedRef = useRef(false);
  const hydrationInFlightRef = useRef(false);
  const skipPersistRef = useRef(false);
  const realtimeReloadRef = useRef<Promise<void> | null>(null);
  const realtimeQueuedRef = useRef(false);
  const previousUserRef = useRef(state.user);
  stateRef.current = state;

  useEffect(() => {
    if (previousUserRef.current && !state.user) void signOutStaff();
    previousUserRef.current = state.user;
  }, [state.user]);

  /* Keep the seed/localStorage path immediate; RLS-backed hydration starts after Supabase auth.
   * On reboot, load() restores the user but backendAuthenticated is false — recover the still-live
   * Supabase session here so a page refresh hydrates from the DB instead of falling back to seed. */
  useEffect(() => {
    if (state.backendAuthenticated) return;
    let cancelled = false;
    void getSessionStaffId().then((staffId) => {
      if (!cancelled && staffId && staffId === state.user?.id) {
        dispatch({ type: "BACKEND_AUTH", staffId, authenticated: true });
      } else if (!cancelled && staffId && !state.user) {
        // Session belongs to someone but local user is missing — rehydrate user from staff list.
        const staff = state.staff.find((s) => s.id === staffId && s.active);
        if (staff) {
          dispatch({ type: "LOGIN", staffId });
          dispatch({ type: "BACKEND_AUTH", staffId, authenticated: true });
        }
      }
    });
    return () => { cancelled = true; };
  }, [state.backendAuthenticated, state.user?.id, state.staff]);

  /* Keep the seed/localStorage path immediate; RLS-backed hydration starts after Supabase auth. */
  useEffect(() => {
    if (!state.backendAuthenticated) {
      hydratedRef.current = false;
      hydrationInFlightRef.current = false;
      skipPersistRef.current = false;
      return;
    }
    let active = true;
    hydrationInFlightRef.current = true;
    const hydrate = async () => {
      const result = await loadBackendData(backendDataFromState(stateRef.current));
      if (!active) return;
      if (result.ok) {
        if (result.data.snapshots.length > 0) writeSnapshots(result.data.snapshots);
        skipPersistRef.current = true;
        hydratedRef.current = true;
        hydrationInFlightRef.current = false;
        dispatch({ type: "HYDRATE_BACKEND", data: result.data });
      } else {
        // Failed load or empty tenant
        hydrationInFlightRef.current = false;
        dispatch({ type: "BACKEND_OFFLINE" });
      }
    };
    void hydrate();
    return () => { active = false; };
  }, [state.backendAuthenticated]);

  /* Subscribe only while authenticated, then reload the full snapshot on any table change. */
  useEffect(() => {
    if (!state.backendAuthenticated) return;
    const reload = async () => {
      if (realtimeReloadRef.current) {
        realtimeQueuedRef.current = true;
        return;
      }
      const run = async () => {
        const result = await loadBackendData(backendDataFromState(stateRef.current));
        if (result.ok) {
          if (result.data.snapshots.length > 0) writeSnapshots(result.data.snapshots);
          skipPersistRef.current = true;
          dispatch({ type: "HYDRATE_BACKEND", data: result.data });
        } else {
          dispatch({ type: "BACKEND_OFFLINE" });
        }
      };
      const pending = run().finally(() => {
        realtimeReloadRef.current = null;
        if (realtimeQueuedRef.current) {
          realtimeQueuedRef.current = false;
          void reload();
        }
      });
      realtimeReloadRef.current = pending;
      await pending;
    };
    return subscribeToBackend(() => { void reload(); });
  }, [state.backendAuthenticated]);

  /* Persist only reducer-owned backend data. Session/UI fields never enter this payload. */
  useEffect(() => {
    if (!hydratedRef.current || hydrationInFlightRef.current || !state.backendAuthenticated) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    void persistBackendData(backendDataFromState(state));
  }, [state.backendAuthenticated, state.products, state.transactions, state.prescriptions, state.prescribers, state.customers,
    state.transfers, state.backorders, state.rxTransfers, state.suppliers, state.purchaseOrders,
    state.apInvoices, state.expenses, state.deliveries, state.webOrders, state.timeEntries,
    state.staff, state.settings, state.restrictedLog, state.audit, state.shifts, state.snapshotVersion, state.coldChainLog,
    state.categories, state.coupons]);

  /* track connectivity so the UI can show offline state (6.5); retry persist on reconnect (F11) */
  useEffect(() => {
    const on = () => {
      dispatch({ type: "SET_ONLINE", online: true });
      // Retry persist on reconnect: push any offline edits queued in localStorage.
      if (hydratedRef.current && stateRef.current.backendAuthenticated) {
        queueMicrotask(() => { void persistBackendData(backendDataFromState(stateRef.current)); });
      }
    };
    const off = () => dispatch({ type: "SET_ONLINE", online: false });
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  /* keep the money formatter in sync with the org currency (§8) */
  useEffect(() => { setCurrency(state.settings.currency); }, [state.settings.currency]);

  /* automated backup snapshots (§9) */
  const autoMins = state.settings.autoSnapshotMins;
  useEffect(() => {
    if (!autoMins || autoMins <= 0) return;
    const id = setInterval(() => {
      dispatch({ type: "SNAPSHOT_SAVE", label: `Auto · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, auto: true });
    }, autoMins * 60_000);
    return () => clearInterval(id);
  }, [autoMins]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        products: state.products, transactions: state.transactions.slice(0, 400),
        prescriptions: state.prescriptions, prescribers: state.prescribers,
        customers: state.customers,
        transfers: state.transfers, audit: state.audit,
        staff: state.staff, settings: state.settings, restrictedLog: state.restrictedLog,
        backorders: state.backorders, rxTransfers: state.rxTransfers,
        suppliers: state.suppliers, purchaseOrders: state.purchaseOrders,
        apInvoices: state.apInvoices, expenses: state.expenses,
        deliveries: state.deliveries, webOrders: state.webOrders, timeEntries: state.timeEntries,
        shifts: state.shifts, coldChainLog: state.coldChainLog,
      }));
    } catch { /* storage full — ignore */ }
  }, [state.products, state.transactions, state.prescriptions, state.prescribers, state.customers, state.transfers, state.audit, state.staff, state.settings, state.restrictedLog, state.backorders, state.rxTransfers, state.suppliers, state.purchaseOrders, state.apInvoices, state.expenses, state.shifts, state.coldChainLog, state.categories, state.coupons, state.branches]);

  const value = useMemo<Ctx>(() => {
    const product = (id: string) => state.products.find((p) => p.id === id);
    const prescriber = (id: string) => state.prescribers.find((p) => p.id === id);
    const supplier = (id: string) => state.suppliers.find((s) => s.id === id);
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
      state, dispatch, product, prescriber, supplier, lowStock, expiring, newRx,
      todayStats: { revenue, count: sales.length, avg: sales.length ? round2(revenue / sales.length) : 0, items },
      money,
    };
  }, [state]);

  return <PosCtx.Provider value={value}>{children}</PosCtx.Provider>;
}

export function usePos(): Ctx {
  const ctx = useContext(PosCtx);
  if (!ctx) throw new Error("usePos outside provider");
  return ctx;
}

/* currency is org-scoped (§8) — module-level so the 100+ call sites stay simple */
let CURRENCY = "USD";
export const setCurrency = (c: string) => { CURRENCY = c; };
export const money = (n: number) => {
  try { return n.toLocaleString("en-US", { style: "currency", currency: CURRENCY }); }
  catch { return `$${n.toFixed(2)}`; }
};

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
