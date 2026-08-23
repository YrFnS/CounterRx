import type { Product } from "../data";
import { newBatchCode } from "../data";

/* W3.7 CSV catalog import — parses the exact headers Inventory's export writes:
 * sku,name,generic,brand,category,form,price,cost,lot,lot_qty,expiry,total_stock,reorder_level,rx,supplier
 * Extra columns are ignored; lot/lot_qty/expiry become one opening batch per row (rows merge by sku). */

export const IMPORT_FIELDS = [
  "sku", "name", "generic", "brand", "category", "form",
  "price", "cost", "lot", "lot_qty", "expiry", "total_stock", "reorder_level", "rx", "supplier",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const HEADER_ALIASES: Partial<Record<ImportField | "barcode", string[]>> = {
  name: ["product", "product_name", "item"],
  sku: ["code", "item_code"],
  barcode: ["ean", "upc"],
  price: ["selling_price", "unit_price", "retail_price"],
  cost: ["unit_cost", "purchase_price"],
  reorder_level: ["reorderlevel", "reorder_point", "min_stock"],
  rx: ["requires_rx", "prescription", "prescription_only"],
  supplier: ["vendor", "distributor"],
};

/** Minimal RFC-4180-ish CSV parser: quoted fields, escaped quotes, \r\n line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur = "", row: string[] = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else if (c === '"' && cur === "") q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length > 0) { row.push(cur); if (row.some((v) => v !== "")) rows.push(row); }
  return rows;
}

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^\w]/g, "");

/** Map each import field to a CSV column index. Auto-maps by header name (+aliases); -1 = unmapped. */
export function autoMap(headers: string[]): Record<ImportField | "barcode", number> {
  const cols: Record<ImportField | "barcode", number> = Object.fromEntries(
    [...IMPORT_FIELDS, "barcode"].map((f) => [f, -1]),
  ) as Record<ImportField | "barcode", number>;
  const normed = headers.map(normHeader);
  for (const f of [...IMPORT_FIELDS, "barcode"] as (ImportField | "barcode")[]) {
    let idx = normed.indexOf(f);
    if (idx < 0 && HEADER_ALIASES[f]) idx = normed.findIndex((h) => (HEADER_ALIASES[f] as string[]).includes(h));
    cols[f] = idx;
  }
  return cols;
}

export interface ImportIssue { row: number; field: string; problem: "missing_name" | "bad_number" | "unknown_category" | "dup_sku" | "dup_barcode"; }

const num = (v: string): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.replace(/[^\d.eE+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const truthy = (v: string) => /^(true|1|yes|y)$/i.test(v.trim());

export interface ParseResult {
  issues: ImportIssue[];
  /** One per imported product (rows may merge by sku); issues carried for the valid-rows-only filter. */
  entries: { product: Product; rows: number[]; issues: ImportIssue[] }[];
}

/** Validate mapped rows against existing catalog + known category ids; build Product drafts. */
export function validateAndBuild(
  rows: string[][],
  cols: Record<ImportField | "barcode", number>,
  existing: Product[],
  categoryIds: Set<string>,
): ParseResult {
  const issues: ImportIssue[] = [];
  /* catalog sku/barcode owners — 0 marks "exists in catalog"; later values are in-file row numbers.
   * In-file repeats of the same key are NOT errors (they merge into one product, multi-lot). */
  const seenSku = new Map<string, number>();
  const seenBarcode = new Map<string, number>();
  for (const p of existing) {
    if (p.sku) seenSku.set(p.sku.toLowerCase(), 0);
    if (p.barcode) seenBarcode.set(p.barcode.toLowerCase(), 0);
  }

  /* first pass: per-row validation + draft lots */
  const drafts = new Map<string, { p: Product; rows: number[] }>(); // key: sku|barcode|row#
  rows.forEach((cells, i) => {
    const rowNo = i + 2; // header is line 1
    const get = (f: ImportField | "barcode") => {
      const c = cols[f];
      return c >= 0 && c < cells.length ? cells[c].trim() : "";
    };
    const name = get("name");
    const sku = get("sku");
    const barcode = get("barcode");
    if (!name) issues.push({ row: rowNo, field: "name", problem: "missing_name" });

    for (const f of ["cost", "reorder_level", "total_stock", "lot_qty"] as const)
      if (get(f) !== "" && num(get(f)) === null) issues.push({ row: rowNo, field: f, problem: "bad_number" });
    const priceRaw = get("price");
    const price = num(priceRaw) ?? 0;
    if (price <= 0) issues.push({ row: rowNo, field: "price", problem: "bad_number" });

    const cat = get("category");
    if (cat && !categoryIds.has(cat)) issues.push({ row: rowNo, field: "category", problem: "unknown_category" });

    const skuKey = sku.toLowerCase();
    if (skuKey && (seenSku.get(skuKey) ?? -1) === 0) issues.push({ row: rowNo, field: "sku", problem: "dup_sku" }); // exists in catalog
    else if (skuKey) seenSku.set(skuKey, rowNo);
    const bcKey = barcode.toLowerCase();
    if (bcKey && (seenBarcode.get(bcKey) ?? -1) === 0) issues.push({ row: rowNo, field: "barcode", problem: "dup_barcode" });
    else if (bcKey) seenBarcode.set(bcKey, rowNo);

    const qty = num(get("lot_qty")) ?? num(get("total_stock")) ?? 0;
    const key = skuKey || bcKey || `row${i}`;
    const found = drafts.get(key);
    const draft = found ?? {
      p: {
        id: `imp${Date.now().toString(36)}${i}`,
        sku: sku || `IMP-${String(i + 1).padStart(4, "0")}`,
        barcode,
        name,
        generic: get("generic") || name,
        brand: get("brand"),
        category: cat || "unfiled",
        form: get("form"),
        price, cost: num(get("cost")) ?? 0,
        reorderLevel: Math.round(num(get("reorder_level")) ?? 10),
        rx: truthy(get("rx")),
        supplier: get("supplier") || "CSV import",
        batches: [],
      },
      rows: [],
    };
    draft.rows.push(rowNo);
    const lot = get("lot"), expiry = get("expiry");
    draft.p.batches.push(lot && qty > 0
      ? { batch: lot, expiry: expiry || "", qty }
      // no usable lot columns — still open one lot so stock math works downstream
      : { batch: newBatchCode(), expiry: expiry || "", qty });
    drafts.set(key, draft);
  });

  const entries = Array.from(drafts.values()).map((d) => ({
    product: d.p,
    rows: d.rows,
    issues: issues.filter((is) => d.rows.includes(is.row)),
  }));
  return { issues, entries };
}
