import type { PayMethod, Product, Staff, Transaction, TxLine } from "../data";

/* ------------------------------------------------------------------ */
/*  Report filters — pure, testable. The global Reports filter bar     */
/*  builds a ReportFilters object; every report tab consumes it via    */
/*  applyReportFilters (exports therefore use the already-filtered     */
/*  rows). Saved views persist as SavedReportView[] in org settings.    */
/* ------------------------------------------------------------------ */

export type ReportKind = "all" | "rx" | "otc";

export interface ReportFilters {
  from: number;        // ms epoch, inclusive
  to: number;          // ms epoch, inclusive
  categories: string[]; // category slugs (Product.category)
  suppliers: string[];  // supplier names (Product.supplier)
  cashiers: string[];   // staff ids → matched by staff name on the tx
  methods: PayMethod[];
  kind: ReportKind;
}

/** Named saved view — mirrors OrgSettings.savedReportViews. */
export interface SavedReportView {
  id: string;
  name: string;
  filters: ReportFilters;
}

export interface FilterCtx {
  products: Product[];
  staff: Staff[];
}

export function emptyFilters(): ReportFilters {
  return {
    from: 0,
    to: Number.MAX_SAFE_INTEGER,
    categories: [],
    suppliers: [],
    cashiers: [],
    methods: [],
    kind: "all",
  };
}

const nameSet = (staff: Staff[], ids: string[]) =>
  new Set(staff.filter((s) => ids.includes(s.id)).map((s) => s.name));

function lineMatches(l: TxLine, filters: ReportFilters, products: Product[]): boolean {
  if (filters.kind === "rx" && !l.rx) return false;
  if (filters.kind === "otc" && l.rx) return false;
  if (filters.categories.length) {
    const cat = products.find((p) => p.id === l.productId)?.category;
    if (!cat || !filters.categories.includes(cat)) return false;
  }
  if (filters.suppliers.length) {
    const sup = products.find((p) => p.id === l.productId)?.supplier;
    if (!sup || !filters.suppliers.includes(sup)) return false;
  }
  return true;
}

/** Transaction-level predicate — a tx passes when it is in range, the
 *  tx-level filters (method, cashier) match, and at least one line survives
 *  the line-level filters (category / supplier / Rx-OTC). */
export function matchesTx(tx: Transaction, filters: ReportFilters, ctx: FilterCtx): boolean {
  if (tx.at < filters.from || tx.at > filters.to) return false;
  if (filters.methods.length && !filters.methods.includes(tx.method)) return false;
  if (filters.cashiers.length && !nameSet(ctx.staff, filters.cashiers).has(tx.cashier)) return false;
  const lineCapped = filters.kind !== "all" || filters.categories.length > 0 || filters.suppliers.length > 0;
  if (lineCapped && !tx.lines.some((l) => lineMatches(l, filters, ctx.products))) return false;
  return true;
}

export function applyReportFilters(
  transactions: Transaction[],
  filters: ReportFilters,
  ctx: FilterCtx
): Transaction[] {
  return transactions.filter((t) => matchesTx(t, filters, ctx));
}

/* ------------------- saved views (name ⇄ filters) ------------------- */

export function viewId(): string {
  return `rv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Add or replace a named view. Returns the same array (identity) when the
 *  name is blank so a no-op save never triggers a settings write. */
export function saveView(
  views: SavedReportView[],
  name: string,
  filters: ReportFilters,
  id?: string
): SavedReportView[] {
  const trimmed = name.trim();
  if (!trimmed) return views;
  const view: SavedReportView = {
    id: id ?? viewId(),
    name: trimmed,
    filters: {
      ...filters,
      categories: [...filters.categories],
      suppliers: [...filters.suppliers],
      cashiers: [...filters.cashiers],
      methods: [...filters.methods],
    },
  };
  const exists = views.some((v) => v.id === view.id);
  return exists ? views.map((v) => (v.id === view.id ? view : v)) : [...views, view];
}

export function loadView(views: SavedReportView[], id: string): SavedReportView | undefined {
  return views.find((v) => v.id === id);
}

export function deleteView(views: SavedReportView[], id: string): SavedReportView[] {
  return views.filter((v) => v.id !== id);
}