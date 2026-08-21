import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabase";
import type {
  ApInvoice,
  AuditEntry,
  BackOrder,
  ColdChainLog,
  Customer,
  Delivery,
  Expense,
  OrgSettings,
  InteractionPair,
  Prescriber,
  Prescription,
  Product,
  PurchaseOrder,
  RestrictedLogEntry,
  RxTransfer,
  Shift,
  Snapshot,
  Staff,
  StoreCredit,
  Supplier,
  TimeEntry,
  Transaction,
  Transfer,
  WebOrder,
} from "../data";

/** The persisted part of the reducer state. UI/session-only state stays local. */
export interface BackendData {
  products: Product[];
  transactions: Transaction[];
  prescriptions: Prescription[];
  prescribers: Prescriber[];
  customers: Customer[];
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
  staff: Staff[];
  settings: OrgSettings;
  restrictedLog: RestrictedLogEntry[];
  audit: AuditEntry[];
  shifts: Shift[];
  storeCredits: StoreCredit[];
  snapshots: Snapshot[];
  interactionPairs: InteractionPair[];
  coldChainLog: ColdChainLog[];
}

type Row = Record<string, unknown>;
const TABLES = [
  "products", "transactions", "prescriptions", "prescribers", "customers", "transfers",
  "backorders", "rx_transfers", "suppliers", "purchase_orders", "ap_invoices", "expenses",
  "deliveries", "web_orders", "time_entries", "staff", "settings", "restricted_log",
  "audit_log", "shifts", "store_credits", "snapshots", "interaction_pairs", "cold_chain_log",
] as const;

type TableName = (typeof TABLES)[number];

const isRow = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const rowList = (value: unknown): Row[] => Array.isArray(value) ? value.filter(isRow) : [];
const text = (row: Row, key: string, fallback = "") => typeof row[key] === "string" ? row[key] as string : fallback;
const optionalText = (row: Row, key: string) => {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};
const numberValue = (row: Row, key: string, fallback = 0) => {
  const value = typeof row[key] === "number" || typeof row[key] === "string" ? Number(row[key]) : NaN;
  return Number.isFinite(value) ? value : fallback;
};
const optionalNumber = (row: Row, key: string) => {
  const value = numberValue(row, key, NaN);
  return Number.isFinite(value) ? value : undefined;
};
const booleanValue = (row: Row, key: string, fallback = false) => typeof row[key] === "boolean" ? row[key] as boolean : fallback;
const jsonValue = <T>(row: Row, key: string, fallback: T): T => row[key] == null ? fallback : row[key] as T;

/** Accepts both epoch milliseconds and the timestamptz strings returned by PostgREST. */
const epoch = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};
const rowEpoch = (row: Row, key: string, fallback = 0) => epoch(row[key], fallback);
const timestamp = (value: number | undefined) => value === undefined ? null : new Date(value).toISOString();
const nullable = (value: unknown) => value === undefined ? null : value;

function warn(operation: string, error: unknown): void {
  console.warn(`[sync] ${operation} failed`, error);
}

function productFrom(row: Row): Product {
  return {
    id: text(row, "id"), sku: text(row, "sku"), barcode: text(row, "barcode"), name: text(row, "name"),
    generic: text(row, "generic"), brand: text(row, "brand"), category: text(row, "category", "compound") as Product["category"],
    form: text(row, "form"), price: numberValue(row, "price"), cost: numberValue(row, "cost"),
    reorderLevel: numberValue(row, "reorder_level"), rx: booleanValue(row, "rx"), supplier: text(row, "supplier"),
    batches: jsonValue(row, "batches", []), uoms: jsonValue(row, "uoms", []), fields: jsonValue(row, "fields", []),
    kit: jsonValue(row, "kit", []), ndc: optionalText(row, "ndc"), gtin: optionalText(row, "gtin"),
    controlled: optionalText(row, "controlled") as Product["controlled"],
    restricted: jsonValue(row, "restricted", undefined), genericOf: optionalText(row, "generic_of"),
    variantOf: optionalText(row, "variant_of"), compound: booleanValue(row, "compound"), coldChain: booleanValue(row, "cold_chain"),
  };
}

function transactionFrom(row: Row): Transaction {
  return {
    id: text(row, "id"), at: rowEpoch(row, "at"), lines: jsonValue(row, "lines", []), subtotal: numberValue(row, "subtotal"),
    discount: numberValue(row, "discount"), tax: numberValue(row, "tax"), total: numberValue(row, "total"),
    method: text(row, "method", "cash") as Transaction["method"], cashier: text(row, "cashier"),
    tendered: optionalNumber(row, "tendered"), change: optionalNumber(row, "change"),
    ...(row.payments !== undefined ? { payments: jsonValue(row, "payments", []) } : {}),
    refundOf: optionalText(row, "refund_of"), customerId: optionalText(row, "customer_id"), reason: optionalText(row, "reason"),
    refundedAt: optionalNumber(row, "refunded_at"), taxExempt: booleanValue(row, "tax_exempt"), bulkSavings: optionalNumber(row, "bulk_savings"),
    loyaltyDeduct: optionalNumber(row, "loyalty_deduct"), pointsEarned: optionalNumber(row, "points_earned"), pointsRedeemed: optionalNumber(row, "points_redeemed"),
  };
}

function prescriptionFrom(row: Row): Prescription {
  return {
    id: text(row, "id"), patient: text(row, "patient"), age: numberValue(row, "age"), productId: text(row, "product_id"),
    qty: numberValue(row, "qty", 1), prescriberId: text(row, "prescriber_id"), status: text(row, "status", "new") as Prescription["status"],
    createdAt: rowEpoch(row, "created_at_tx"), note: optionalText(row, "note"), daysSupply: optionalNumber(row, "days_supply"),
    refillsAuthorized: optionalNumber(row, "refills_authorized"), refillsRemaining: optionalNumber(row, "refills_remaining"),
    rxExpiry: optionalText(row, "rx_expiry"), phone: optionalText(row, "phone"), insurance: jsonValue(row, "insurance", undefined),
    pa: jsonValue(row, "pa", undefined), notifiedAt: optionalNumber(row, "notified_at"), dispensedAt: optionalNumber(row, "dispensed_at"),
    remindedAt: optionalNumber(row, "reminded_at"), scan: optionalText(row, "scan"), scanAt: optionalNumber(row, "scan_at"),
    transferredOut: jsonValue(row, "transferred_out", undefined),
  };
}

function interactionPairFrom(row: Row): InteractionPair {
  return {
    a: text(row, "a"), b: text(row, "b"),
    severity: (text(row, "severity", "moderate") as InteractionPair["severity"]) || "moderate",
    effect: text(row, "effect"), action: text(row, "action"),
  };
}

function prescriberFrom(row: Row): Prescriber {
  return {
    id: text(row, "id"), name: text(row, "name"), credentials: text(row, "credentials"), specialty: text(row, "specialty"),
    npi: text(row, "npi"), dea: text(row, "dea"), phone: text(row, "phone"), fax: text(row, "fax"), active: booleanValue(row, "active", true),
  };
}

function customerFrom(row: Row): Customer {
  return {
    id: text(row, "id"), name: text(row, "name"), phone: text(row, "phone"), email: optionalText(row, "email"),
    createdAt: rowEpoch(row, "created_at_tx"), notes: optionalText(row, "notes"), points: numberValue(row, "points"),
    allergies: jsonValue(row, "allergies", []), dob: optionalText(row, "dob"), gender: optionalText(row, "gender") as Customer["gender"],
    address: optionalText(row, "address"), bloodType: optionalText(row, "blood_type"),
    primaryPrescriberId: optionalText(row, "primary_prescriber_id"), insurancePlan: optionalText(row, "insurance_plan"),
    clinicalNotes: optionalText(row, "clinical_notes"), taxExempt: booleanValue(row, "tax_exempt"), fields: jsonValue(row, "fields", []),
  };
}

function transferFrom(row: Row): Transfer {
  return {
    id: text(row, "id"), productId: text(row, "product_id"), qty: numberValue(row, "qty", 1), toBranch: text(row, "to_branch"),
    status: text(row, "status", "requested") as Transfer["status"], createdAt: rowEpoch(row, "created_at"),
    requestedBy: text(row, "requested_by"), note: optionalText(row, "note"),
  };
}

function backorderFrom(row: Row): BackOrder {
  return {
    id: text(row, "id"), patient: text(row, "patient"), phone: optionalText(row, "phone"), productId: text(row, "product_id"),
    qty: numberValue(row, "qty", 1), createdAt: rowEpoch(row, "created_at"), status: text(row, "status", "ordered") as BackOrder["status"],
    etaDays: numberValue(row, "eta_days"), supplier: text(row, "supplier"), arrivedAt: optionalNumber(row, "arrived_at"), notifiedAt: optionalNumber(row, "notified_at"),
  };
}

function rxTransferFrom(row: Row): RxTransfer {
  return {
    id: text(row, "id"), transferNo: text(row, "transfer_no"), direction: text(row, "direction", "out") as RxTransfer["direction"],
    patient: text(row, "patient"), drug: text(row, "drug"), qty: numberValue(row, "qty"), otherPharmacy: text(row, "other_pharmacy"),
    otherPhone: text(row, "other_phone"), prescriber: text(row, "prescriber"), refillsRemaining: numberValue(row, "refills_remaining"),
    pharmacist: text(row, "pharmacist"), at: rowEpoch(row, "at"), note: optionalText(row, "note"),
    prescriptionId: optionalText(row, "prescription_id"),
  };
}

function supplierFrom(row: Row): Supplier {
  return {
    id: text(row, "id"), name: text(row, "name"), contact: text(row, "contact"), phone: text(row, "phone"), email: optionalText(row, "email"),
    terms: numberValue(row, "terms", 30), leadDays: numberValue(row, "lead_days", 7), minOrder: numberValue(row, "min_order"),
    priceBook: jsonValue(row, "price_book", []),
  };
}

function purchaseOrderFrom(row: Row): PurchaseOrder {
  return {
    id: text(row, "id"), supplierId: text(row, "supplier_id"), lines: jsonValue(row, "lines", []),
    status: text(row, "status", "ordered") as PurchaseOrder["status"], createdAt: rowEpoch(row, "created_at"),
    expectedAt: rowEpoch(row, "expected_at"), receivedAt: optionalNumber(row, "received_at"), invoiceId: optionalText(row, "invoice_id"), note: optionalText(row, "note"),
  };
}

function apInvoiceFrom(row: Row): ApInvoice {
  return {
    id: text(row, "id"), number: text(row, "number"), supplierId: text(row, "supplier_id"), poId: optionalText(row, "po_id"),
    date: rowEpoch(row, "date"), dueDays: numberValue(row, "due_days", 30), total: numberValue(row, "total"),
    payments: jsonValue(row, "payments", []), credits: jsonValue(row, "credits", []),
  };
}

function expenseFrom(row: Row): Expense {
  return {
    id: text(row, "id"), category: text(row, "category", "Misc"), amount: numberValue(row, "amount"), date: rowEpoch(row, "date"),
    payee: text(row, "payee"), note: optionalText(row, "note"), recurring: booleanValue(row, "recurring"),
  };
}

function deliveryFrom(row: Row): Delivery {
  return {
    id: text(row, "id"), customerId: text(row, "customer_id"), address: text(row, "address"), lines: jsonValue(row, "lines", []),
    fee: numberValue(row, "fee"), mode: text(row, "mode", "delivery") as Delivery["mode"], status: text(row, "status", "queued") as Delivery["status"],
    driver: optionalText(row, "driver"), scheduledAt: rowEpoch(row, "scheduled_at"), proof: optionalText(row, "proof"), createdAt: rowEpoch(row, "created_at"),
  };
}

function webOrderFrom(row: Row): WebOrder {
  return {
    id: text(row, "id"), customerName: text(row, "customer_name"), phone: text(row, "phone"), items: jsonValue(row, "items", []),
    type: text(row, "type", "otc") as WebOrder["type"], channel: text(row, "channel", "web") as WebOrder["channel"],
    pickup: text(row, "pickup", "in_store") as WebOrder["pickup"], status: text(row, "status", "new") as WebOrder["status"],
    note: optionalText(row, "note"), declineReason: optionalText(row, "decline_reason"), createdAt: rowEpoch(row, "created_at"),
  };
}

function staffFrom(row: Row): Staff {
  return {
    id: text(row, "id"), name: text(row, "name"), role: text(row, "role", "cashier") as Staff["role"],
    pinHash: text(row, "pin_hash"), initials: text(row, "initials"), active: booleanValue(row, "active", true), createdAt: rowEpoch(row, "created_at"),
  };
}

function settingsFrom(row: Row | undefined, fallback: OrgSettings): OrgSettings {
  if (!row) return fallback;
  return {
    orgName: text(row, "org_name", fallback.orgName), branch: text(row, "branch", fallback.branch), address: text(row, "address", fallback.address),
    phone: text(row, "phone", fallback.phone), license: text(row, "license", fallback.license), currency: text(row, "currency", fallback.currency),
    receiptFooter: text(row, "receipt_footer", fallback.receiptFooter), receiptTerms: text(row, "receipt_terms", fallback.receiptTerms),
    showBarcode: booleanValue(row, "show_barcode", fallback.showBarcode), loyalty: jsonValue(row, "loyalty", fallback.loyalty),
    scanBeep: booleanValue(row, "scan_beep", fallback.scanBeep), idleLockMins: numberValue(row, "idle_lock_mins", fallback.idleLockMins),
    autoSnapshotMins: numberValue(row, "auto_snapshot_mins", fallback.autoSnapshotMins), terminalId: text(row, "terminal_id", fallback.terminalId),
    hardwareEnabled: booleanValue(row, "hardware_enabled", fallback.hardwareEnabled),
  };
}

function restrictedFrom(row: Row): RestrictedLogEntry {
  return {
    id: numberValue(row, "id"), at: rowEpoch(row, "at"), productId: text(row, "product_id"), qty: numberValue(row, "qty", 1),
    purchaser: text(row, "purchaser"), idType: text(row, "id_type"), idLast4: text(row, "id_last4"), cashier: text(row, "cashier"),
  };
}

function auditFrom(row: Row): AuditEntry {
  return { id: numberValue(row, "id"), at: rowEpoch(row, "at"), actor: text(row, "actor"), kind: text(row, "kind", "system") as AuditEntry["kind"], detail: text(row, "detail") };
}

function shiftFrom(row: Row): Shift {
  return {
    id: text(row, "id"), terminalId: text(row, "terminal_id"), cashierId: text(row, "cashier_id"), cashierName: text(row, "cashier_name"),
    openedAt: rowEpoch(row, "opened_at"), closedAt: optionalNumber(row, "closed_at"), status: text(row, "status", "open") as Shift["status"],
    openingBalance: numberValue(row, "opening_balance"), closingBalance: optionalNumber(row, "closing_balance"), countedCash: optionalNumber(row, "counted_cash"),
    transactions: jsonValue(row, "transactions", []), cashMovements: jsonValue(row, "cash_movements", []), salesTotal: numberValue(row, "sales_total"),
    refundsTotal: numberValue(row, "refunds_total"), cardTotal: numberValue(row, "card_total"), insuranceTotal: numberValue(row, "insurance_total"),
    storeCreditTotal: numberValue(row, "store_credit_total"), paidInTotal: numberValue(row, "paid_in_total"), paidOutTotal: numberValue(row, "paid_out_total"),
    expectedCash: numberValue(row, "expected_cash"), overShort: optionalNumber(row, "over_short"), notes: optionalText(row, "notes"),
  };
}

function storeCreditFrom(row: Row): StoreCredit {
  return {
    id: text(row, "id"), customerId: optionalText(row, "customer_id") ?? null, balance: numberValue(row, "balance"),
    issuedAt: rowEpoch(row, "issued_at"), expiresAt: optionalNumber(row, "expires_at"), code: optionalText(row, "code"), note: optionalText(row, "note"),
  };
}

function snapshotFrom(row: Row): Snapshot {
  return {
    meta: { id: text(row, "id"), at: rowEpoch(row, "at"), label: text(row, "label"), auto: booleanValue(row, "auto") },
    data: jsonValue(row, "data", {}),
  };
}

function coldChainLogFrom(row: Row): ColdChainLog {
  return {
    id: text(row, "id"), productId: text(row, "product_id"), tempC: numberValue(row, "temp_c"),
    inRange: booleanValue(row, "in_range", true), staff: optionalText(row, "staff"), note: optionalText(row, "note"),
    at: rowEpoch(row, "created_at"),
  };
}

function rowsFor(data: BackendData): Record<TableName, Row[]> {
  return {
    products: data.products.map((p) => ({
      id: p.id, sku: p.sku, barcode: p.barcode, name: p.name, generic: p.generic, brand: p.brand, category: p.category, form: p.form,
      price: p.price, cost: p.cost, reorder_level: p.reorderLevel, rx: p.rx, supplier: p.supplier, batches: p.batches, uoms: p.uoms ?? [],
      fields: p.fields ?? [], kit: p.kit ?? [], ndc: nullable(p.ndc), gtin: nullable(p.gtin), controlled: nullable(p.controlled), restricted: nullable(p.restricted),
      generic_of: nullable(p.genericOf), variant_of: nullable(p.variantOf), compound: p.compound ?? false, cold_chain: p.coldChain ?? false,
    })),
    transactions: data.transactions.map((t) => ({
      id: t.id, at: t.at, lines: t.lines, subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total, method: t.method, cashier: t.cashier,
      tendered: nullable(t.tendered), change: nullable(t.change), refund_of: nullable(t.refundOf), customer_id: nullable(t.customerId), reason: nullable(t.reason), refunded_at: nullable(t.refundedAt),
      payments: t.payments ?? [], tax_exempt: t.taxExempt ?? false, bulk_savings: nullable(t.bulkSavings), loyalty_deduct: nullable(t.loyaltyDeduct),
      points_earned: nullable(t.pointsEarned), points_redeemed: nullable(t.pointsRedeemed),
    })),
    prescriptions: data.prescriptions.map((p) => ({
      id: p.id, patient: p.patient, age: p.age, product_id: p.productId, qty: p.qty, prescriber_id: p.prescriberId, status: p.status,
      created_at_tx: timestamp(p.createdAt), note: nullable(p.note), days_supply: nullable(p.daysSupply), refills_authorized: nullable(p.refillsAuthorized),
      refills_remaining: nullable(p.refillsRemaining), rx_expiry: nullable(p.rxExpiry), phone: nullable(p.phone), insurance: nullable(p.insurance), pa: nullable(p.pa),
      notified_at: nullable(p.notifiedAt), dispensed_at: nullable(p.dispensedAt),
      reminded_at: nullable(p.remindedAt), scan: nullable(p.scan), scan_at: nullable(p.scanAt), transferred_out: nullable(p.transferredOut),
    })),
    prescribers: data.prescribers.map((p) => ({ id: p.id, name: p.name, credentials: p.credentials, specialty: p.specialty, npi: nullable(p.npi), dea: nullable(p.dea), phone: nullable(p.phone), fax: nullable(p.fax), active: p.active })),
    customers: data.customers.map((c) => ({
      id: c.id, name: c.name, phone: c.phone, email: nullable(c.email), created_at_tx: timestamp(c.createdAt), notes: nullable(c.notes), points: c.points,
      allergies: c.allergies ?? [], dob: nullable(c.dob), gender: nullable(c.gender), address: nullable(c.address), blood_type: nullable(c.bloodType),
      primary_prescriber_id: nullable(c.primaryPrescriberId), insurance_plan: nullable(c.insurancePlan), clinical_notes: nullable(c.clinicalNotes),
      tax_exempt: c.taxExempt ?? false, fields: c.fields ?? [],
    })),
    transfers: data.transfers.map((t) => ({ id: t.id, product_id: t.productId, qty: t.qty, to_branch: t.toBranch, status: t.status, created_at: t.createdAt, requested_by: t.requestedBy, note: nullable(t.note) })),
    backorders: data.backorders.map((b) => ({ id: b.id, patient: b.patient, phone: nullable(b.phone), product_id: b.productId, qty: b.qty, created_at: b.createdAt, status: b.status, eta_days: b.etaDays, supplier: b.supplier, arrived_at: nullable(b.arrivedAt), notified_at: nullable(b.notifiedAt) })),
    rx_transfers: data.rxTransfers.map((r) => ({ id: r.id, transfer_no: r.transferNo, direction: r.direction, prescription_id: nullable(r.prescriptionId), patient: r.patient, drug: r.drug, qty: r.qty, other_pharmacy: r.otherPharmacy, other_phone: nullable(r.otherPhone), prescriber: r.prescriber, refills_remaining: r.refillsRemaining, pharmacist: r.pharmacist, at: r.at, note: nullable(r.note) })),
    suppliers: data.suppliers.map((s) => ({ id: s.id, name: s.name, contact: nullable(s.contact), phone: nullable(s.phone), email: nullable(s.email), terms: s.terms, lead_days: s.leadDays, min_order: s.minOrder, price_book: s.priceBook ?? [] })),
    purchase_orders: data.purchaseOrders.map((p) => ({ id: p.id, supplier_id: nullable(p.supplierId), lines: p.lines, status: p.status, created_at: p.createdAt, expected_at: p.expectedAt, received_at: nullable(p.receivedAt), invoice_id: nullable(p.invoiceId), note: nullable(p.note) })),
    ap_invoices: data.apInvoices.map((i) => ({ id: i.id, number: i.number, supplier_id: nullable(i.supplierId), po_id: nullable(i.poId), date: i.date, due_days: i.dueDays, total: i.total, payments: i.payments, credits: i.credits })),
    expenses: data.expenses.map((e) => ({ id: e.id, category: e.category, amount: e.amount, date: e.date, payee: e.payee, note: nullable(e.note), recurring: e.recurring ?? false })),
    deliveries: data.deliveries.map((d) => ({ id: d.id, customer_id: nullable(d.customerId), address: d.address, lines: d.lines, fee: d.fee, mode: d.mode, status: d.status, driver: nullable(d.driver), scheduled_at: d.scheduledAt, proof: nullable(d.proof), created_at: d.createdAt })),
    web_orders: data.webOrders.map((o) => ({ id: o.id, customer_name: o.customerName, phone: o.phone, items: o.items, type: o.type, channel: o.channel, pickup: o.pickup, status: o.status, note: nullable(o.note), decline_reason: nullable(o.declineReason), created_at: o.createdAt })),
    time_entries: data.timeEntries.map((t) => ({ id: t.id, staff_id: nullable(t.staffId), in_at: t.inAt, out_at: nullable(t.outAt) })),
    staff: data.staff.map((s) => ({ id: s.id, name: s.name, role: s.role, pin_hash: s.pinHash, initials: s.initials, active: s.active, created_at: timestamp(s.createdAt) })),
    settings: [{ id: 1, org_name: data.settings.orgName, branch: data.settings.branch, address: data.settings.address, phone: data.settings.phone, license: data.settings.license, currency: data.settings.currency, receipt_footer: data.settings.receiptFooter, receipt_terms: data.settings.receiptTerms, show_barcode: data.settings.showBarcode, loyalty: data.settings.loyalty, scan_beep: data.settings.scanBeep, idle_lock_mins: data.settings.idleLockMins, auto_snapshot_mins: data.settings.autoSnapshotMins, terminal_id: data.settings.terminalId, hardware_enabled: data.settings.hardwareEnabled }],
    restricted_log: data.restrictedLog.map((r) => ({ id: r.id, at: r.at, product_id: nullable(r.productId), qty: r.qty, purchaser: r.purchaser, id_type: r.idType, id_last4: r.idLast4, cashier: r.cashier })),
    audit_log: data.audit.map((a) => ({ id: a.id, at: a.at, actor: a.actor, kind: a.kind, detail: a.detail })),
    shifts: data.shifts.map((s) => ({ id: s.id, terminal_id: s.terminalId, cashier_id: nullable(s.cashierId), cashier_name: s.cashierName, opened_at: s.openedAt, closed_at: nullable(s.closedAt), status: s.status, opening_balance: s.openingBalance, closing_balance: nullable(s.closingBalance), counted_cash: nullable(s.countedCash), transactions: s.transactions, cash_movements: s.cashMovements, sales_total: s.salesTotal, refunds_total: s.refundsTotal, card_total: s.cardTotal, insurance_total: s.insuranceTotal, store_credit_total: s.storeCreditTotal, paid_in_total: s.paidInTotal, paid_out_total: s.paidOutTotal, expected_cash: s.expectedCash, over_short: nullable(s.overShort), notes: nullable(s.notes) })),
    store_credits: data.storeCredits.map((c) => ({ id: c.id, customer_id: nullable(c.customerId), balance: c.balance, issued_at: c.issuedAt, expires_at: nullable(c.expiresAt), code: nullable(c.code), note: nullable(c.note) })),
    snapshots: data.snapshots.map((s) => ({ id: s.meta.id, at: s.meta.at, label: s.meta.label, auto: s.meta.auto, data: s.data })),
    interaction_pairs: data.interactionPairs.map((i) => ({ a: i.a, b: i.b, severity: i.severity, effect: i.effect, action: i.action })),
    cold_chain_log: data.coldChainLog.map((c) => ({ id: c.id, product_id: c.productId, temp_c: c.tempC, in_range: c.inRange, staff: nullable(c.staff), note: nullable(c.note), created_at: timestamp(c.at) })),
  };
}

async function readTable(client: SupabaseClient, table: TableName): Promise<{ table: TableName; rows: Row[]; error: unknown }> {
  try {
    const { data, error } = await client.from(table).select("*");
    return { table, rows: rowList(data), error };
  } catch (error) {
    return { table, rows: [], error };
  }
}

/** Result type for loadBackendData: distinguishes real backend data from seed fallback. */
export type LoadResult =
  | { ok: true; data: BackendData }
  | { ok: false; failedTable: string | null }; // null = empty tenant, otherwise the table that failed

/** Load all backend collections; returns explicit success/failure signal. */
export async function loadBackendData(seed: BackendData): Promise<LoadResult> {
  if (!isSupabaseConfigured) return { ok: false, failedTable: null };
  const results = await Promise.all(TABLES.map((table) => readTable(supabase, table)));
  const failed = results.find((result) => result.error);
  if (failed) {
    warn(`load ${failed.table}`, failed.error);
    return { ok: false, failedTable: failed.table };
  }
  const byTable = Object.fromEntries(results.map((result) => [result.table, result.rows])) as Record<TableName, Row[]>;
  if (byTable.products.length === 0 && byTable.customers.length === 0 && byTable.staff.length === 0) {
    // Empty tenant is a real state — do NOT auto-write demo seed.
    return { ok: false, failedTable: null };
  }
  try {
    return {
      ok: true,
      data: {
        products: byTable.products.map(productFrom), transactions: byTable.transactions.map(transactionFrom), prescriptions: byTable.prescriptions.map(prescriptionFrom),
        prescribers: byTable.prescribers.map(prescriberFrom), customers: byTable.customers.map(customerFrom), transfers: byTable.transfers.map(transferFrom),
        backorders: byTable.backorders.map(backorderFrom), rxTransfers: byTable.rx_transfers.map(rxTransferFrom), suppliers: byTable.suppliers.map(supplierFrom),
        purchaseOrders: byTable.purchase_orders.map(purchaseOrderFrom), apInvoices: byTable.ap_invoices.map(apInvoiceFrom), expenses: byTable.expenses.map(expenseFrom),
        deliveries: byTable.deliveries.map(deliveryFrom), webOrders: byTable.web_orders.map(webOrderFrom),
        timeEntries: byTable.time_entries.map((row) => ({ id: numberValue(row, "id"), staffId: text(row, "staff_id"), inAt: rowEpoch(row, "in_at"), outAt: optionalNumber(row, "out_at") })),
        staff: byTable.staff.map(staffFrom), settings: settingsFrom(byTable.settings[0], seed.settings), restrictedLog: byTable.restricted_log.map(restrictedFrom),
        audit: byTable.audit_log.map(auditFrom), shifts: byTable.shifts.map(shiftFrom), storeCredits: byTable.store_credits.map(storeCreditFrom), snapshots: byTable.snapshots.map(snapshotFrom),
        interactionPairs: byTable.interaction_pairs.map(interactionPairFrom), coldChainLog: byTable.cold_chain_log.map(coldChainLogFrom),
      },
    };
  } catch (error) {
    warn("hydrate backend data", error);
    return { ok: false, failedTable: null };
  }
}

/** Upsert each collection independently so one bad row/table cannot stop other writes. */
export async function persistBackendData(data: BackendData): Promise<void> {
  if (!isSupabaseConfigured) return;
  let payload: Record<TableName, Row[]>;
  try {
    payload = rowsFor(data);
  } catch (error) {
    warn("serialize backend data", error);
    return;
  }
  await Promise.all(TABLES.map(async (table) => {
    if (payload[table].length === 0) return undefined;
    try {
      const { error } = await supabase.from(table).upsert(payload[table]);
      if (error) warn(`persist ${table}`, error);
    } catch (error) {
      warn(`persist ${table}`, error);
    }
    return undefined;
  }));
}

/** Subscribe to public-table changes and reload once RLS access becomes available. */
export function subscribeToBackend(onChange: (source: TableName | "auth") => void): () => void {
  if (!isSupabaseConfigured) return () => undefined;
  try {
    const notify = (source: TableName | "auth") => {
      try {
        onChange(source);
      } catch (error) {
        warn("realtime callback", error);
      }
    };
    const channel = supabase
      .channel("counterrx-backend")
      .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
        if ((TABLES as readonly string[]).includes(payload.table)) notify(payload.table as TableName);
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") warn("realtime subscription", status);
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") queueMicrotask(() => notify("auth"));
    });
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      subscription.unsubscribe();
      void supabase.removeChannel(channel).catch((error) => warn("realtime cleanup", error));
    };
  } catch (error) {
    warn("realtime subscription", error);
    return () => undefined;
  }
}

/** Sign in using the deterministic staff credentials defined by supabase/seed.sql. */
export async function signInStaff(staffId: string, pin: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const compactId = staffId.replace(/-/g, "").toUpperCase();
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: `${compactId.toLowerCase()}@counterrx.local`,
      password: `CRx${compactId}${pin}`,
    });
    if (error) {
      warn("staff sign-in", error.message);
      return false;
    }
    return true;
  } catch (error) {
    warn("staff sign-in", error);
    return false;
  }
}

export async function signOutStaff(): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) warn("staff sign-out", error.message);
  } catch (error) {
    warn("staff sign-out", error);
  }
}
