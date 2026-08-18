/* ------------------------------------------------------------------ */
/*  CounterRx — data model, seed catalog & helpers                     */
/* ------------------------------------------------------------------ */

export type CategoryId =
  | "antibiotics" | "pain" | "coldflu" | "vitamins" | "diabetes"
  | "cardio" | "derma" | "devices" | "firstaid" | "baby";

export const CATEGORIES: { id: CategoryId; label: string; dot: string }[] = [
  { id: "antibiotics", label: "Antibiotics", dot: "#c24a2e" },
  { id: "pain", label: "Pain relief", dot: "#e0a63c" },
  { id: "coldflu", label: "Cold & flu", dot: "#5da184" },
  { id: "vitamins", label: "Vitamins", dot: "#7d9c5a" },
  { id: "diabetes", label: "Diabetes", dot: "#4f7d9e" },
  { id: "cardio", label: "Cardio", dot: "#a05a79" },
  { id: "derma", label: "Skin care", dot: "#c98d5f" },
  { id: "devices", label: "Devices", dot: "#5c6b66" },
  { id: "firstaid", label: "First aid", dot: "#b8543f" },
  { id: "baby", label: "Baby care", dot: "#8a7fb5" },
];

/** A single stock lot on the shelf. Sales consume lots FEFO — first expiry, first out. */
export interface Batch { batch: string; expiry: string; qty: number; }

export interface Product {
  id: string; sku: string; barcode: string;
  name: string; generic: string; brand: string;
  category: CategoryId; form: string;
  price: number; cost: number;
  reorderLevel: number;
  rx: boolean;
  supplier: string;
  batches: Batch[];
}

export const stockOf = (p: Product): number => p.batches.reduce((s, b) => s + b.qty, 0);

/** Lots sorted first-expiry-first-out (earliest expiry sells first). */
export const fefoBatches = (p: { batches: Batch[] }): Batch[] =>
  [...p.batches].sort((a, b) => a.expiry.localeCompare(b.expiry) || a.batch.localeCompare(b.batch));

export const nearestExpiry = (p: Product): string | null => fefoBatches(p)[0]?.expiry ?? null;

/**
 * Consume `need` units from lots in FEFO order.
 * Returns the remaining lots plus an allocation trail for the receipt.
 */
export function allocFEFO(batches: Batch[], need: number): {
  batches: Batch[];
  alloc: { batch: string; qty: number }[];
} {
  const alloc: { batch: string; qty: number }[] = [];
  let remaining = need;
  const out: Batch[] = [];
  for (const b of fefoBatches({ batches })) {
    if (remaining <= 0) { out.push(b); continue; }
    const take = Math.min(b.qty, remaining);
    remaining -= take;
    if (take > 0) alloc.push({ batch: b.batch, qty: take });
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
  note?: string;                            // per-line counter note
}
export type PayMethod = "cash" | "card" | "insurance";
export interface PaymentLeg { method: PayMethod; amount: number; }
export interface Transaction {
  id: string; at: number; lines: TxLine[];
  subtotal: number; discount: number; tax: number; total: number;
  method: PayMethod; cashier: string; tendered?: number; change?: number;
  payments?: PaymentLeg[]; // split-tender legs (absent for legacy single-tender sales)
  refundedAt?: number;   // original sale was refunded
  refundOf?: string;     // this record is the refund of the given sale
  reason?: string;
}

export type RxStatus = "new" | "verifying" | "ready" | "dispensed";
export interface Prescription {
  id: string; patient: string; age: number; productId: string; qty: number;
  prescriber: string; status: RxStatus; createdAt: number; note?: string;
}

export interface HeldSale { id: string; label: string; at: number; items: { productId: string; qty: number; note?: string }[]; }

export const TAX_RATE = 0.08;
export const CASHIER = "A. Okafor";

const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function p(
  id: string, name: string, generic: string, brand: string, category: CategoryId, form: string,
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
  return [
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
    p("insg", "Insulin Glargine", "Insulin glargine 100IU/ml", "Lantus", "diabetes", "SoloStar pen · 3ml", 46.5, 33.0, 12, 10, true, "LNT-24K02", 44, "ColdChain Direct", ["LNT-25L15", 8, 300]),
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
    p("salb", "Salbutamol Inhaler", "Salbutamol 100mcg", "Ventolin", "coldflu", "Inhaler · 200 doses", 14.8, 9.1, 22, 10, true, "VNT-25I06", 28, "ColdChain Direct", ["VNT-25N19", 14, 190]),
    p("babyl", "Baby Lotion", "Gentle moisturizing lotion", "Johnson's", "baby", "Lotion · 200ml", 6.2, 3.5, 68, 20, false, "JNJ-25J18", 430, "Vital Trade"),
    p("gripe", "Gripe Water", "Dill oil preparation", "Woodward's", "baby", "Liquid · 200ml", 3.6, 1.7, 90, 25, false, "WWD-25K21", 350, "Apex Distributors"),
  ];
}

export function makePrescriptions(now: number): Prescription[] {
  const m = 60_000;
  return [
    { id: "RX-2481", patient: "Marta Kessler", age: 34, productId: "amx500", qty: 2, prescriber: "Dr. I. Bello", status: "new", createdAt: now - 14 * m, note: "Take 1 capsule every 8h after food" },
    { id: "RX-2480", patient: "Daniel Osei", age: 61, productId: "atv20", qty: 2, prescriber: "Dr. R. Vance", status: "verifying", createdAt: now - 52 * m, note: "Refill — check interaction with amlodipine" },
    { id: "RX-2479", patient: "Priya Nair", age: 45, productId: "met500", qty: 4, prescriber: "Dr. S. Adeyemi", status: "ready", createdAt: now - 2.1 * 60 * m },
    { id: "RX-2478", patient: "Tom Alvarez", age: 8, productId: "salb", qty: 1, prescriber: "Dr. I. Bello", status: "ready", createdAt: now - 3.4 * 60 * m, note: "Guardian pickup — mother" },
    { id: "RX-2477", patient: "Grace Lin", age: 52, productId: "insg", qty: 2, prescriber: "Dr. S. Adeyemi", status: "verifying", createdAt: now - 5.2 * 60 * m, note: "Cold-chain — keep refrigerated" },
    { id: "RX-2476", patient: "Samuel Eze", age: 29, productId: "azi250", qty: 1, prescriber: "Dr. R. Vance", status: "dispensed", createdAt: now - 8.6 * 60 * m },
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
        lines.push({ productId: prod.id, name: prod.name, form: prod.form, qty, price: prod.price, rx: prod.rx });
      }
      const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
      const discount = rnd() < 0.15 ? Math.round(subtotal * 0.05 * 100) / 100 : 0;
      const tax = Math.round((subtotal - discount) * TAX_RATE * 100) / 100;
      const total = Math.round((subtotal - discount + tax) * 100) / 100;
      const mRoll = rnd();
      const method: PayMethod = mRoll < 0.44 ? "cash" : mRoll < 0.86 ? "card" : "insurance";
      txs.push({
        id: `T-${seq++}`, at, lines,
        subtotal: Math.round(subtotal * 100) / 100, discount, tax, total,
        method, cashier: CASHIER,
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

export const STORE = {
  name: "CounterRx Pharmacy",
  branch: "Branch 04 — Maple & 9th",
  address: "214 Maple Avenue, Springfield",
  phone: "(555) 014-2210",
  gstin: "LIC #PH-88412 · GST 29AAKCS4412F1Z8",
};
