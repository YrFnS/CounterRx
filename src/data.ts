import { parseISO } from "date-fns";
/* ------------------------------------------------------------------ */
/*  CounterRx — data model, seed catalog & helpers                     */
/* ------------------------------------------------------------------ */

export type CategoryId =
  | "antibiotics" | "pain" | "coldflu" | "vitamins" | "diabetes"
  | "cardio" | "derma" | "devices" | "firstaid" | "baby" | "cns" | "compound";

export interface Category {
  id: string;          // slug stored on products.category
  label: string;
  color: string;
  groupId: string;
  sort: number;
  archived: boolean;
  parentId?: string;   // W2.1 — nested under another category (depth ≤ 2)
}

export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  active: boolean;
  sort: number;
}

/** Fallback list used before hydration / offline (mirrors the DB seed). */
export const CATEGORIES_FALLBACK: Category[] = [
  { id: "antibiotics", label: "Antibiotics", color: "#c24a2e", groupId: "acute", sort: 1, archived: false },
  { id: "pain", label: "Pain relief", color: "#e0a63c", groupId: "chronic", sort: 2, archived: false },
  { id: "coldflu", label: "Cold & flu", color: "#5da184", groupId: "acute", sort: 3, archived: false },
  { id: "vitamins", label: "Vitamins", color: "#7d9c5a", groupId: "selfcare", sort: 4, archived: false },
  { id: "diabetes", label: "Diabetes", color: "#4f7d9e", groupId: "chronic", sort: 5, archived: false },
  { id: "cardio", label: "Cardio", color: "#a05a79", groupId: "chronic", sort: 6, archived: false },
  { id: "derma", label: "Skin care", color: "#c98d5f", groupId: "selfcare", sort: 7, archived: false },
  { id: "devices", label: "Devices", color: "#5c6b66", groupId: "technical", sort: 8, archived: false },
  { id: "firstaid", label: "First aid", color: "#b8543f", groupId: "acute", sort: 9, archived: false },
  { id: "baby", label: "Baby care", color: "#8a7fb5", groupId: "selfcare", sort: 10, archived: false },
  { id: "cns", label: "CNS & sleep", color: "#6b7f8c", groupId: "chronic", sort: 11, archived: false },
  { id: "compound", label: "Compounds", color: "#8a6fae", groupId: "technical", sort: 12, archived: false },
  { id: "analgesics", label: "Analgesics", color: "#e0a63c", groupId: "acute", sort: 13, archived: false, parentId: "pain" },
];

/* Legacy shape kept for the offline fallback consumers below. */
const CATEGORIES_SEED: { id: CategoryId; label: string; dot: string }[] = [
  { id: "antibiotics", label: "Antibiotics", dot: "#c24a2e" },
  { id: "pain", label: "Pain relief", dot: "#e0a63c" },
  { id: "coldflu", label: "Cold & flu", dot: "#5da184" },
  { id: "vitamins", label: "Vitamins", dot: "#7d9c5a" },
  { id: "diabetes", label: "Diabetes", dot: "#4f7d9e" },
  { id: "cardio", label: "Cardio", dot: "#a05a79" },
  { id: "derma", label: "Skin care", dot: "#c98d5f" },
  { id: "cns", label: "CNS & sleep", dot: "#6b7f8c" },
  { id: "devices", label: "Devices", dot: "#5c6b66" },
  { id: "firstaid", label: "First aid", dot: "#b8543f" },
  { id: "baby", label: "Baby care", dot: "#8a7fb5" },
  { id: "compound", label: "Compounds", dot: "#8a6fae" },
];

/** Category tree (§5) — parent groups over the leaf categories, drives roll-up filtering */
export const CATEGORY_GROUPS: { id: string; label: string; leaves: CategoryId[] }[] = [
  { id: "acute", label: "Acute & infection", leaves: ["antibiotics", "coldflu", "pain", "firstaid"] },
  { id: "chronic", label: "Chronic care", leaves: ["cardio", "diabetes", "cns"] },
  { id: "selfcare", label: "Self-care & family", leaves: ["vitamins", "derma", "baby"] },
  { id: "technical", label: "Devices & compounds", leaves: ["devices", "compound"] },
];
export const CATEGORY_GROUPS_RUNTIME = [
  { id: "acute", label: "Acute & infection" },
  { id: "chronic", label: "Chronic care" },
  { id: "selfcare", label: "Self-care & family" },
  { id: "technical", label: "Devices & compounds" },
];
export const groupOf = (cat: string, cats?: { id: string; groupId: string }[]) =>
  cats?.find((c) => c.id === cat)?.groupId ?? CATEGORY_GROUPS_RUNTIME.find((g) => g.id === cat)?.id
  ?? CATEGORIES_SEED_LOOKUP.get(cat) ?? "technical";
export const groupLabel = (gid: string) => CATEGORY_GROUPS_RUNTIME.find((g) => g.id === gid)?.label ?? gid;
export const catLabel = (cat: string, cats?: { id: string; label: string }[]) =>
  cats?.find((c) => c.id === cat)?.label ?? CATEGORIES_SEED.find((c) => c.id === (cat as CategoryId))?.label ?? cat;

/* W2.1 tree roll-ups — children fold into their parent's totals.
 * Depth ≤ 2 is a UI invariant, but these walk defensively without recursion assumptions. */
export const catChildren = (id: string, cats: { id: string; parentId?: string }[] = []) =>
  cats.filter((c) => c.parentId === id).map((c) => c.id);
/** Expand a picked chip/filter id to itself + every descendant leaf. */
export const catSubtree = (id: string, cats: { id: string; parentId?: string }[]): string[] => {
  const out = [id];
  for (;;) {
    const kids = cats.filter((c) => c.parentId && out.includes(c.parentId) && !out.includes(c.id)).map((c) => c.id);
    if (kids.length === 0) return out;
    out.push(...kids);
  }
};
/** "Pain relief / Analgesics" for nested rows in pickers and tables. */
export const catPathLabel = (id: string, cats?: { id: string; label: string; parentId?: string }[]) => {
  const c = cats?.find((x) => x.id === id);
  if (!c?.parentId) return catLabel(id, cats);
  return `${catLabel(c.parentId, cats)} / ${catLabel(id, cats)}`;
};
const CATEGORIES_SEED_LOOKUP = new Map<string, string>(CATEGORY_GROUPS.flatMap((g) => g.leaves.map((l) => [l, g.id] as const)));

/** A single stock lot on the shelf. Sales consume lots FEFO — first expiry, first out. */
export interface Batch {
  batch: string; expiry: string; qty: number;
  price?: number;      // lot-level clearance price (1.4)
  cost?: number;       // per-lot cost recorded at receive (§5 batch costing) — falls back to product.cost
  recalled?: boolean;  // flagged for recall — trace patients & quarantine (§3/§5)
}

export type Schedule = "C-II" | "C-III" | "C-IV" | "C-V";

export interface Field { key: string; value: string; }

/** Units of measure (§5) — multi-pack pricing. Stock is tracked in the base unit; factor converts. */
export interface Uom {
  code: string;            // "box", "case"…
  label: string;           // "Box of 10 strips"
  factor: number;          // base units per UOM (integer ≥ 1)
  price: number;           // UOM's own sale price — wins over factor × base
  cost: number;
  barcode?: string;        // per-UOM barcode for scanner-driven selection
}

export interface Product {
  id: string; sku: string; barcode: string;
  name: string; generic: string; brand: string;
  category: string; form: string;
  price: number; cost: number;
  reorderLevel: number;
  rx: boolean;
  supplier: string;
  batches: Batch[];
  controlled?: Schedule; // DEA schedule — ID + audit requirements at the till
  restricted?: { limitPerSale: number }; // age-gated / monitored OTC — ID capture + mandatory log (§3)
  genericOf?: string;    // if set, this SKU is the generic equivalent of the given brand SKU (§3 DAW)
  ndc?: string;          // National Drug Code, 5-4-2 format (§3) — first-class identifier
  gtin?: string;         // GS1 GTIN-14 for scanning (§3)
  compound?: boolean;    // in-house compounded preparation (§3 compounding)
  coldChain?: boolean;   // §5 cold chain — requires 2–8 °C handling, temp-logged
  fields?: Field[];      // user-defined attributes (6.7)
  uoms?: Uom[];          // multi-UOM pricing (§5) — sell in packs, stock converts to base
  variantOf?: string;    // strength/pack-size variant of a parent SKU (§5), shares supplier
  kit?: { productId: string; qty: number }[]; // bundle components deducted on sale (§5)
}

/* Simulated NDC directory (§3) — used for auto-fill when creating new catalog items */
export interface NdcEntry {
  ndc: string; name: string; generic: string; brand: string; form: string;
  price: number; cost: number; category: string;
}
export const NDC_DIRECTORY: NdcEntry[] = [
  { ndc: "50111-0362-01", name: "Levothyroxine 50mcg", generic: "Levothyroxine sodium", brand: "Synthroid", form: "Tablet · bottle of 100", price: 14.2, cost: 7.8, category: "cardio" },
  { ndc: "00173-0682-20", name: "Fluticasone/Salmeterol 250/50", generic: "Fluticasone + salmeterol", brand: "Advair Diskus", form: "Inhalation · 28 doses", price: 62.0, cost: 41.5, category: "coldflu" },
  { ndc: "00006-0277-31", name: "Sitagliptin 100mg", generic: "Sitagliptin phosphate", brand: "Januvia", form: "Tablet · bottle of 30", price: 38.6, cost: 26.2, category: "diabetes" },
  { ndc: "68258-8945-01", name: "Lisinopril 10mg", generic: "Lisinopril", brand: "Generic · Accord", form: "Tablet · bottle of 90", price: 8.4, cost: 3.1, category: "cardio" },
  { ndc: "00078-0532-19", name: "Valsartan 80mg", generic: "Valsartan", brand: "Diovan", form: "Tablet · bottle of 30", price: 21.7, cost: 12.9, category: "cardio" },
  { ndc: "51285-0538-02", name: "Ondansetron 4mg ODT", generic: "Ondansetron HCl", brand: "Zofran ODT", form: "Oral disintegrating · 10", price: 16.9, cost: 8.6, category: "coldflu" },
];
const normNdc = (s: string) => s.replace(/[^0-9]/g, "");
export const ndcLookup = (code: string): NdcEntry | null =>
  NDC_DIRECTORY.find((e) => normNdc(e.ndc) === normNdc(code)) ?? null;

/** Suggested keys when adding custom fields */
export const FIELD_SUGGESTIONS = ["Storage", "Shelf life", "Hazard class", "Vendor code", "Min order", "Fridge zone", "Recall flag"];

export const stockOf = (p: Product, catalog?: Product[]): number => {
  /* kit (§5): sellable count is limited by the scarcest component */
  if (p.kit && p.kit.length > 0 && catalog) {
    let min = Infinity;
    for (const c of p.kit) {
      const comp = catalog.find((x) => x.id === c.productId);
      if (!comp) return 0;
      min = Math.min(min, Math.floor(stockOf(comp, catalog) / Math.max(1, c.qty)));
    }
    return Number.isFinite(min) ? min : 0;
  }
  return p.batches.reduce((s, b) => s + b.qty, 0);
};

/**
 * Generic-substitution candidate (§3 DAW, W1.4): the cheaper in-stock generic
 * equivalent of `brand`, or null when there is none worth offering.
 *
 * Linkage is one-directional in the catalog — the generic SKU carries
 * `genericOf: "<brandId>"` — so a brand finds its generic by reverse lookup.
 * A candidate must be strictly cheaper and actually on the shelf, and a SKU that
 * is itself a generic is never offered a substitution.
 */
export function genericSubstituteFor(brand: Product, catalog: Product[]): Product | null {
  if (brand.genericOf) return null;                     // already the generic — nothing to swap
  const candidates = catalog.filter((x) =>
    x.genericOf === brand.id && x.id !== brand.id &&
    x.price < brand.price && stockOf(x, catalog) > 0);
  if (candidates.length === 0) return null;
  // ponytail: cheapest wins; add prescriber/formulary preference here if that ever matters
  return candidates.reduce((best, x) => (x.price < best.price ? x : best));
}

/** Per-unit saving from dispensing `gen` instead of `brand` (§3 DAW). */
export const substitutionSaving = (brand: Product, gen: Product): number =>
  Math.round(Math.max(0, brand.price - gen.price) * 100) / 100;

/** Lots sorted first-expiry-first-out (earliest expiry sells first). */
export const fefoBatches = (p: { batches: Batch[] }): Batch[] =>
  [...p.batches].sort((a, b) => a.expiry.localeCompare(b.expiry) || a.batch.localeCompare(b.batch));

export const nearestExpiry = (p: Product): string | null => fefoBatches(p)[0]?.expiry ?? null;

/**
 * Deduct `qty` from one named lot (RTV / write-off / corrections).
 * Returns the remaining lots; the lot is dropped when it hits zero.
 */
export function deductFromLot(batches: Batch[], batch: string, qty: number): Batch[] {
  return batches
    .map((b) => (b.batch === batch ? { ...b, qty: b.qty - qty } : b))
    .filter((b) => b.qty > 0);
}

/**
 * Recall tracing (§3/§5): every patient who received units of a lot, via the
 * FEFO allocation trail recorded on each sale line at the till.
 */
export function patientsForLot(
  transactions: Transaction[],
  productId: string,
  batch: string,
): { txId: string; at: number; customerId?: string; qty: number }[] {
  const out: { txId: string; at: number; customerId?: string; qty: number }[] = [];
  for (const tx of transactions) {
    if (tx.refundOf) continue; // refunded units never came home with the patient
    for (const l of tx.lines) {
      if (l.productId !== productId || !l.alloc) continue;
      const hit = l.alloc.find((a) => a.batch === batch);
      if (hit) out.push({ txId: tx.id, at: tx.at, customerId: tx.customerId, qty: hit.qty });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Recall lookup (W2.2): enter any lot/batch code — no product selection — and find every
 * patient who received units from that batch, across all products.
 */
export function patientsForBatchCode(
  transactions: Transaction[],
  batch: string,
): { txId: string; at: number; customerId?: string; qty: number; productId: string; productName: string }[] {
  const out: { txId: string; at: number; customerId?: string; qty: number; productId: string; productName: string }[] = [];
  for (const tx of transactions) {
    if (tx.refundOf) continue;
    for (const l of tx.lines) {
      if (!l.alloc) continue;
      const hit = l.alloc.find((a) => a.batch === batch);
      if (hit) out.push({ txId: tx.id, at: tx.at, customerId: tx.customerId, qty: hit.qty, productId: l.productId, productName: l.name });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Consume `need` units from lots in FEFO order.
 * Returns the remaining lots plus an allocation trail for the receipt.
 */
export function allocFEFO(batches: Batch[], need: number): {
  batches: Batch[];
  alloc: { batch: string; qty: number; cost?: number }[];
} {
  const alloc: { batch: string; qty: number; cost?: number }[] = [];
  let remaining = need;
  const out: Batch[] = [];
  for (const b of fefoBatches({ batches })) {
    if (remaining <= 0) { out.push(b); continue; }
    const take = Math.min(b.qty, remaining);
    remaining -= take;
    if (take > 0) alloc.push({ batch: b.batch, qty: take, cost: b.cost });
    if (b.qty - take > 0) out.push({ ...b, qty: b.qty - take });
  }
  return { batches: out, alloc };
}

let batchSeq = 100;
/** Fresh lot code for incoming stock, e.g. B-2602-117 */
export function newBatchCode(): string {
  const d = new Date();
  return `B-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}-${batchSeq++}`;
}

export interface TxLine {
  productId: string; name: string; form: string; qty: number; price: number; rx: boolean;
  alloc?: { batch: string; qty: number }[]; // FEFO lot trail
  cost?: number;                            // unit cost at time of sale (FIFO) — powers margin/COGS (§6)
  note?: string;                            // per-line counter note
  override?: boolean;                       // unit price was manually overridden
  listPrice?: number;                       // original price before override
  daw?: number;                             // Dispense-As-Written code (1 prescriber / 2 patient) (§3)
  substituted?: string;                     // brand name this generic line replaced (§3)
  ndc?: string;                             // NDC printed on the receipt (§3)
  uom?: string;                             // UOM label, e.g. "Box of 10 strips" (§5)
  uomFactor?: number;                       // base units per UOM, for stock deduction (§5)
  kitComponents?: string;                   // kit contents summary (§5)
  lineDiscount?: { mode: "amt" | "pct"; value: number }; // per-line discount (JSONB — no migration)
}
/** Discounts at or above these fractions need manager PIN approval. */
export const LINE_DISCOUNT_PIN_THRESHOLD = 0.1;   // 10% off a single line
export const INVOICE_DISCOUNT_PCT_PIN_THRESHOLD = 20; // percent off the invoice
export const INVOICE_DISCOUNT_AMT_PIN_THRESHOLD = 50; // currency amount off the invoice
export type PayMethod = "cash" | "card" | "insurance" | "store_credit" | "pay_later";
export interface PaymentLeg { method: PayMethod; amount: number; ref?: string; dueDate?: number; settledAt?: number; }
export interface Transaction {
  id: string; at: number; lines: TxLine[];
  subtotal: number; discount: number; tax: number; total: number;
  method: PayMethod; cashier: string; tendered?: number; change?: number;
  payments?: PaymentLeg[]; // split-tender legs (absent for legacy single-tender sales)
  refundedAt?: number;   // original sale was refunded
  voidedAt?: number;     // original sale was voided
  voidReason?: string;   // manager-approved void reason
  voidedBy?: string;     // approving staff name
  refundOf?: string;     // this record is the refund of the given sale
  reason?: string;
  taxExempt?: boolean;
  customerId?: string;
  bulkSavings?: number;      // quantity-tier savings across lines
  loyaltyDeduct?: number;    // value of redeemed points
  couponDiscount?: number;    // coupon applied (Phase F)
  invoiceDiscountAmt?: number; // fixed-amount invoice discount (on top of % discount)
  pointsEarned?: number;
  pointsRedeemed?: number;
}

/** new → verifying → ready (filled) → waiting (will-call bin) → dispensed (paid & handed over) */
export type RxStatus = "new" | "verifying" | "ready" | "waiting" | "dispensed";

/** Prescriber directory entry (§3) — NPI/DEA on file, linked to every Rx */
export interface Prescriber {
  id: string; name: string; credentials: string; specialty: string;
  npi: string; dea: string; phone: string; fax: string;
  active: boolean;
  archived?: boolean;
}

export interface Prescription {
  id: string; patient: string; age: number; productId: string; qty: number;
  prescriberId: string; status: RxStatus; createdAt: number; note?: string;
  daysSupply?: number;        // days of therapy in this fill — drives refill radar
  dispensedAt?: number;       // set when moved to dispensed
  remindedAt?: number;        // last refill reminder sent
  refillsAuthorized?: number; // total refills the prescriber allowed
  refillsRemaining?: number;  // decremented on each dispense (§3 refill tracking)
  rxExpiry?: string;          // ISO date the prescription itself expires
  phone?: string;             // patient contact for "ready for pickup" notifications
  notifiedAt?: number;        // waiting-bin pickup notification sent
  scan?: string;              // hard-copy Rx scan — resized JPEG data-URL (§3; cloud storage once backend lands)
  scanAt?: number;
  transferredOut?: { at: number; to: string }; // fill authority moved to another pharmacy (§3)
  insurance?: { plan: string; memberId: string; status: "pending" | "verified" | "rejected" };
  pa?: {                      // prior-authorization lifecycle with the payer (§3)
    status: "pending" | "approved" | "rejected";
    requestedAt: number; decidedAt?: number; note?: string;
  };
}

/** Documented prescription transfer between pharmacies (§3) */
export interface RxTransfer {
  id: string; transferNo: string; direction: "in" | "out";
  prescriptionId?: string; patient: string; drug: string; qty: number;
  otherPharmacy: string; otherPhone: string; prescriber: string;
  refillsRemaining: number; pharmacist: string; at: number; note?: string;
}
export function makeRxTransfers(now: number): RxTransfer[] {
  const h = 3_600_000; const d = 24 * h;
  return [
    { id: "RT-1", transferNo: "TF-88121", direction: "out", prescriptionId: "RX-2476", patient: "Samuel Eze", drug: "Azithromycin 250mg × 1", qty: 1, otherPharmacy: "Lakeview Pharmacy", otherPhone: "(555) 441-2018", prescriber: "Dr. R. Vance", refillsRemaining: 2, pharmacist: "R. Mensah, RPh", at: now - 2 * d, note: "Patient relocated — records requested" },
    { id: "RT-2", transferNo: "TF-88109", direction: "in", patient: "Amara Diallo", drug: "Losartan 50mg × 2", qty: 2, otherPharmacy: "Cedar Grove Rx", otherPhone: "(555) 902-3341", prescriber: "Dr. I. Bello", refillsRemaining: 3, pharmacist: "R. Mensah, RPh", at: now - 5 * d, note: "Refill history verified verbally" },
    { id: "RT-3", transferNo: "TF-88130", direction: "out", patient: "Grace Lin", drug: "Insulin glargine × 1", qty: 1, otherPharmacy: "Harbor Point Pharmacy", otherPhone: "(555) 733-0912", prescriber: "Dr. S. Adeyemi", refillsRemaining: 1, pharmacist: "R. Mensah, RPh", at: now - 6 * h, note: "Cold-chain handoff arranged" },
  ];
}

/* ------------------------------------------------------------------ */
/*  Supply-chain finance (§5) — suppliers, POs, accounts payable,      */
/*  expenses, and the inputs for a real P&L                            */
/* ------------------------------------------------------------------ */

export interface Supplier {
  id: string; name: string; contact: string; phone: string; email?: string;
  terms: number;        // payment terms in days (net-N) — invoice due date = invoice date + terms
  leadDays: number;     // typical delivery lead time
  minOrder: number;     // minimum order quantity per line
  priceBook?: { productId: string; unitCost: number }[]; // vendor price book (§5) — compare when ordering
  archived?: boolean;
}

export interface PoLine { productId: string; qty: number; unitCost: number; received: number; }
export type PoStatus = "ordered" | "partial" | "received" | "cancelled";
export interface PurchaseOrder {
  id: string; supplierId: string; lines: PoLine[];
  status: PoStatus; createdAt: number; expectedAt: number; receivedAt?: number;
  invoiceId?: string; note?: string;
}

export type ApPayMethod = "cash" | "bank" | "card";
export interface ApPayment { at: number; amount: number; method: ApPayMethod; ref?: string; }
export interface ApCredit { at: number; amount: number; note: string; }
export interface ApInvoice {
  id: string; number: string; supplierId: string; poId?: string;
  date: number; dueDays: number; total: number;
  payments: ApPayment[]; credits: ApCredit[];
}
export const invoicePaid = (inv: ApInvoice) =>
  inv.payments.reduce((s, p) => s + p.amount, 0) - inv.credits.reduce((s, c) => s + c.amount, 0);
export const invoiceBalance = (inv: ApInvoice) => Math.max(0, inv.total - invoicePaid(inv));

export interface Expense {
  id: string; category: string; amount: number; date: number; payee: string; note?: string;
  recurring?: boolean;
}
export const EXPENSE_CATEGORIES = ["Rent", "Salaries", "Utilities", "Marketing", "Transport", "Repairs", "Misc"];

export function makeSuppliers(): Supplier[] {
  return [
    { id: "SUP-01", name: "MediSource Ltd", contact: "K. Adjei", phone: "(555) 210-4471", email: "orders@medisource.co", terms: 30, leadDays: 5, minOrder: 50,
      priceBook: [{ productId: "amx500", unitCost: 4.6 }, { productId: "met500", unitCost: 2.1 }, { productId: "atv20", unitCost: 5.3 }, { productId: "amx250", unitCost: 3.2 }] },
    { id: "SUP-02", name: "PharmaLine Co", contact: "S. Whitmore", phone: "(555) 318-9902", email: "sales@pharmaline.co", terms: 30, leadDays: 4, minOrder: 40,
      priceBook: [{ productId: "ibu400", unitCost: 1.3 }, { productId: "ibu200", unitCost: 0.9 }, { productId: "diclo50", unitCost: 2.2 }, { productId: "asa75", unitCost: 1.0 }] },
    { id: "SUP-03", name: "Apex Distributors", contact: "J. Mensah", phone: "(555) 402-1187", email: "apex@apexdist.co", terms: 7, leadDays: 2, minOrder: 25,
      priceBook: [{ productId: "cet10", unitCost: 1.8 }, { productId: "cet5", unitCost: 2.0 }, { productId: "ors5", unitCost: 1.7 }] },
    { id: "SUP-04", name: "Vital Trade", contact: "R. Okonkwo", phone: "(555) 509-3348", email: "trade@vitaltrade.co", terms: 30, leadDays: 6, minOrder: 30,
      priceBook: [{ productId: "vd3", unitCost: 6.5 }, { productId: "vitc", unitCost: 3.9 }] },
    { id: "SUP-05", name: "DevicePoint", contact: "L. Ferreira", phone: "(555) 617-8830", email: "b2b@devicepoint.co", terms: 45, leadDays: 10, minOrder: 5,
      priceBook: [{ productId: "oxim", unitCost: 10.9 }, { productId: "thermo", unitCost: 5.1 }] },
    { id: "SUP-06", name: "ColdChain Direct", contact: "M. Haugen", phone: "(555) 733-2015", email: "orders@coldchain.co", terms: 30, leadDays: 3, minOrder: 10,
      priceBook: [{ productId: "insg", unitCost: 31.5 }, { productId: "salb", unitCost: 8.9 }] },
  ];
}

export function makePurchaseOrders(now: number): PurchaseOrder[] {
  const d = 86_400_000;
  return [
    {
      id: "PO-2203", supplierId: "SUP-01", status: "ordered",
      createdAt: now - 2 * d, expectedAt: now + 3 * d,
      lines: [
        { productId: "met500", qty: 120, unitCost: 2.2, received: 0 },
        { productId: "atv20", qty: 80, unitCost: 5.6, received: 0 },
      ],
      note: "Replenishment from reorder report",
    },
    {
      id: "PO-2202", supplierId: "SUP-06", status: "ordered",
      createdAt: now - 1 * d, expectedAt: now + 2 * d,
      lines: [{ productId: "insg", qty: 12, unitCost: 33.0, received: 0 }],
      note: "Cold-chain — confirm 2–8 °C on arrival",
    },
    {
      id: "PO-2201", supplierId: "SUP-02", status: "partial",
      createdAt: now - 9 * d, expectedAt: now - 4 * d,
      lines: [
        { productId: "ibu400", qty: 200, unitCost: 1.4, received: 120 },
        { productId: "diclo50", qty: 60, unitCost: 2.3, received: 0 },
      ],
      note: "Short-shipped diclofenac — balance due",
    },
    {
      id: "PO-2200", supplierId: "SUP-03", status: "received",
      createdAt: now - 16 * d, expectedAt: now - 12 * d, receivedAt: now - 12 * d,
      invoiceId: "INV-8801",
      lines: [
        { productId: "cet10", qty: 120, unitCost: 1.9, received: 120 },
        { productId: "ors5", qty: 80, unitCost: 1.8, received: 80 },
      ],
    },
    {
      id: "PO-2199", supplierId: "SUP-04", status: "received",
      createdAt: now - 45 * d, expectedAt: now - 40 * d, receivedAt: now - 40 * d,
      invoiceId: "INV-8802",
      lines: [{ productId: "vd3", qty: 40, unitCost: 6.8, received: 40 }],
    },
  ];
}

export function makeApInvoices(now: number): ApInvoice[] {
  const d = 86_400_000;
  return [
    {
      id: "INV-8801", number: "INV-8801", supplierId: "SUP-03", poId: "PO-2200",
      date: now - 12 * d, dueDays: 7, total: 372,
      payments: [{ at: now - 6 * d, amount: 150, method: "bank", ref: "TRF-55213" }],
      credits: [],
    },
    {
      id: "INV-8802", number: "INV-8802", supplierId: "SUP-04", poId: "PO-2199",
      date: now - 40 * d, dueDays: 30, total: 272,
      payments: [], credits: [],
    },
    {
      id: "INV-8803", number: "INV-8803", supplierId: "SUP-01",
      date: now - 20 * d, dueDays: 30, total: 500,
      payments: [{ at: now - 10 * d, amount: 500, method: "bank", ref: "TRF-55180" }],
      credits: [],
    },
    {
      id: "INV-8804", number: "INV-8804", supplierId: "SUP-05",
      date: now - 8 * d, dueDays: 45, total: 260,
      payments: [{ at: now - 2 * d, amount: 100, method: "card", ref: "CARD-0931" }],
      credits: [{ at: now - 3 * d, amount: 12, note: "Damaged oximeter sensor" }],
    },
  ];
}

export function makeExpenses(now: number): Expense[] {
  const d = 86_400_000;
  return [
    { id: "EXP-901", category: "Rent", amount: 1800, date: now - 15 * d, payee: "Maple Property Group", recurring: true, note: "Monthly — unit 4" },
    { id: "EXP-902", category: "Salaries", amount: 4200, date: now - 10 * d, payee: "Staff payroll", recurring: true },
    { id: "EXP-903", category: "Utilities", amount: 240, date: now - 9 * d, payee: "City Power & Water", recurring: true },
    { id: "EXP-904", category: "Marketing", amount: 150, date: now - 20 * d, payee: "Springfield Local Ads" },
    { id: "EXP-905", category: "Transport", amount: 95, date: now - 5 * d, payee: "Swift Courier", note: "Cold-chain pickup" },
    { id: "EXP-906", category: "Repairs", amount: 180, date: now - 3 * d, payee: "FixIt Services", note: "Receipt printer head" },
  ];
}

export interface Customer {
  id: string; name: string; phone: string; email?: string;
  createdAt: number; notes?: string;
  points: number;           // loyalty balance — 1 pt per $1, 100 pts redeems $5
  taxExempt?: boolean;      // clinics / gov accounts — sales post tax-free
  fields?: Field[];         // user-defined attributes (6.7)
  allergies?: string[];     // structured allergen profile (§3 clinical checks)
  /* full patient profile (§7) */
  dob?: string;             // ISO date
  gender?: "F" | "M" | "O";
  address?: string;
  bloodType?: string;
  primaryPrescriberId?: string;
  insurancePlan?: string;
  clinicalNotes?: string;   // pharmacist-only (§3 HIPAA role-scoped)
}

/** Outstanding AR balance for a customer — sum of unsettled pay_later legs across transactions */
export function outstandingBalance(customerId: string, transactions: Transaction[]): number {
  let balance = 0;
  for (const tx of transactions) {
    if (tx.customerId !== customerId || tx.refundOf) continue;
    for (const leg of tx.payments ?? []) {
      if (leg.method === "pay_later" && !leg.settledAt) {
        balance += leg.amount;
      }
    }
  }
  return Math.round(balance * 100) / 100;
}

/** Coupon — configurable discount code (§9 Phase F) */
export interface Coupon {
  id: string;
  code: string;
  type: "percent" | "amount";
  value: number;
  expiresAt?: number;
  customerId?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/* Allergen → ingredient keyword rules for drug–allergy screening (§3) */
export const ALLERGENS = ["Penicillin", "Sulfa", "Aspirin / NSAID", "Codeine / opioid", "Iodine", "Latex"];
export const ALLERGY_RULES: { allergen: string; keywords: string[] }[] = [
  { allergen: "Penicillin", keywords: ["amoxicillin", "ampicillin", "penicillin", "cillin", "augmentin"] },
  { allergen: "Sulfa", keywords: ["sulfa", "sulfamethoxazole", "trimethoprim", "cotrimoxazole"] },
  { allergen: "Aspirin / NSAID", keywords: ["ibuprofen", "diclofenac", "aspirin", "acetylsalicylic", "naproxen", "indomethacin"] },
  { allergen: "Codeine / opioid", keywords: ["codeine", "tramadol", "hydrocodone", "oxycodone", "morphine"] },
  { allergen: "Iodine", keywords: ["iodine", "povidone"] },
];

/** Screen a product against a patient's allergen profile — returns every conflict */
export function allergyConflicts(allergies: string[] | undefined, p: Product | undefined): { allergen: string; reason: string }[] {
  if (!allergies || allergies.length === 0 || !p) return [];
  const hay = `${p.name} ${p.generic} ${p.brand}`.toLowerCase();
  const out: { allergen: string; reason: string }[] = [];
  for (const a of allergies) {
    const rule = ALLERGY_RULES.find((r) => r.allergen.toLowerCase() === a.toLowerCase());
    if (!rule) continue;
    const hit = rule.keywords.find((k) => hay.includes(k));
    if (hit) out.push({ allergen: a, reason: hit });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Staff, roles & permissions (§0)                                    */
/* ------------------------------------------------------------------ */

export type Role = "pharmacy_admin" | "pharmacist" | "manager" | "cashier" | "super_admin";

export interface Staff {
  id: string; name: string; role: Role;
  pinHash: string;              // SHA-256 — plaintext PINs are never stored
  initials: string; active: boolean; createdAt: number;
}

export const ROLE_LABEL: Record<Role, string> = {
  pharmacy_admin: "Admin", pharmacist: "Pharmacist", manager: "Manager", cashier: "Cashier", super_admin: "Super Admin",
};

export type Perm =
  | "refund" | "approve_transfer" | "adjust_stock" | "apply_count"
  | "edit_settings" | "manage_settings" | "manage_staff" | "restore_snapshot" | "verify_rx" | "transfer_rx"
  | "create_po" | "receive_po" | "pay_invoice" | "add_expense" | "approve_discount";

/* Permission matrix — enforced in the UI layer now, mirrors the future RLS checks */
export const PERMS: Record<Perm, Role[]> = {
  refund: ["manager", "pharmacy_admin"],
  approve_discount: ["manager", "pharmacy_admin"],
  approve_transfer: ["manager", "pharmacy_admin"],
  adjust_stock: ["pharmacist", "manager", "pharmacy_admin"],
  apply_count: ["manager", "pharmacy_admin"],
  edit_settings: ["pharmacy_admin"],
  manage_settings: ["pharmacy_admin"],
  manage_staff: ["pharmacy_admin"],
  restore_snapshot: ["pharmacy_admin"],
  verify_rx: ["pharmacist", "pharmacy_admin"],
  transfer_rx: ["pharmacist", "pharmacy_admin"],
  create_po: ["manager", "pharmacy_admin"],
  receive_po: ["pharmacist", "manager", "pharmacy_admin"],
  pay_invoice: ["manager", "pharmacy_admin"],
  add_expense: ["manager", "pharmacy_admin"],
};

export const can = (role: Role | undefined, perm: Perm): boolean =>
  !!role && PERMS[perm].includes(role);

/** Role-based route guards (F7): which roles may open each view. Single source of
 *  truth — consumed by the shell nav AND in-page buttons that navigate (e.g.
 *  Till "view reports"), so UI never points somewhere the guard will block. */
export const VIEW_ROLES: Record<string, Role[]> = {
  register: ["super_admin", "pharmacy_admin", "pharmacist", "manager", "cashier"],
  dashboard: ["super_admin", "pharmacy_admin", "pharmacist", "manager", "cashier"],
  customers: ["super_admin", "pharmacy_admin", "pharmacist", "manager", "cashier"],
  inventory: ["super_admin", "pharmacy_admin", "pharmacist", "manager", "cashier"],
  deliveries: ["super_admin", "pharmacy_admin", "pharmacist", "manager", "cashier"],
  history: ["super_admin", "pharmacy_admin", "pharmacist", "manager", "cashier"],
  finance: ["super_admin", "pharmacy_admin", "manager"],
  reports: ["super_admin", "pharmacy_admin", "pharmacist", "manager"],
  prescriptions: ["super_admin", "pharmacy_admin", "pharmacist"],
  settings: ["super_admin", "pharmacy_admin"],
};

/* ------------------------------------------------------------------ */
/*  Clinical decision support — drug–drug interactions (§3/§4)         */
/* ------------------------------------------------------------------ */

export interface InteractionPair {
  a: string; b: string;              // product ids
  severity: "major" | "moderate";
  effect: string;                    // what happens
  action: string;                    // recommended clinical action
}

export const INTERACTIONS: InteractionPair[] = [
  { a: "codsyr", b: "alpr05", severity: "major", effect: "Opioid + benzodiazepine → additive CNS depression, respiratory risk (FDA boxed warning).", action: "Avoid combination; if unavoidable use lowest dose, counsel on sedation." },
  { a: "codsyr", b: "zolp5", severity: "major", effect: "Opioid + sedative-hypnotic → additive CNS depression.", action: "Avoid concurrent use; monitor for excessive sedation." },
  { a: "tram50", b: "alpr05", severity: "major", effect: "Opioid + benzodiazepine → additive CNS depression.", action: "Avoid combination; counsel on respiratory depression risk." },
  { a: "tram50", b: "zolp5", severity: "major", effect: "Opioid + sedative-hypnotic → additive CNS depression.", action: "Avoid concurrent use or reduce doses." },
  { a: "codsyr", b: "tram50", severity: "major", effect: "Duplicate opioid therapy → overdose & serotonin-syndrome risk.", action: "Dispense one opioid only; contact prescriber." },
  { a: "asa75", b: "ibu400", severity: "moderate", effect: "Ibuprofen blunts aspirin's antiplatelet effect; ↑ GI bleed risk.", action: "Separate dosing ≥2h; consider gastroprotection." },
  { a: "asa75", b: "diclo50", severity: "moderate", effect: "NSAID + antiplatelet → ↑ GI bleed risk.", action: "Use lowest NSAID dose, shortest duration; consider PPI." },
  { a: "ibu400", b: "diclo50", severity: "moderate", effect: "Therapeutic duplication — two NSAIDs.", action: "Dispense one NSAID only." },
  { a: "cipro500", b: "alpr05", severity: "moderate", effect: "CYP3A4 inhibition raises alprazolam levels → excess sedation.", action: "Reduce alprazolam dose; monitor sedation." },
  { a: "cet10", b: "alpr05", severity: "moderate", effect: "Antihistamine + benzodiazepine → additive sedation.", action: "Counsel against driving; avoid alcohol." },
  { a: "azi250", b: "atv20", severity: "moderate", effect: "Macrolide raises statin exposure → myopathy risk.", action: "Watch for muscle pain; consider holding statin during course." },
  { a: "alpr05", b: "zolp5", severity: "major", effect: "Benzodiazepine + non-benzodiazepine hypnotic → severe additive CNS depression.", action: "Avoid concurrent use; if unavoidable use lowest doses and warn on sedation driving risk." },
  { a: "atv20", b: "amx500", severity: "moderate", effect: "Macrolide antibiotic raises statin levels via CYP3A4 inhibition.", action: "Monitor for myalgia; consider statin dose reduction during the course." },
  { a: "cet10", b: "zolp5", severity: "moderate", effect: "Antihistamine + sedative-hypnotic → additive next-day impairment.", action: "Counsel on drowsiness; avoid operating machinery." },
  { a: "met500", b: "insg", severity: "moderate", effect: "Metformin + insulin increases hypoglycemia risk.", action: "Check glucose before and after; adjust insulin dose down." },
  { a: "omz20", b: "atv20", severity: "moderate", effect: "Omeprazole raises atorvastatin exposure via CYP2C19/3A4 inhibition.", action: "Monitor for statin myopathy signs." },
  { a: "diclo50", b: "asa75", severity: "moderate", effect: "NSAID + aspirin → additive GI ulceration and bleeding risk.", action: "Add gastroprotection if co-prescribed long-term." },
  { a: "cfsyrup", b: "alpr05", severity: "moderate", effect: "Antitussive + benzodiazepine → additive sedation.", action: "Counsel on sedation and fall risk in elderly." },
  { a: "met500", b: "atv20", severity: "moderate", effect: "Metformin + statin — monitor for combined lactic acidosis risk in renal impairment.", action: "Check renal function before co-train." },
  { a: "zolp5", b: "cet10", severity: "moderate", effect: "Sedative-hypnotic + antihistamine → prolonged psychomotor impairment.", action: "Counsel on next-day drowsiness; avoid alcohol." },
];

/** All interactions present among a set of product ids. Consults the runtime
 *  override (populated from the interaction_pairs table via sync) first, falling
 *  back to INTERACTIONS for offline mode. */
let _runtimeInteractions: InteractionPair[] | null = null;

/** Called by sync.ts after loading the interaction_pairs table. */
export function setRuntimeInteractions(rows: InteractionPair[]): void {
  _runtimeInteractions = rows.length > 0 ? rows : null;
}

export function findInteractions(ids: string[]): InteractionPair[] {
  const source = _runtimeInteractions ?? INTERACTIONS;
  const set = new Set(ids);
  return source.filter((i) => set.has(i.a) && set.has(i.b));
}

/* Compact synchronous SHA-256 (FIPS 180-4) — keeps PIN verification off async paths */
export function sha256(msg: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bytes = new TextEncoder().encode(msg);
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 8) >> 6 << 6) + 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Int32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < padded.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getInt32(i + j * 4);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

export const hashPin = (pin: string) => sha256(`counterrx:${pin}`);

const initialsOf = (name: string) =>
  name.replace(/,.*$/, "").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

export function makeStaff(now: number): Staff[] {
  const mk = (id: string, name: string, role: Role, pin: string, ageDays: number): Staff => ({
    id, name, role, pinHash: hashPin(pin), initials: initialsOf(name), active: true, createdAt: now - ageDays * 86_400_000,
  });
  return [
    mk("S-001", "D. Whitfield", "pharmacy_admin", "3333", 240),
    mk("S-002", "R. Mensah, RPh", "pharmacist", "2222", 180),
    mk("S-003", "S-003", "cashier", "1111", 120),
    mk("S-004", "J. Boateng", "cashier", "4444", 45),
    mk("S-005", "T. Okoye", "super_admin", "5555", 20),
    mk("S-006", "K. Asante", "manager", "6666", 90),
  ];
}

/** Seeded staff passwords — mirrors supabase/seed.sql auth.users provisioning.
 *  Format: CRx<compactId><pin>. Used for offline email/password verification
 *  when Supabase is unreachable (non-seeded staff cannot sign in offline). */
export const SEED_PASSWORDS: Record<string, string> = {
  "S-001": "CRxS0013333",
  "S-002": "CRxS0022222",
  "S-003": "CRxS0031111",
  "S-004": "CRxS0044444",
  "S-005": "CRxS0055555",
  "S-006": "CRxS0066666",
};

export const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

/* ------------------------------------------------------------------ */
/*  Organization settings (§8) — replaces hardcoded STORE constants    */
/* ------------------------------------------------------------------ */

export interface OrgSettings {
  orgName: string; branch: string; address: string; phone: string; license: string;
  currency: string;
  receiptFooter: string; receiptTerms: string; showBarcode: boolean;
  loyalty: { ptsPerUnit: number; chunkPts: number; chunkValue: number; silverAt: number; goldAt: number; platinumAt?: number };
  scanBeep: boolean;
  idleLockMins: number;            // 0 = never
  autoSnapshotMins: number;        // 0 = off
  terminalId: string;
  hardwareEnabled: boolean;        // Phase E: Web Serial hardware (printer/drawer/scale)
  savedReportViews: import("./lib/report-filters").SavedReportView[]; // named report-builder views (JSONB via settings tail column — no migration)
}

export const CURRENCIES = ["USD", "EUR", "GBP", "NGN", "KES", "ZAR", "GHS", "INR", "CAD"];

export function makeSettings(): OrgSettings {
  return {
    orgName: "CounterRx Pharmacy", branch: "Main branch", address: "", phone: "", license: "",
    currency: "USD",
    receiptFooter: "Get well soon — returns within 7 days with receipt",
    receiptTerms: "℞ items verified & dispensed by licensed pharmacist",
    showBarcode: true,
    loyalty: { ptsPerUnit: 1, chunkPts: 100, chunkValue: 5, silverAt: 100, goldAt: 300, platinumAt: 1000 },
    scanBeep: true,
    idleLockMins: 10,
    autoSnapshotMins: 15,
    terminalId: "T-01",
    hardwareEnabled: false,
    savedReportViews: [],
  };
}

export interface SnapshotMeta { id: string; at: number; label: string; auto: boolean; }
export interface Snapshot { meta: SnapshotMeta; data: Record<string, unknown>; }
export const SNAPS_KEY = "counterrx:snapshots";

export type AuditKind = "sale" | "stock" | "money" | "rx" | "system" | "shift" | "cash" | "void" | "report" | "settings";
export interface AuditEntry { id: number; at: number; actor: string; kind: AuditKind; detail: string; }

/** Behind-the-counter / monitored OTC sale — ID captured, mandatory log (§3) */
export interface RestrictedLogEntry {
  id: number; at: number;
  productId: string; qty: number;
  purchaser: string; idType: string; idLast4: string;
  cashier: string;
}

/* bulk-pricing tiers — per non-Rx line, by quantity */
export const BULK_TIERS: { min: number; pct: number }[] = [
  { min: 6, pct: 10 },
  { min: 3, pct: 5 },
];
export const bulkPct = (qty: number) => BULK_TIERS.find((t) => qty >= t.min)?.pct ?? 0;

/* loyalty rules */
export const REDEEM_CHUNK_PTS = 100;
export const REDEEM_CHUNK_VALUE = 5;

export interface HeldSale { id: string; label: string; at: number; expiresAt?: number; items: { productId: string; qty: number; note?: string; priceOverride?: number; daw?: number; substitutedFrom?: string; uom?: string }[]; }

/* ------------------------------------------------------------------ */
/*  Cold chain (§5) — temperature log lines for coldChain products     */
/* ------------------------------------------------------------------ */

/** 2–8 °C acceptance band for refrigerated products (§5 cold chain) */
export const COLD_CHAIN_MIN_C = 2;
export const COLD_CHAIN_MAX_C = 8;
export const tempInRange = (tempC: number) => tempC >= COLD_CHAIN_MIN_C && tempC <= COLD_CHAIN_MAX_C;

export interface ColdChainLog {
  id: string;
  productId: string;
  tempC: number;
  inRange: boolean;
  staff?: string;
  note?: string;
  at: number;
}

export function makeColdChainLogs(now: number): ColdChainLog[] {
  const h = 3_600_000;
  return [
    { id: "CCL-1001", productId: "insg", tempC: 3.8, inRange: true, staff: "R. Mensah, RPh", note: "Morning fridge check — zone B", at: now - 5 * h },
    { id: "CCL-1002", productId: "insg", tempC: 4.1, inRange: true, staff: "D. Whitfield", note: "Delivery hand-off verified", at: now - 30 * 60_000 },
    { id: "CCL-1003", productId: "salb", tempC: 7.4, inRange: true, staff: "R. Mensah, RPh", at: now - 26 * h },
    { id: "CCL-1004", productId: "insg", tempC: 9.2, inRange: false, staff: "S-003", note: "Fridge door left ajar — restock check", at: now - 49 * h },
  ];
}

/* Store credit / gift-card balance (Phase A till ops). A gift card is simply a
   credit that carries a scannable `code`; both redeem as the store_credit tender. */
export interface StoreCredit {
  id: string;
  customerId: string | null;   // null for anonymous gift cards
  balance: number;
  issuedAt: number;
  expiresAt?: number;
  code?: string;              // scannable gift-card / credit code
  note?: string;
}

export const tenderTypeOf = (m: PayMethod): TenderType =>
  m === "insurance" ? "insurance" : m === "card" ? "card" : m === "store_credit" ? "store_credit" : m === "pay_later" ? "cash" : "cash";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Apply a store-credit (or gift-card) deduction, capped at the available balance. */
export function applyStoreCredit(credits: StoreCredit[], id: string, amount: number): StoreCredit[] {
  const amt = Math.min(amount, credits.find((c) => c.id === id)?.balance ?? 0);
  return credits.map((c) => (c.id === id ? { ...c, balance: round2(c.balance - amt) } : c));
}

/** Resolve a scanned/entered code to a usable, non-expired credit. */
export function creditByCode(credits: StoreCredit[], code: string): StoreCredit | undefined {
  const c = credits.find((x) => x.code && x.code.toLowerCase() === code.trim().toLowerCase());
  return c && (!c.expiresAt || c.expiresAt > Date.now()) ? c : undefined;
}

/** Drop layaways whose hold window has elapsed (Phase A auto-expire). */
export function pruneExpiredHolds(holds: HeldSale[], now = Date.now()): HeldSale[] {
  return holds.filter((h) => !h.expiresAt || h.expiresAt > now);
}

/* Inter-branch stock transfers (2.6) */
export type TransferStatus = "requested" | "approved" | "shipped" | "received" | "rejected";
export interface Transfer {
  id: string; productId: string; qty: number;
  toBranch: string; status: TransferStatus;
  createdAt: number; requestedBy: string; note?: string;
}
export const HOME_BRANCH = "Main branch";
export const BRANCHES_FALLBACK: Branch[] = [
  { id: "BR-01", name: "Main Branch", address: "123 Main St, Capital City", phone: "+1-555-0101", active: true, sort: 0 },
  { id: "BR-02", name: "North Branch", address: "456 North Ave, Capital City", phone: "+1-555-0102", active: true, sort: 1 },
  { id: "BR-03", name: "South Branch", address: "789 South Blvd, Capital City", phone: "+1-555-0103", active: true, sort: 2 },
];


const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function p(
  id: string, name: string, generic: string, brand: string, category: string, form: string,
  price: number, cost: number, stock: number, reorderLevel: number, rx: boolean,
  batch: string, expDays: number, supplier: string,
  b2?: [string, number, number], // optional second lot: [batch, qty, expDays]
): Product {
  const now = Date.now();
  const batches: Batch[] = b2
    ? [
        { batch, expiry: iso(now + expDays * day), qty: Math.max(0, stock - b2[1]) },
        { batch: b2[0], expiry: iso(now + b2[2] * day), qty: b2[1] },
      ]
    : [{ batch, expiry: iso(now + expDays * day), qty: stock }];
  return {
    id, sku: `SKU-${id.toUpperCase()}`, barcode: `890${id.padStart(4, "0")}567890`,
    name, generic, brand, category, form, price, cost, reorderLevel, rx, supplier, batches,
  };
}

export function makeProducts(now: number): Product[] {
  void now;
  const base: Product[] = [
    p("amx500", "Amoxicillin 500mg", "Amoxicillin trihydrate", "Novex Pharma", "antibiotics", "Capsule · strip of 10", 8.4, 4.9, 132, 40, true, "AMX-24C11", 240, "MediSource Ltd", ["AMX-25A04", 84, 430]),
    p("azi250", "Azithromycin 250mg", "Azithromycin", "Zithron", "antibiotics", "Tablet · strip of 6", 11.9, 7.2, 14, 20, true, "AZT-24B07", 165, "MediSource Ltd"),
    p("cipro500", "Ciprofloxacin 500mg", "Ciprofloxacin HCl", "Ciprolon", "antibiotics", "Tablet · strip of 10", 9.6, 5.4, 64, 25, true, "CIP-24A19", 310, "PharmaLine Co", ["CIP-25C02", 40, 520]),
    p("ibu400", "Ibuprofen 400mg", "Ibuprofen", "Brufen", "pain", "Tablet · strip of 20", 3.2, 1.4, 260, 60, false, "IBU-25D02", 420, "PharmaLine Co"),
    p("pcm500", "Paracetamol 500mg", "Acetaminophen", "Calpol", "pain", "Tablet · strip of 15", 1.8, 0.7, 420, 100, false, "PCM-24E14", 55, "Apex Distributors", ["PCM-25E20", 340, 500]),
    p("diclo50", "Diclofenac 50mg", "Diclofenac sodium", "Voltaren", "pain", "Tablet · strip of 10", 4.6, 2.3, 8, 24, false, "DIC-24F30", 88, "PharmaLine Co"),
    p("cet10", "Cetirizine 10mg", "Cetirizine HCl", "Zyrtec", "coldflu", "Tablet · strip of 10", 4.1, 1.9, 180, 50, false, "CET-25A08", 380, "Apex Distributors"),
    p("cfsyrup", "Cough Syrup DM", "Dextromethorphan 15mg/5ml", "Benylin", "coldflu", "Syrup · 100ml bottle", 6.5, 3.6, 46, 20, false, "BEN-25C21", 205, "Apex Distributors", ["BEN-25J10", 26, 420]),
    p("ors5", "ORS Sachets", "Oral rehydration salts", "Electral", "coldflu", "Powder · pack of 5", 3.9, 1.8, 96, 30, false, "ORS-25B11", 460, "Vital Trade"),
    p("vd3", "Vitamin D3 1000IU", "Cholecalciferol", "D-Sun", "vitamins", "Softgel · bottle of 60", 12.5, 6.8, 74, 25, false, "VD3-25A03", 540, "Vital Trade"),
    p("vitc", "Vitamin C 1000mg", "Ascorbic acid", "Cevit", "vitamins", "Effervescent · 20 tabs", 7.8, 4.1, 6, 18, false, "VTC-24D18", 52, "Vital Trade"),
    p("zinco", "Zinc + Multivitamin", "Zinc sulfate + B-complex", "Zincovit", "vitamins", "Tablet · strip of 15", 5.4, 2.7, 118, 30, false, "ZNC-25C09", 330, "Vital Trade"),
    p("met500", "Metformin 500mg", "Metformin HCl", "Glucophage", "diabetes", "Tablet · strip of 15", 4.9, 2.2, 210, 60, true, "MET-25B25", 290, "MediSource Ltd", ["MET-25K08", 130, 510]),
    p("glm1", "Glimepiride 1mg", "Glimepiride", "Amaryl", "diabetes", "Tablet · strip of 15", 8.8, 4.9, 52, 20, true, "GLM-25A14", 215, "MediSource Ltd"),
    p("glst50", "Glucometer Strips", "Glucose test strips", "Accu-Chek", "diabetes", "Strips · box of 50", 24.0, 15.5, 34, 15, false, "ACU-25D30", 400, "DevicePoint"),
    { ...p("insg", "Insulin Glargine", "Insulin glargine 100IU/ml", "Lantus", "diabetes", "SoloStar pen · 3ml", 46.5, 33.0, 12, 10, true, "LNT-24K02", 44, "ColdChain Direct", ["LNT-25L15", 8, 300]), coldChain: true },
    p("atv20", "Atorvastatin 20mg", "Atorvastatin calcium", "Lipitor", "cardio", "Tablet · strip of 15", 10.2, 5.6, 140, 40, true, "ATV-25C16", 275, "MediSource Ltd"),
    p("aml5", "Amlodipine 5mg", "Amlodipine besylate", "Norvasc", "cardio", "Tablet · strip of 15", 5.8, 2.9, 4, 20, true, "AML-24H08", 130, "MediSource Ltd"),
    p("asa75", "Aspirin 75mg", "Acetylsalicylic acid", "Ecosprin", "cardio", "Tablet · strip of 14", 2.4, 1.1, 230, 50, false, "ASP-25F22", 480, "PharmaLine Co"),
    p("omz20", "Omeprazole 20mg", "Omeprazole", "Losec", "derma", "Capsule · strip of 14", 6.9, 3.4, 92, 30, false, "OMZ-25E07", 250, "PharmaLine Co", ["OMZ-25M03", 52, 470]),
    p("clot1", "Clotrimazole 1%", "Clotrimazole", "Canesten", "derma", "Cream · 20g tube", 5.6, 2.8, 58, 20, false, "CLT-25B19", 320, "Apex Distributors"),
    p("spf50", "Sunscreen SPF 50", "Broad-spectrum UV filters", "Photostable", "derma", "Lotion · 60g tube", 13.9, 8.2, 26, 12, false, "SUN-25A27", 365, "Vital Trade"),
    p("bpmon", "BP Monitor Arm", "Digital sphygmomanometer", "Omron HEM-7120", "devices", "Device · 1 unit", 39.0, 26.0, 16, 6, false, "OMR-25U04", 720, "DevicePoint"),
    p("thermo", "Digital Thermometer", "Oral/axillary thermometer", "Beurer FT-09", "devices", "Device · 1 unit", 9.5, 5.3, 42, 12, false, "BEU-25U11", 690, "DevicePoint"),
    p("oxim", "Pulse Oximeter", "Fingertip SpO2 + HR", "ChoiceMMed", "devices", "Device · 1 unit", 18.0, 11.4, 3, 8, false, "CMD-25U09", 640, "DevicePoint"),
    p("band", "Adhesive Bandages", "Sterile adhesive strips", "Band-Aid", "firstaid", "Box of 40 strips", 4.2, 2.0, 150, 40, false, "BND-26A12", 560, "Vital Trade"),
    p("detl", "Antiseptic Liquid", "Povidone-iodine 10%", "Betadine", "firstaid", "Solution · 100ml", 4.8, 2.4, 84, 25, false, "BET-25G15", 300, "Apex Distributors"),
    { ...p("salb", "Salbutamol Inhaler", "Salbutamol 100mcg", "Ventolin", "coldflu", "Inhaler · 200 doses", 14.8, 9.1, 22, 10, true, "VNT-25I06", 28, "ColdChain Direct", ["VNT-25N19", 14, 190]), coldChain: true },
    p("babyl", "Baby Lotion", "Gentle moisturizing lotion", "Johnson's", "baby", "Lotion · 200ml", 6.2, 3.5, 68, 20, false, "JNJ-25J18", 430, "Vital Trade"),
    p("gripe", "Gripe Water", "Dill oil preparation", "Woodward's", "baby", "Liquid · 200ml", 3.6, 1.7, 90, 25, false, "WWD-25K21", 350, "Apex Distributors"),
    /* controlled substances — DEA scheduled, ID + audit at the till */
    { ...p("tram50", "Tramadol 50mg", "Tramadol HCl", "Ultram", "pain", "Tablet · strip of 10", 7.2, 3.8, 46, 15, true, "TRM-25C18", 260, "MediSource Ltd"), controlled: "C-IV" as Schedule },
    { ...p("codsyr", "Codeine Cough Syrup", "Codeine phosphate 10mg/5ml", "Cheratussin AC", "coldflu", "Syrup · 118ml", 8.9, 4.6, 28, 10, true, "COD-25B09", 190, "Apex Distributors"), controlled: "C-V" as Schedule },
    { ...p("alpr05", "Alprazolam 0.5mg", "Alprazolam", "Xanax", "cns", "Tablet · strip of 15", 9.4, 4.2, 34, 12, true, "ALP-25D06", 300, "MediSource Ltd"), controlled: "C-IV" as Schedule },
    { ...p("zolp5", "Zolpidem 5mg", "Zolpidem tartrate", "Ambien", "cns", "Tablet · strip of 10", 11.6, 5.9, 18, 8, true, "ZOL-25A11", 240, "PharmaLine Co"), controlled: "C-IV" as Schedule },
    { ...p("oxy30", "Oxycodone 30mg", "Oxycodone HCl", "Roxicodone", "cns", "Tablet · strip of 10", 18.5, 12.8, 24, 12, true, "OXY-25G22", 480, "MediSource Ltd"), controlled: "C-II" as Schedule },
    { ...p("mor15", "Morphine 15mg", "Morphine sulfate", "MS Contin", "cns", "Tablet · strip of 10", 15.9, 11.0, 16, 10, true, "MOR-25F08", 360, "MediSource Ltd"), controlled: "C-II" as Schedule },
    /* restricted OTC — behind-the-counter, ID + log required, quantity-limited (§3) */
    { ...p("sud30", "Pseudoephedrine 30mg", "Pseudoephedrine HCl", "Sudafed", "coldflu", "Tablet · strip of 12", 6.8, 3.1, 40, 12, false, "SUD-25B14", 320, "Apex Distributors"), restricted: { limitPerSale: 2 } },
    /* generic equivalents (§3 DAW substitution) — linked to their brand SKU */
    { ...p("g-atv20", "Atorvastatin 20mg", "Atorvastatin calcium", "Generic · Teva", "cardio", "Tablet · strip of 15", 6.1, 2.9, 180, 40, true, "GAT-26A04", 420, "MediSource Ltd"), genericOf: "atv20" },
    { ...p("g-aml5", "Amlodipine 5mg", "Amlodipine besylate", "Generic · Lupin", "cardio", "Tablet · strip of 15", 3.4, 1.5, 160, 30, true, "GAM-26B12", 400, "MediSource Ltd"), genericOf: "aml5" },
    { ...p("g-met500", "Metformin 500mg", "Metformin HCl", "Generic · Glenmark", "diabetes", "Tablet · strip of 15", 2.9, 1.1, 300, 60, true, "GMT-26A20", 450, "MediSource Ltd"), genericOf: "met500" },
    { ...p("g-cet10", "Cetirizine 10mg", "Cetirizine HCl", "Generic · Dr. Reddy's", "coldflu", "Tablet · strip of 10", 2.2, 0.8, 220, 40, false, "GCT-26C08", 430, "Apex Distributors"), genericOf: "cet10" },
    { ...p("g-salb", "Salbutamol Inhaler", "Salbutamol 100mcg", "Generic · Cipla", "coldflu", "Inhaler · 200 doses", 9.9, 5.6, 30, 10, true, "GSL-26B02", 210, "ColdChain Direct"), genericOf: "salb" },
    /* in-house compounded preparation (§3) — built from shelf ingredients */
    { ...p("mmwash", "Magic Mouthwash 240ml", "Diphenhydramine / viscous lidocaine / antacid", "In-house compound", "compound", "Suspension · 240ml bottle", 18.5, 7.4, 6, 2, true, "MMW-26A03", 45, "Compounded in-house"), compound: true },
    /* strength variants (§5) — share supplier & molecule with the parent SKU */
    { ...p("amx250", "Amoxicillin 250mg", "Amoxicillin trihydrate", "Novex Pharma", "antibiotics", "Capsule · strip of 10", 6.2, 3.4, 90, 30, true, "AMX25-26A01", 300, "MediSource Ltd"), variantOf: "amx500" },
    { ...p("ibu200", "Ibuprofen 200mg", "Ibuprofen", "Brufen", "pain", "Tablet · strip of 20", 2.4, 1.0, 200, 50, false, "IBU2-26B03", 400, "PharmaLine Co"), variantOf: "ibu400" },
    { ...p("cet5", "Cetirizine 5mg chewable", "Cetirizine HCl (pediatric)", "Zyrtec Kids", "coldflu", "Chewable · strip of 10", 4.6, 2.1, 60, 20, false, "CET5-26C02", 350, "Apex Distributors"), variantOf: "cet10" },
    /* kit / bundle products (§5) — components deducted on sale */
    { ...p("kit-flu", "Flu Relief Kit", "Cetirizine + cough syrup + ORS", "CounterRx bundle", "coldflu", "Bundle · 3 products", 13.9, 0, 0, 5, false, "KIT-26A01", 365, "Assembled in-store"), kit: [{ productId: "cet10", qty: 1 }, { productId: "cfsyrup", qty: 1 }, { productId: "ors5", qty: 2 }], batches: [] },
    { ...p("kit-fa", "Travel First-Aid Kit", "Bandages + antiseptic", "CounterRx bundle", "firstaid", "Bundle · 2 products", 8.5, 0, 0, 5, false, "KIT-26A02", 365, "Assembled in-store"), kit: [{ productId: "band", qty: 1 }, { productId: "detl", qty: 1 }], batches: [] },
  ];

  /* NDC / GS1 identifiers (§3) — real-format codes on Rx & scanned items */
  const ndcs: Record<string, [string, string]> = {
    amx500: ["00093-0058-01", "00300093005801"], met500: ["00378-0048-01", "003000378004801"],
    atv20: ["00071-0155-23", "003000071015523"], aml5: ["59762-3719-01", "0030059762371901"],
    insg: ["00088-2220-33", "003000088222033"], salb: ["00173-0682-20", "003000173068220"],
    tram50: ["00093-0058-01", "003000093005801"], alpr05: ["59762-5019-01", "0030059762501901"],
    zolp5: ["00074-4340-13", "003000074434013"], codsyr: ["12496-1205-01", "003012496120501"],
    pcm500: ["50580-0501-01", "0030050580050101"], cet10: ["59762-1010-01", "0030059762101001"],
  };
  for (const x of base) {
    const n = ndcs[x.id];
    if (n) { x.ndc = n[0]; x.gtin = n[1]; }
  }

  /* Lot-level clearance pricing (1.4): push near-expiry Paracetamol at a discount */
  const pcm = base.find((x) => x.id === "pcm500");
  if (pcm) {
    pcm.batches = pcm.batches.map((b) => (b.batch === "PCM-24E14" ? { ...b, price: 1.2 } : b));
  }
  /* Multi-UOM pricing (§5) — multi-packs with their own price & barcode */
  const uomSeed: Record<string, Uom[]> = {
    pcm500: [{ code: "box", label: "Box of 10 strips", factor: 10, price: 16.2, cost: 6.3, barcode: "891pcm500box10" }],
    met500: [{ code: "box", label: "Box of 10 strips", factor: 10, price: 44.1, cost: 19.8, barcode: "891met500box10" }],
    cet10: [{ code: "box", label: "Box of 12 strips", factor: 12, price: 44.3, cost: 20.5, barcode: "891cet10box12" }],
    vd3: [{ code: "case", label: "Case of 6 bottles", factor: 6, price: 71.4, cost: 38.8, barcode: "891vd3case6" }],
    ors5: [{ code: "case", label: "Case of 20 packs", factor: 20, price: 70.2, cost: 32.4, barcode: "891ors5case20" }],
    band: [{ code: "case", label: "Case of 12 boxes", factor: 12, price: 45.4, cost: 21.6, barcode: "891bandcase12" }],
  };
  for (const [id, uoms] of Object.entries(uomSeed)) {
    const prod = base.find((x) => x.id === id);
    if (prod) prod.uoms = uoms;
  }
  /* Custom fields seeded on a handful of SKUs (6.7) */
  const withFields: Record<string, Field[]> = {
    insg: [{ key: "Storage", value: "2–8 °C · fridge zone B" }, { key: "Hazard class", value: "Cold chain" }],
    oxim: [{ key: "Vendor code", value: "DP-CMD-09" }, { key: "Recall flag", value: "none" }],
    spd50: [{ key: "Shelf life", value: "36 months" }],
    tram50: [{ key: "Storage", value: "Locked schedule cabinet" }, { key: "Hazard class", value: "C-IV · count sheet" }],
  };
  return base.map((x) => (withFields[x.id] ? { ...x, fields: withFields[x.id] } : x));
}

export function makePrescribers(): Prescriber[] {
  return [
    { id: "DR-01", name: "Dr. I. Bello", credentials: "MD", specialty: "Family medicine", npi: "1093847562", dea: "FB4482913", phone: "(555) 210-8830", fax: "(555) 210-8831", active: true },
    { id: "DR-02", name: "Dr. R. Vance", credentials: "MD, FACC", specialty: "Cardiology", npi: "1472639058", dea: "RV2214470", phone: "(555) 318-4410", fax: "(555) 318-4411", active: true },
    { id: "DR-03", name: "Dr. S. Adeyemi", credentials: "MD", specialty: "Endocrinology", npi: "1659308127", dea: "SA7730051", phone: "(555) 402-1190", fax: "(555) 402-1191", active: true },
    { id: "DR-04", name: "Dr. L. Tran", credentials: "DO", specialty: "Pediatrics", npi: "1831294670", dea: "LT5569934", phone: "(555) 909-2245", fax: "(555) 909-2246", active: true },
    { id: "DR-05", name: "Dr. H. Osei", credentials: "MD", specialty: "Psychiatry", npi: "1285764013", dea: "HO9917285", phone: "(555) 655-3370", fax: "(555) 655-3371", active: true },
  ];
}

export function makePrescriptions(now: number): Prescription[] {
  const m = 60_000;
  const h = 60 * m;
  const d = 24 * h;
  return [
    { id: "RX-2481", patient: "Marta Kessler", age: 34, productId: "amx500", qty: 2, prescriberId: "DR-01", status: "new", createdAt: now - 14 * m, note: "Take 1 capsule every 8h after food" },
    { id: "RX-2480", patient: "Daniel Osei", age: 61, productId: "atv20", qty: 2, prescriberId: "DR-02", status: "verifying", createdAt: now - 52 * m, note: "Refill — check interaction with amlodipine", daysSupply: 30, refillsAuthorized: 5, refillsRemaining: 2, rxExpiry: iso(now + 180 * d), insurance: { plan: "BlueCross PBM", memberId: "XCB-9917-31", status: "pending" } },
    { id: "RX-2479", patient: "Priya Nair", age: 45, productId: "met500", qty: 4, prescriberId: "DR-03", status: "ready", createdAt: now - 2.1 * h, daysSupply: 90, refillsAuthorized: 3, refillsRemaining: 3, rxExpiry: iso(now + 320 * d), phone: "(555) 909-1147" },
    { id: "RX-2478", patient: "Tom Alvarez", age: 8, productId: "salb", qty: 1, prescriberId: "DR-01", status: "waiting", createdAt: now - 3.4 * h, notifiedAt: now - 1.1 * h, note: "Guardian pickup — mother", phone: "(555) 130-4486" },
    { id: "RX-2477", patient: "Grace Lin", age: 52, productId: "insg", qty: 2, prescriberId: "DR-03", status: "verifying", createdAt: now - 5.2 * h, note: "Cold-chain — keep refrigerated", daysSupply: 28, phone: "(555) 655-7702", insurance: { plan: "Aetna Rx", memberId: "AET-8830-19", status: "pending" } },
    { id: "RX-2476", patient: "Samuel Eze", age: 29, productId: "azi250", qty: 1, prescriberId: "DR-02", status: "dispensed", createdAt: now - 8.6 * h, dispensedAt: now - 8.6 * h, daysSupply: 6 },
    { id: "RX-2475", patient: "Esther Mensah", age: 47, productId: "insg", qty: 3, prescriberId: "DR-03", status: "verifying", createdAt: now - 11 * h, note: "High-cost biologic — payer requires PA before fill", daysSupply: 84, phone: "(555) 209-8814", insurance: { plan: "BlueCross PBM", memberId: "XCB-5521-08", status: "verified" }, pa: { status: "pending", requestedAt: now - 9 * h, note: "Submitted via payer portal — awaiting clinical review" } },
    /* maintenance fills from earlier this month — feed the refill radar */
    { id: "RX-2441", patient: "Helen Okafor", age: 67, productId: "atv20", qty: 2, prescriberId: "DR-02", status: "dispensed", createdAt: now - 29 * d, dispensedAt: now - 29 * d, daysSupply: 30, refillsAuthorized: 5, refillsRemaining: 1, rxExpiry: iso(now + 150 * d), note: "Monthly maintenance — auto-refill allowed", insurance: { plan: "BlueCross PBM", memberId: "XCB-4471-02", status: "verified" }, pa: { status: "approved", requestedAt: now - 40 * d, decidedAt: now - 38 * d, note: "Approved 12 months — step therapy documented" } },
    { id: "RX-2436", patient: "Victor Adeyemi", age: 58, productId: "met500", qty: 4, prescriberId: "DR-03", status: "dispensed", createdAt: now - 33 * d, dispensedAt: now - 33 * d, daysSupply: 30, refillsAuthorized: 3, refillsRemaining: 0, rxExpiry: iso(now + 60 * d), insurance: { plan: "MediPlan Rx", memberId: "MPX-2210-44", status: "verified" } },
    /* clinical edge cases for dispense guards (§3/§5) */
    { id: "RX-2431", patient: "Helen Okafor", age: 67, productId: "alpr05", qty: 1, prescriberId: "DR-05", status: "ready", createdAt: now - 2 * h, daysSupply: 30, refillsAuthorized: 2, refillsRemaining: 0, rxExpiry: iso(now + 120 * d), note: "PRN anxiety — no refills left" },
    { id: "RX-2429", patient: "Marta Kessler", age: 34, productId: "amx500", qty: 1, prescriberId: "DR-01", status: "ready", createdAt: now - 3 * d, daysSupply: 7, refillsAuthorized: 1, refillsRemaining: 1, rxExpiry: iso(now - 5 * d), note: "Expired — do not dispense" },
    { id: "RX-2428", patient: "Priya Nair", age: 45, productId: "met500", qty: 4, prescriberId: "DR-03", status: "ready", createdAt: now - 1 * d, daysSupply: 30, refillsAuthorized: 3, refillsRemaining: 1, rxExpiry: iso(now + 200 * d), note: "Maintenance — refill too soon, last dispense 1 day ago" },
    { id: "RX-2427", patient: "Grace Lin", age: 52, productId: "insg", qty: 1, prescriberId: "DR-03", status: "ready", createdAt: now - 6 * h, daysSupply: 28, refillsAuthorized: 3, refillsRemaining: 2, rxExpiry: iso(now + 90 * d), dispensedAt: now - 6 * h, note: "Duplicate therapy — same class as RX-2477 insg" },
  ];
}

export function makeCustomers(now: number): Customer[] {
  const d = 86_400_000;
  return [
    { id: "C-001", name: "Helen Okafor", phone: "(555) 201-8834", email: "helen.o@mail.com", createdAt: now - 212 * d, notes: "Prefers 90-day fills", points: 342, allergies: ["Penicillin", "Latex"], dob: "1958-03-14", gender: "F", address: "42 Willow Drive, Springfield", bloodType: "O+", primaryPrescriberId: "DR-02", insurancePlan: "BlueCross PBM", clinicalNotes: "Hypertension + hyperlipidemia. Counseled on statin myopathy s/s 01/2026." },
    { id: "C-002", name: "Victor Adeyemi", phone: "(555) 318-0021", createdAt: now - 156 * d, points: 218, dob: "1967-11-02", gender: "M", address: "240 Cedar Court, Springfield", bloodType: "A+", primaryPrescriberId: "DR-03", insurancePlan: "MediPlan Rx", clinicalNotes: "T2DM. A1c 7.1 last panel. Renal function OK for metformin." },
    { id: "C-003", name: "Marta Kessler", phone: "(555) 774-2910", email: "mkessler@mail.com", createdAt: now - 98 * d, notes: "Penicillin allergy on file", points: 126, allergies: ["Penicillin"], dob: "1991-07-29", gender: "F", address: "9 Aspen Row, Springfield", bloodType: "B−", primaryPrescriberId: "DR-01", clinicalNotes: "Confirmed penicillin anaphylaxis 2019 — avoid all β-lactams." },
    { id: "C-004", name: "Daniel Osei", phone: "(555) 402-5519", createdAt: now - 74 * d, points: 94, allergies: ["Aspirin / NSAID"], dob: "1964-05-18", gender: "M", address: "310 Harbor Lane, Springfield", bloodType: "O−", primaryPrescriberId: "DR-02", insurancePlan: "BlueCross PBM" },
    { id: "C-005", name: "Priya Nair", phone: "(555) 909-1147", email: "priya.n@mail.com", createdAt: now - 41 * d, points: 265, dob: "1981-09-23", gender: "F", address: "77 Birch Street, Springfield", primaryPrescriberId: "DR-03", insurancePlan: "Aetna Rx" },
    { id: "C-006", name: "Grace Lin", phone: "(555) 655-7702", createdAt: now - 23 * d, notes: "Insulin — cold chain pickup", points: 71, allergies: ["Iodine"], dob: "1973-01-08", gender: "F", address: "18 Harbor Lane, Springfield", bloodType: "AB+", primaryPrescriberId: "DR-03", insurancePlan: "Aetna Rx", clinicalNotes: "Insulin glargine — rotate injection sites; cold chain mandatory." },
    { id: "C-007", name: "Tom Alvarez", phone: "(555) 130-4486", createdAt: now - 9 * d, notes: "Guardian: mother (pickup)", points: 18 },
    { id: "C-008", name: "Ruth Bello", phone: "(555) 887-3320", createdAt: now - 2 * d, points: 6 },
    { id: "C-009", name: "Maple Family Clinic", phone: "(555) 014-9900", email: "orders@mapleclinic.org", createdAt: now - 130 * d, notes: "Resale certificate on file", points: 0, taxExempt: true },
  ];
}

/** Patient back-order — out-of-stock Rx ordered for a named patient (§3) */
export type BackOrderStatus = "ordered" | "arrived" | "notified" | "fulfilled" | "cancelled";
export interface BackOrder {
  id: string; patient: string; phone?: string; productId: string; qty: number;
  createdAt: number; status: BackOrderStatus;
  etaDays: number; supplier: string;
  arrivedAt?: number; notifiedAt?: number;
}

export function makeBackOrders(now: number): BackOrder[] {
  const h = 3_600_000; const d = 24 * h;
  return [
    { id: "BO-101", patient: "Victor Adeyemi", phone: "(555) 318-0021", productId: "aml5", qty: 6, createdAt: now - 1.2 * d, status: "ordered", etaDays: 3, supplier: "MediSource Ltd" },
    { id: "BO-102", patient: "Samuel Eze", phone: "(555) 481-2209", productId: "oxim", qty: 1, createdAt: now - 2.6 * d, status: "arrived", etaDays: 2, supplier: "DevicePoint", arrivedAt: now - 2 * h },
    { id: "BO-103", patient: "Marta Kessler", phone: "(555) 774-2910", productId: "diclo50", qty: 3, createdAt: now - 3.4 * d, status: "notified", etaDays: 2, supplier: "PharmaLine Co", arrivedAt: now - 1.1 * d, notifiedAt: now - 5 * h },
  ];
}

export function makeTransfers(now: number): Transfer[] {
  const h = 3_600_000;
  return [
    { id: "TR-311", productId: "insg", qty: 4, toBranch: BRANCHES_FALLBACK[0].id, status: "requested", createdAt: now - 2.5 * h, requestedBy: "R. Mensah, RPh", note: "Northgate running low on glargine" },
    { id: "TR-310", productId: "ors5", qty: 24, toBranch: BRANCHES_FALLBACK[1].id, status: "approved", createdAt: now - 9 * h, requestedBy: "S-003" },
    { id: "TR-309", productId: "salb", qty: 6, toBranch: BRANCHES_FALLBACK[2].id, status: "shipped", createdAt: now - 26 * h, requestedBy: "D. Whitfield", note: "Flu-season demand at Harbor" },
  ];
}

/* deterministic RNG for stable seed history */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeTransactions(products: Product[], now: number): Transaction[] {
  const rnd = mulberry32(20260214);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const txs: Transaction[] = [];
  let seq = 1041;

  for (let d = 6; d >= 0; d--) {
    const base = now - d * day;
    const date = new Date(base); date.setHours(0, 0, 0, 0);
    const isToday = d === 0;
    const count = isToday ? 9 : 10 + Math.floor(rnd() * 9);
    const nowHour = new Date(now).getHours() + new Date(now).getMinutes() / 60;

    for (let i = 0; i < count; i++) {
      const hour = isToday
        ? 8.5 + (i / count) * Math.max(0.5, nowHour - 9)
        : 9 + rnd() * 11;
      if (isToday && hour > nowHour) continue;
      const at = date.getTime() + hour * 3_600_000 + rnd() * 30 * 60_000;
      const nLines = 1 + Math.floor(rnd() * 3);
      const chosen = new Set<string>();
      const lines: TxLine[] = [];
      for (let l = 0; l < nLines; l++) {
        const prod = pick(products);
        if (chosen.has(prod.id)) continue;
        chosen.add(prod.id);
        const qty = prod.category === "devices" ? 1 : 1 + Math.floor(rnd() * 2);
        /* record the FEFO lot trail so patient–lot recall tracing works on seeded history */
        const alloc: { batch: string; qty: number }[] = [];
        let remaining = qty;
        for (const b of fefoBatches(prod)) {
          if (remaining <= 0) break;
          const take = Math.min(b.qty, remaining);
          remaining -= take;
          if (take > 0) alloc.push({ batch: b.batch, qty: take });
        }
        lines.push({ productId: prod.id, name: prod.name, form: prod.form, qty, price: prod.price, rx: prod.rx, alloc: alloc.length ? alloc : undefined });
      }
      const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
      const discount = rnd() < 0.15 ? Math.round(subtotal * 0.05 * 100) / 100 : 0;
      const tax = 0;
      const total = Math.round((subtotal - discount + tax) * 100) / 100;
      const mRoll = rnd();
      const method: PayMethod = mRoll < 0.44 ? "cash" : mRoll < 0.86 ? "card" : "insurance";
      txs.push({
        id: `T-${seq++}`, at, lines,
        subtotal: Math.round(subtotal * 100) / 100, discount, tax, total,
        method, cashier: "Seeded history",
        tendered: method === "cash" ? Math.ceil(total / 10) * 10 : undefined,
        change: method === "cash" ? Math.round((Math.ceil(total / 10) * 10 - total) * 100) / 100 : undefined,
      });
    }
  }
  return txs.sort((a, b) => b.at - a.at);
}

export function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate + "T00:00:00").getTime() - Date.now()) / day);
}

/* ------------------------------------------------------------------ */
/*  Operations — deliveries, e-commerce intake, staff time-clock       */
/* ------------------------------------------------------------------ */

const DRIVERS = ["K. Boateng", "S. Mensah", "T. Osei"]; // seeded delivery history only

export type DeliveryStatus = "queued" | "assigned" | "out" | "delivered";
export interface Delivery {
  id: string;
  customerId: string;
  address: string;
  lines: { productId: string; qty: number }[];
  fee: number;
  mode: "delivery" | "curbside";
  status: DeliveryStatus;
  driver?: string;
  scheduledAt: number;
  proof?: string;          // proof-of-delivery note / signature ref (§7)
  createdAt: number;
}

export function makeDeliveries(now: number): Delivery[] {
  const h = 3_600_000;
  return [
    {
      id: "DL-301", customerId: "C-006", address: "18 Harbor Lane, Springfield",
      lines: [{ productId: "insg", qty: 2 }], fee: 6, mode: "delivery",
      status: "queued", scheduledAt: now + 3 * h, createdAt: now - 1 * h,
    },
    {
      id: "DL-302", customerId: "C-002", address: "240 Cedar Court, Springfield",
      lines: [{ productId: "met500", qty: 4 }, { productId: "vd3", qty: 1 }], fee: 4, mode: "curbside",
      status: "assigned", driver: DRIVERS[0], scheduledAt: now + 5 * h, createdAt: now - 3 * h,
    },
    {
      id: "DL-303", customerId: "C-005", address: "77 Birch Street, Springfield",
      lines: [{ productId: "cet10", qty: 2 }], fee: 0, mode: "delivery",
      status: "delivered", driver: DRIVERS[1], scheduledAt: now - 20 * h, createdAt: now - 26 * h,
      proof: "Left with reception — signed J.N.",
    },
  ];
}

export type WebOrderType = "refill" | "otc" | "rx_upload";
export type WebOrderChannel = "web" | "app";
export type WebPickup = "delivery" | "curbside" | "in_store";
export type WebOrderStatus = "new" | "accepted" | "converted" | "declined";
export interface WebOrder {
  id: string;
  customerName: string;
  phone: string;
  items: { productId?: string; name: string; qty: number }[];
  type: WebOrderType;
  channel: WebOrderChannel;
  pickup: WebPickup;
  status: WebOrderStatus;
  note?: string;
  declineReason?: string;
  createdAt: number;
}

export function makeWebOrders(now: number): WebOrder[] {
  const h = 3_600_000;
  return [
    {
      id: "WEB-118", customerName: "Priya Nair", phone: "(555) 909-1147",
      items: [{ productId: "met500", name: "Metformin 500mg", qty: 4 }],
      type: "refill", channel: "app", pickup: "curbside", status: "new",
      note: "Refill #RX-2479 — same dose", createdAt: now - 2 * h,
    },
    {
      id: "WEB-117", customerName: "Omar Haddad", phone: "(555) 210-7743",
      items: [{ productId: "cet10", name: "Cetirizine 10mg", qty: 2 }, { productId: "vitc", name: "Vitamin C 1000mg", qty: 1 }],
      type: "otc", channel: "web", pickup: "delivery", status: "new",
      note: "Deliver after 5pm please", createdAt: now - 5 * h,
    },
    {
      id: "WEB-116", customerName: "Grace Lin", phone: "(555) 655-7702",
      items: [{ productId: "insg", name: "Insulin glargine (photo attached)", qty: 2 }],
      type: "rx_upload", channel: "app", pickup: "in_store", status: "new",
      note: "Uploaded photo of new Rx from Dr. Adeyemi", createdAt: now - 9 * h,
    },
    {
      id: "WEB-115", customerName: "Daniel Osei", phone: "(555) 402-5519",
      items: [{ productId: "atv20", name: "Atorvastatin 20mg", qty: 2 }],
      type: "refill", channel: "web", pickup: "in_store", status: "converted",
      createdAt: now - 30 * h,
    },
  ];
}

export interface TimeEntry {
  id: number;
  staffId: string;
  inAt: number;
  outAt?: number;
}

/* ------------------------------------------------------------------ */
/*  Shift Management (§2) — open/close drawer, X/Z reports, cash       */
/*  over/short, paid-in/paid-out, manager approvals                    */
/* ------------------------------------------------------------------ */

export type ShiftStatus = "open" | "closed";
export type TenderType = "cash" | "card" | "insurance" | "store_credit";
export type TxType = "sale" | "refund" | "void" | "paid_in" | "paid_out";

export interface CashMovement {
  id: string;
  at: number;
  type: "paid_in" | "paid_out";
  amount: number;
  reason: string;
  cashier: string;
  approvedBy?: string; // manager approval for large amounts
}

export interface ShiftTransaction {
  txId: string;
  at: number;
  type: TxType;
  total: number;
  tenderType: TenderType;
  cashier: string;
  voidReason?: string;
  approvedBy?: string; // manager approval for voids
}

export interface Shift {
  id: string;
  terminalId: string;
  cashierId: string;
  cashierName: string;
  openedAt: number;
  closedAt?: number;
  status: ShiftStatus;
  openingBalance: number;
  closingBalance?: number;
  countedCash?: number; // actual cash counted at close
  transactions: ShiftTransaction[];
  cashMovements: CashMovement[];
  salesTotal: number;
  refundsTotal: number;
  cardTotal: number;
  insuranceTotal: number;
  storeCreditTotal: number;
  paidInTotal: number;
  paidOutTotal: number;
  expectedCash: number;
  overShort?: number; // positive = over, negative = short
  notes?: string;
}

export interface XReport {
  generatedAt: number;
  terminalId: string;
  cashierName: string;
  shiftId: string;
  openedAt: number;
  transactionCount: number;
  salesTotal: number;
  refundsTotal: number;
  tenderBreakdown: Record<TenderType, number>;
  cashMovements: CashMovement[];
  currentCash: number;
}

export interface ZReport extends XReport {
  closedAt: number;
  openingBalance: number;
  closingBalance: number;
  countedCash: number;
  overShort: number;
  notes?: string;
}

export function makeTimeEntries(now: number): TimeEntry[] {
  const d = 86_400_000; const h = 3_600_000;
  let seq = 500;
  const mk = (staffId: string, daysAgo: number, inH: number, lenH: number): TimeEntry => ({
    id: seq++, staffId,
    inAt: now - daysAgo * d - (24 - inH) * h,
    outAt: now - daysAgo * d - (24 - inH - lenH) * h,
  });
  return [
    mk("S-003", 1, 9, 8), mk("S-003", 2, 9, 7.5), mk("S-003", 3, 10, 8),
    mk("S-002", 1, 8, 9), mk("S-002", 2, 8, 8.5),
    mk("S-004", 1, 12, 6), mk("S-004", 2, 13, 5.5),
    mk("S-001", 1, 9, 4),
  ];
}

let shiftSeq = 1;
/** Create a new open shift for a cashier at a terminal */
export function createShift(terminalId: string, cashierId: string, cashierName: string, openingBalance: number, now: number): Shift {
  return {
    id: `SH-${String(shiftSeq++).padStart(4, "0")}`,
    terminalId,
    cashierId,
    cashierName,
    openedAt: now,
    status: "open",
    openingBalance,
    transactions: [],
    cashMovements: [],
    salesTotal: 0,
    refundsTotal: 0,
    cardTotal: 0,
    insuranceTotal: 0,
    storeCreditTotal: 0,
    paidInTotal: openingBalance,
    paidOutTotal: 0,
    expectedCash: openingBalance,
  };
}

/** Record a transaction in the shift log */
export function recordShiftTransaction(shift: Shift, tx: Transaction, type: TxType, tenderType: TenderType, voidReason?: string, approvedBy?: string): Shift {
  const shiftTx: ShiftTransaction = {
    txId: tx.id,
    at: tx.at,
    type,
    total: tx.total,
    tenderType,
    cashier: tx.cashier,
    voidReason,
    approvedBy,
  };
  
  const updated = { ...shift, transactions: [...shift.transactions, shiftTx] };
  
  // Update totals based on transaction type
  if (type === "sale") {
    updated.salesTotal += tx.total;
    if (tenderType === "cash") updated.expectedCash += tx.total;
    else if (tenderType === "card") updated.cardTotal += tx.total;
    else if (tenderType === "insurance") updated.insuranceTotal += tx.total;
    else if (tenderType === "store_credit") updated.storeCreditTotal += tx.total;
  } else if (type === "refund") {
    updated.refundsTotal += tx.total;
    if (tenderType === "cash") updated.expectedCash -= tx.total;
  } else if (type === "void") {
    // Voids don't affect totals directly, just logged
  }
  
  return updated;
}

/** Record a paid-in/paid-out cash movement */
export function recordCashMovement(shift: Shift, type: "paid_in" | "paid_out", amount: number, reason: string, cashier: string, approvedBy?: string): Shift {
  const movement: CashMovement = {
    id: `CM-${Date.now()}`,
    at: Date.now(),
    type,
    amount,
    reason,
    cashier,
    approvedBy,
  };
  
  const updated = { ...shift, cashMovements: [...shift.cashMovements, movement] };
  
  if (type === "paid_in") {
    updated.paidInTotal += amount;
    updated.expectedCash += amount;
  } else {
    updated.paidOutTotal += amount;
    updated.expectedCash -= amount;
  }
  
  return updated;
}

/** Close a shift and calculate over/short */
export function closeShift(shift: Shift, countedCash: number, notes?: string, now: number = Date.now()): Shift {
  const closingBalance = shift.openingBalance + shift.salesTotal - shift.refundsTotal + shift.paidInTotal - shift.paidOutTotal;
  const overShort = countedCash - shift.expectedCash;
  
  return {
    ...shift,
    closedAt: now,
    status: "closed",
    closingBalance,
    countedCash,
    overShort,
    notes,
  };
}

/** Generate an X report (mid-shift summary) */
export function generateXReport(shift: Shift): XReport {
  const tenderBreakdown: Record<TenderType, number> = {
    cash: 0,
    card: 0,
    insurance: 0,
    store_credit: 0,
  };
  
  shift.transactions.forEach(tx => {
    if (tx.type === "sale") {
      tenderBreakdown[tx.tenderType] += tx.total;
    } else if (tx.type === "refund" && tx.tenderType === "cash") {
      tenderBreakdown.cash -= tx.total;
    }
  });
  
  const currentCash = shift.openingBalance + tenderBreakdown.cash + shift.paidInTotal - shift.paidOutTotal;
  
  return {
    generatedAt: Date.now(),
    terminalId: shift.terminalId,
    cashierName: shift.cashierName,
    shiftId: shift.id,
    openedAt: shift.openedAt,
    transactionCount: shift.transactions.filter(tx => tx.type !== "void").length,
    salesTotal: shift.salesTotal,
    refundsTotal: shift.refundsTotal,
    tenderBreakdown,
    cashMovements: shift.cashMovements,
    currentCash,
  };
}

/** Generate a Z report (end-of-day final report) */
export function generateZReport(shift: Shift): ZReport | null {
  if (shift.status !== "closed" || !shift.countedCash) return null;
  
  const xReport = generateXReport(shift);
  
  return {
    ...xReport,
    closedAt: shift.closedAt!,
    openingBalance: shift.openingBalance,
    closingBalance: shift.closingBalance!,
    countedCash: shift.countedCash,
    overShort: shift.overShort!,
    notes: shift.notes,
  };
}

/* ------------------------------------------------------------------ */
/*  Multi-terminal reconciliation (W2.3) — per-terminal X/Z + all-     */
/*  terminals end-of-day Z. Shifts already carry terminalId; legacy    */
/*  shifts missing it fall back to the org's current terminal id.       */
/* ------------------------------------------------------------------ */

/** Resolve a shift's terminal id, falling back to the org's current
 *  terminal id when a (legacy) shift has none. */
export function terminalIdOf(shift: Shift, fallbackTerminalId: string): string {
  return (shift.terminalId && shift.terminalId.trim()) || fallbackTerminalId;
}

/** Per-terminal roll-up of one or more shifts. Counted cash uses the
 *  shift's counted amount when closed, else expected (nothing to
 *  reconcile yet) → variance is counted − expected. */
export interface TerminalRecon {
  terminalId: string;
  shifts: Shift[];
  salesTotal: number;
  refundsTotal: number;
  cardTotal: number;
  paidInTotal: number;
  paidOutTotal: number;
  expectedCash: number;
  countedCash: number;
  overShort: number;
  transactionCount: number;
  cashMovements: CashMovement[];
}

export function groupShiftsByTerminal(shifts: Shift[], fallbackTerminalId: string): TerminalRecon[] {
  const byTid = new Map<string, Shift[]>();
  for (const s of shifts) {
    const tid = terminalIdOf(s, fallbackTerminalId);
    if (!byTid.has(tid)) byTid.set(tid, []);
    byTid.get(tid)!.push(s);
  }
  const out: TerminalRecon[] = [];
  for (const [tid, list] of [...byTid.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const r: TerminalRecon = {
      terminalId: tid, shifts: list,
      salesTotal: 0, refundsTotal: 0, cardTotal: 0, paidInTotal: 0, paidOutTotal: 0,
      expectedCash: 0, countedCash: 0, overShort: 0, transactionCount: 0, cashMovements: [],
    };
    for (const s of list) {
      r.salesTotal += s.salesTotal;
      r.refundsTotal += s.refundsTotal;
      r.cardTotal += s.cardTotal;
      r.paidInTotal += s.paidInTotal;
      r.paidOutTotal += s.paidOutTotal;
      r.expectedCash += s.expectedCash;
      r.transactionCount += s.transactions.filter((t) => t.type !== "void").length;
      r.cashMovements.push(...s.cashMovements);
      if (s.status === "closed" && s.countedCash != null) {
        r.countedCash += s.countedCash;
        r.overShort += s.overShort ?? 0;
      } else {
        r.countedCash += s.expectedCash; // not yet counted → expected (0 variance)
      }
    }
    out.push(r);
  }
  return out;
}

/** Variance for a single terminal: counted drawer minus expected. */
export const terminalVariance = (expectedCash: number, countedCash: number): number =>
  Math.round((countedCash - expectedCash) * 100) / 100;

/** End-of-day Z aggregated across every terminal for the given date. */
export interface AllTerminalsZ {
  generatedAt: number;
  date: string;
  terminals: TerminalRecon[];
  totalSales: number;
  totalRefunds: number;
  totalPaidIn: number;
  totalPaidOut: number;
  totalExpectedCash: number;
  totalCountedCash: number;
  totalOverShort: number;
  transactionCount: number;
  cashMovements: CashMovement[];
}

export function allTerminalsZReport(shifts: Shift[], day: Date, fallbackTerminalId: string): AllTerminalsZ {
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  const to = from + 86_400_000;
  const dayShifts = shifts.filter((s) => s.openedAt >= from && s.openedAt < to);
  const terminals = groupShiftsByTerminal(dayShifts, fallbackTerminalId);
  let totalSales = 0, totalRefunds = 0, totalPaidIn = 0, totalPaidOut = 0;
  let totalExpectedCash = 0, totalCountedCash = 0, totalOverShort = 0, transactionCount = 0;
  const cashMovements: CashMovement[] = [];
  for (const t of terminals) {
    totalSales += t.salesTotal;
    totalRefunds += t.refundsTotal;
    totalPaidIn += t.paidInTotal;
    totalPaidOut += t.paidOutTotal;
    totalExpectedCash += t.expectedCash;
    totalCountedCash += t.countedCash;
    totalOverShort += t.overShort;
    transactionCount += t.transactionCount;
    cashMovements.push(...t.cashMovements);
  }
  return {
    generatedAt: Date.now(), date: start.toISOString().slice(0, 10), terminals,
    totalSales, totalRefunds, totalPaidIn, totalPaidOut,
    totalExpectedCash, totalCountedCash, totalOverShort, transactionCount, cashMovements,
  };
}

/** Analytics helpers for Phase F — LTV, supplier performance, expiry at-risk */
export function calculateLTV(customers: Customer[], transactions: Transaction[], now: number = Date.now()): { customerId: string; ltv: number; visits: number; avgBasket: number; lastVisit: number }[] {
  const results: { customerId: string; ltv: number; visits: number; avgBasket: number; lastVisit: number }[] = [];
  
  for (const customer of customers) {
    const customerTxns = transactions.filter(t => t.customerId === customer.id && !t.refundOf);
    if (customerTxns.length === 0) continue;
    
    const ltv = customerTxns.reduce((sum, t) => sum + t.total, 0);
    const visits = customerTxns.length;
    const avgBasket = ltv / visits;
    const lastVisit = Math.max(...customerTxns.map(t => t.at));
    
    results.push({ customerId: customer.id, ltv, visits, avgBasket, lastVisit });
  }
  
  return results.sort((a, b) => b.ltv - a.ltv);
}

export function supplierPerformance(purchaseOrders: PurchaseOrder[], apInvoices: ApInvoice[], deliveries: Delivery[], suppliers: Supplier[], now: number = Date.now()): { supplierId: string; supplierName: string; onTimeRate: number; avgLeadDays: number; totalSpend: number; invoiceCount: number }[] {
  const results: { supplierId: string; supplierName: string; onTimeRate: number; avgLeadDays: number; totalSpend: number; invoiceCount: number }[] = [];
  
  for (const supplier of suppliers) {
    const supplierPOs = purchaseOrders.filter(po => po.supplierId === supplier.id && po.status === "received");
    const supplierInvoices = apInvoices.filter(inv => inv.supplierId === supplier.id);
    
    if (supplierPOs.length === 0 && supplierInvoices.length === 0) continue;
    
    const onTimePOs = supplierPOs.filter(po => po.receivedAt && po.expectedAt && po.receivedAt <= po.expectedAt);
    const onTimeRate = supplierPOs.length > 0 ? onTimePOs.length / supplierPOs.length : 1;
    
    const leadDaysList = supplierPOs
      .filter(po => po.receivedAt && po.createdAt)
      .map(po => (po.receivedAt! - po.createdAt) / (1000 * 60 * 60 * 24));
    const avgLeadDays = leadDaysList.length > 0 
      ? leadDaysList.reduce((a, b) => a + b, 0) / leadDaysList.length
      : supplier.leadDays;
    
    const totalSpend = supplierInvoices.reduce((sum, inv) => sum + inv.total, 0);
    
    results.push({
      supplierId: supplier.id,
      supplierName: supplier.name,
      onTimeRate: Math.round(onTimeRate * 100) / 100,
      avgLeadDays: Math.round(avgLeadDays * 10) / 10,
      totalSpend: Math.round(totalSpend * 100) / 100,
      invoiceCount: supplierInvoices.length,
    });
  }
  
  return results.sort((a, b) => b.totalSpend - a.totalSpend);
}

export function expiryAtRisk(products: Product[], windowDays: number = 90, now: number = Date.now()): { productId: string; productName: string; batch: string; qty: number; expiryDate: number; daysUntilExpiry: number; valueAtRisk: number }[] {
  const results: { productId: string; productName: string; batch: string; qty: number; expiryDate: number; daysUntilExpiry: number; valueAtRisk: number }[] = [];
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  
  for (const product of products) {
    for (const batch of product.batches) {
      if (batch.qty <= 0) continue;
      if (!batch.expiry) continue;
      
      const expiryDate = parseISO(batch.expiry).getTime();
      if (isNaN(expiryDate)) continue;
      
      const daysUntilExpiry = Math.floor((expiryDate - now) / (24 * 60 * 60 * 1000));
      
      if (daysUntilExpiry <= windowDays && daysUntilExpiry >= 0) {
        const valueAtRisk = batch.qty * product.cost;
        results.push({
          productId: product.id,
          productName: product.name,
          batch: batch.batch,
          qty: batch.qty,
          expiryDate,
          daysUntilExpiry,
          valueAtRisk: Math.round(valueAtRisk * 100) / 100,
        });
      }
    }
  }
  
  return results.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}
