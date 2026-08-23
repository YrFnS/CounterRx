import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import type { ReactNode } from "react";
import { usePos, money, clockTime } from "../store";
import { catLabel } from "../data";
import { fefoBatches, generateXReport, generateZReport, calculateLTV, supplierPerformance, expiryAtRisk } from "../data";
import type { Product, TxLine, Transaction, PayMethod, Shift, ZReport, Customer, Supplier, PurchaseOrder, ApInvoice } from "../data";
import { cx, Badge, Empty, Modal } from "../ui";
import { ITrendUp, IDownload, IX, IPlus, IBox, ICash, ISearch, ICalendar, IAlert, ICheck } from "../icons";
import { buildXlsx } from "../lib/export";
import { patientsForBatchCode } from "../data";

/* ------------------------------------------------------------------ */
/*  Costing helpers — every figure below derives from lot-level cost    */
/* ------------------------------------------------------------------ */
const lineCost = (l: TxLine, products: Product[]) =>
  l.cost !== undefined ? l.cost : products.find((p) => p.id === l.productId)?.cost ?? 0;

const inRange = (at: number, from: number, to: number) => at >= from && at <= to;

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/* ---------------- date range presets ---------------- */
type Preset = "today" | "7d" | "30d" | "month" | "all";
const DAY = 86_400_000;
function rangeFor(preset: Preset): { from: number; to: number } {
  const now = Date.now();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  switch (preset) {
    case "today": return { from: startOfDay.getTime(), to: now };
    case "7d": return { from: now - 7 * DAY, to: now };
    case "30d": return { from: now - 30 * DAY, to: now };
    case "month": { const m = new Date(); m.setDate(1); m.setHours(0, 0, 0, 0); return { from: m.getTime(), to: now }; }
    case "all": return { from: 0, to: now };
  }
}
const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: i18n.t("reports.today") }, { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" }, { id: "month", label: i18n.t("reports.thisMonth") }, { id: "all", label: i18n.t("reports.allTime") },
];

/* ================= MAIN VIEW ================= */
type Tab = "margin" | "valuation" | "pnl" | "builder" | "till" | "analytics" | "recall";
export default function Reports() {
  const { t } = useTranslation();
  const { state } = usePos();
  const [tab, setTab] = useState<Tab>("margin");
  const [preset, setPreset] = useState<Preset>("30d");
  const { from, to } = rangeFor(preset);

  /* partition the ledger once for the whole view */
  const ledger = useMemo(() => {
    const sales = state.transactions.filter((t) => !t.refundOf && inRange(t.at, from, to));
    const refunds = state.transactions.filter((t) => t.refundOf && inRange(t.at, from, to));
    return { sales, refunds };
  }, [state.transactions, from, to]);

  const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "margin", label: i18n.t("reports.margin"), icon: <ITrendUp size={14} /> },
    { id: "valuation", label: i18n.t("reports.cogsValuation"), icon: <IBox size={14} /> },
    { id: "pnl", label: "P&L", icon: <ICash size={14} /> },
    { id: "builder", label: i18n.t("reports.builder"), icon: <ISearch size={14} /> },
    { id: "till", label: i18n.t("reports.till"), icon: <ICash size={14} /> },
    { id: "analytics", label: i18n.t("analytics.title"), icon: <ITrendUp size={14} /> },
    { id: "recall", label: i18n.t("reports.recallLookup"), icon: <IAlert size={14} /> },
  ];

  return (
    <div className="h-full flex flex-col px-3 sm:px-6 py-4 sm:py-5 min-h-0">
      {/* header + range bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-pine-800 text-pine-50 shadow-lift"><ITrendUp size={18} /></span>
          <div>
            <h1 className="font-display font-bold text-lg text-ink leading-none">Financial reports</h1>
            <p className="text-[11px] text-inksoft mt-0.5">Lot-level FIFO costing · {ledger.sales.length} sales in range</p>
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 rounded-lg border border-mist bg-card p-1">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => setPreset(p.id)}
              className={cx("px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all duration-150",
                preset === p.id ? "bg-pine-700 text-pine-50 shadow-lift" : "text-inksoft hover:text-ink hover:bg-mist/60")}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* tab bar */}
      <div className="mt-4 flex gap-1.5 overflow-x-auto scroll-slim pb-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cx("flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border transition-all duration-150 whitespace-nowrap",
              tab === t.id ? "bg-ink text-paper border-ink shadow-lift" : "bg-card border-mist text-inksoft hover:text-ink hover:border-ink/30")}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex-1 min-h-0 overflow-y-auto scroll-slim pb-6">
        {tab === "margin" && <MarginTab ledger={ledger} />}
        {tab === "valuation" && <ValuationTab ledger={ledger} />}
        {tab === "pnl" && <PnlTab ledger={ledger} />}
        {tab === "builder" && <BuilderTab from={from} to={to} preset={preset} />}
        {tab === "till" && <TillTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "recall" && <RecallLookupTab />}
      </div>
    </div>
  );
}

/* ================= MARGIN TAB ================= */
function MarginTab({ ledger }: { ledger: { sales: Transaction[]; refunds: Transaction[] } }) {
  const { t } = useTranslation();
  const { state } = usePos();
  const [groupBy, setGroupBy] = useState<"product" | "category">("product");

  const rows = useMemo(() => {
    const agg = new Map<string, { key: string; label: string; units: number; revenue: number; cogs: number }>();
    const keyOf = (l: TxLine) => groupBy === "product"
      ? l.productId
      : state.products.find((p) => p.id === l.productId)?.category ?? "other";
    /* W2.1 — when grouping by category, child-category sales fold into the parent row. */
    const rollUp = (k: string) => {
      if (groupBy !== "category") return k;
      const c = state.categories?.find((x) => x.id === k);
      return c?.parentId ?? k;
    };
    const labelOf = (k: string) => groupBy === "product"
      ? state.products.find((p) => p.id === k)?.name ?? k
      : catLabel(k, state.categories);
    const add = (l: TxLine, sign: 1 | -1) => {
      const k = rollUp(keyOf(l));
      const cur = agg.get(k) ?? { key: k, label: labelOf(k), units: 0, revenue: 0, cogs: 0 };
      cur.units += sign * l.qty;
      cur.revenue += sign * l.qty * l.price;
      cur.cogs += sign * l.qty * lineCost(l, state.products);
      agg.set(k, cur);
    };
    ledger.sales.forEach((t) => t.lines.forEach((l) => add(l, 1)));
    ledger.refunds.forEach((t) => t.lines.forEach((l) => add(l, -1)));
    return [...agg.values()]
      .map((r) => ({ ...r, margin: r.revenue - r.cogs, pct: r.revenue > 0 ? ((r.revenue - r.cogs) / r.revenue) * 100 : 0 }))
      .sort((a, b) => b.margin - a.margin);
  }, [ledger, groupBy, state.products]);

  const totals = rows.reduce((s, r) => ({ revenue: s.revenue + r.revenue, cogs: s.cogs + r.cogs, margin: s.margin + r.margin }), { revenue: 0, cogs: 0, margin: 0 });

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Seg value={groupBy} onChange={setGroupBy} options={[{ id: "product", label: i18n.t("reports.byProduct") }, { id: "category", label: i18n.t("reports.byCategory") }]} />
        <div className="flex-1" />
        <ExportCsv name={`margin-${groupBy}`} head={["name", "units", "revenue", "cogs", "margin", "margin_pct"]}
          rows={rows.map((r) => [r.label, r.units, r.revenue.toFixed(2), r.cogs.toFixed(2), r.margin.toFixed(2), r.pct.toFixed(1)])} />
      </div>

      <StatStrip stats={[
        { label: "Revenue", value: money(totals.revenue) },
        { label: "COGS", value: money(totals.cogs) },
        { label: "Gross margin", value: money(totals.margin), accent: totals.margin >= 0 },
        { label: "Margin %", value: `${totals.revenue > 0 ? ((totals.margin / totals.revenue) * 100).toFixed(1) : "0.0"}%` },
      ]} />

      <div className="mt-4 rounded-xl border border-mist bg-card shadow-lift overflow-auto scroll-slim">
        <table className="w-full text-sm border-collapse min-w-[680px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-pine-900 text-pine-100 text-start text-[10px] uppercase tracking-[0.14em]">
              <th className="px-4 py-2.5 font-bold">{groupBy === "product" ? "Product" : "Category"}</th>
              <th className="px-3 py-2.5 font-bold text-center">Units</th>
              <th className="px-3 py-2.5 font-bold text-end">Revenue</th>
              <th className="px-3 py-2.5 font-bold text-end">COGS</th>
              <th className="px-3 py-2.5 font-bold text-end">Margin</th>
              <th className="px-4 py-2.5 font-bold text-end w-44">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className={cx("border-t border-mist/70 transition-colors hover:bg-pine-50/60", i % 2 === 1 && "bg-paper/50")}>
                <td className="px-4 py-2 font-semibold text-ink">{r.label}</td>
                <td className="px-3 py-2 text-center num text-inksoft">{r.units}</td>
                <td className="px-3 py-2 text-end num text-ink">{money(r.revenue)}</td>
                <td className="px-3 py-2 text-end num text-inksoft">{money(r.cogs)}</td>
                <td className={cx("px-3 py-2 text-end num font-bold", r.margin >= 0 ? "text-pine-800" : "text-brick-700")}>{money(r.margin)}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <span className={cx("num text-xs font-bold w-12 text-end", r.pct >= 0 ? "text-pine-800" : "text-brick-700")}>{r.pct.toFixed(1)}%</span>
                    <div className="h-1.5 w-24 rounded-full bg-mist/70 overflow-hidden">
                      <div className={cx("anim-grow-w h-full rounded-full", r.pct >= 0 ? "bg-pine-600" : "bg-brick-500")}
                        style={{ width: `${Math.min(100, Math.abs(r.pct))}%`, animationDelay: `${i * 40}ms` }} />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}><Empty icon={<ITrendUp size={20} />} title="No sales in range" hint="Widen the date range to see margin." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= COGS & VALUATION TAB ================= */
function ValuationTab({ ledger }: { ledger: { sales: Transaction[]; refunds: Transaction[] } }) {
  const { state } = usePos();

  const cogs = useMemo(() => {
    const sold = ledger.sales.reduce((s, t) => s + t.lines.reduce((x, l) => x + l.qty * lineCost(l, state.products), 0), 0);
    const returned = ledger.refunds.reduce((s, t) => s + t.lines.reduce((x, l) => x + l.qty * lineCost(l, state.products), 0), 0);
    return sold - returned;
  }, [ledger, state.products]);

  const valuation = useMemo(() => {
    let cost = 0, retail = 0, units = 0, lots = 0;
    const rows: { name: string; batch: string; expiry: string; qty: number; cost: number; value: number }[] = [];
    for (const p of state.products) {
      for (const b of fefoBatches(p)) {
        const c = b.cost ?? p.cost;
        cost += b.qty * c; retail += b.qty * p.price; units += b.qty; lots++;
        rows.push({ name: p.name, batch: b.batch, expiry: b.expiry, qty: b.qty, cost: c, value: b.qty * c });
      }
    }
    return { cost, retail, units, lots, rows: rows.sort((a, b) => b.value - a.value) };
  }, [state.products]);

  return (
    <div>
      <StatStrip stats={[
        { label: "COGS in range", value: money(cogs) },
        { label: "Stock on hand", value: `${valuation.units} units` },
        { label: "Value at cost (FIFO)", value: money(valuation.cost), accent: true },
        { label: "Potential retail", value: money(valuation.retail) },
        { label: "Unrealized margin", value: money(valuation.retail - valuation.cost) },
      ]} />

      <div className="mt-4 flex items-center justify-between mb-0">
        <h2 className="font-display font-bold text-[15px] text-ink">Lot valuation · {valuation.lots} lots</h2>
        <ExportCsv name="inventory-valuation" head={["product", "batch", "expiry", "qty", "unit_cost", "value_at_cost"]}
          rows={valuation.rows.map((r) => [r.name, r.batch, r.expiry, r.qty, r.cost.toFixed(2), r.value.toFixed(2)])} />
      </div>
      <div className="mt-2 rounded-xl border border-mist bg-card shadow-lift overflow-auto scroll-slim">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-pine-900 text-pine-100 text-start text-[10px] uppercase tracking-[0.14em]">
              <th className="px-4 py-2.5 font-bold">Product · lot</th>
              <th className="px-3 py-2.5 font-bold">Expiry</th>
              <th className="px-3 py-2.5 font-bold text-center">Qty</th>
              <th className="px-3 py-2.5 font-bold text-end">Unit cost</th>
              <th className="px-4 py-2.5 font-bold text-end">Value at cost</th>
            </tr>
          </thead>
          <tbody>
            {valuation.rows.map((r, i) => (
              <tr key={`${r.batch}`} className={cx("border-t border-mist/70", i % 2 === 1 && "bg-paper/50")}>
                <td className="px-4 py-2"><span className="font-semibold text-ink">{r.name}</span> <span className="num text-[10px] text-inksoft">· {r.batch}</span></td>
                <td className="px-3 py-2 num text-inksoft">{r.expiry}</td>
                <td className="px-3 py-2 text-center num font-bold text-ink">{r.qty}</td>
                <td className="px-3 py-2 text-end num text-inksoft">{money(r.cost)}</td>
                <td className="px-4 py-2 text-end num font-bold text-pine-800">{money(r.value)}</td>
              </tr>
            ))}
            {valuation.rows.length === 0 && <tr><td colSpan={5}><Empty icon={<IBox size={20} />} title="No stock" hint="Receive a purchase order to value inventory." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================= P&L TAB ================= */
function PnlTab({ ledger }: { ledger: { sales: Transaction[]; refunds: Transaction[] } }) {
  const { state } = usePos();

  const pnl = useMemo(() => {
    const gross = ledger.sales.reduce((s, t) => s + t.subtotal, 0);
    const discounts = ledger.sales.reduce((s, t) => s + t.discount + (t.bulkSavings ?? 0) + (t.loyaltyDeduct ?? 0), 0);
    const net = gross - discounts;
    const cogs = ledger.sales.reduce((s, t) => s + t.lines.reduce((x, l) => x + l.qty * lineCost(l, state.products), 0), 0)
      - ledger.refunds.reduce((s, t) => s + t.lines.reduce((x, l) => x + l.qty * lineCost(l, state.products), 0), 0);
    const grossProfit = net - cogs;
    const refunded = ledger.refunds.reduce((s, t) => s + Math.abs(t.total), 0);
    return { gross, discounts, net, cogs, grossProfit, refunded };
  }, [ledger, state.products]);

  /* expenses in the same window as the selected header range */
  const { from: ef, to: et } = useMemo(() => ({ from: ledger.sales.length || ledger.refunds.length ? Math.min(...[...ledger.sales, ...ledger.refunds].map((t) => t.at)) : 0, to: Date.now() }), [ledger]);
  const expenses = useMemo(() => {
    const inWin = state.expenses.filter((e) => e.date >= ef && e.date <= et);
    const byCat = new Map<string, number>();
    inWin.forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount));
    return { total: inWin.reduce((s, e) => s + e.amount, 0), byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]) };
  }, [state.expenses, ef, et]);

  const netIncome = pnl.grossProfit - expenses.total;

  const Row = ({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "pos" | "neg" }) => (
    <div className={cx("flex items-center justify-between px-4 py-2.5 border-b border-mist/60 last:border-0", strong && "bg-pine-50/60")}>
      <span className={cx("text-sm", strong ? "font-display font-bold text-ink" : "text-inksoft")}>{label}</span>
      <span className={cx("num font-bold", strong ? "text-[15px]" : "text-sm",
        tone === "neg" ? "text-brick-700" : tone === "pos" ? "text-pine-800" : "text-ink")}>{value}</span>
    </div>
  );

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3 rounded-xl border border-mist bg-card shadow-lift overflow-hidden anim-fade-up">
        <div className="px-4 py-3 border-b border-mist flex items-center justify-between">
          <h2 className="font-display font-bold text-[15px] text-ink">Profit & loss</h2>
          <Badge tone="mist">accrual · at cost</Badge>
        </div>
        <Row label="Gross sales" value={money(pnl.gross)} />
        <Row label="Discounts, bulk & loyalty" value={`−${money(pnl.discounts)}`} tone="neg" />
        <Row label="Net sales" value={money(pnl.net)} strong />
        <Row label="Cost of goods sold (FIFO)" value={`−${money(pnl.cogs)}`} tone="neg" />
        <Row label="Gross profit" value={money(pnl.grossProfit)} strong tone={pnl.grossProfit >= 0 ? "pos" : "neg"} />
        <div className="px-4 py-2 bg-paper/60 text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Operating expenses</div>
        {expenses.byCat.map(([c, v]) => <Row key={c} label={c} value={`−${money(v)}`} tone="neg" />)}
        {expenses.byCat.length === 0 && <Row label="No expenses in window" value={money(0)} />}
        <Row label="Total expenses" value={`−${money(expenses.total)}`} strong tone="neg" />
        <div className={cx("flex items-center justify-between px-4 py-3.5", netIncome >= 0 ? "bg-pine-800" : "bg-brick-600")}>
          <span className="font-display font-bold text-paper">Net income</span>
          <span className="num font-bold text-lg text-paper">{money(netIncome)}</span>
        </div>
      </div>

      <div className="lg:col-span-2 flex flex-col gap-4">
        <div className="rounded-xl border border-mist bg-card shadow-lift p-4 anim-fade-up">
          <h3 className="font-display font-bold text-[14px] text-ink mb-3">Key ratios</h3>
          <RatioRow label="Gross margin" pct={pnl.net > 0 ? (pnl.grossProfit / pnl.net) * 100 : 0} />
          <RatioRow label="Net margin" pct={pnl.net > 0 ? (netIncome / pnl.net) * 100 : 0} />
          <RatioRow label="COGS ratio" pct={pnl.net > 0 ? (pnl.cogs / pnl.net) * 100 : 0} />
        </div>
        <div className="rounded-xl border border-mist bg-card shadow-lift p-4 anim-fade-up flex-1">
          <h3 className="font-display font-bold text-[14px] text-ink mb-2">Notes</h3>
          <ul className="text-xs text-inksoft space-y-1.5 leading-relaxed">
            <li>· COGS uses the <span className="font-semibold text-ink">FIFO lot cost</span> captured when each unit sold.</li>
            <li>· Refunds in the window <span className="font-semibold text-ink">credit COGS</span> ({money(pnl.refunded)} refunded).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ================= REPORT BUILDER TAB ================= */
interface BuilderConfig {
  groupBy: "product" | "category" | "day" | "method";
  kind: "all" | "rx" | "otc";
  method: "all" | PayMethod;
  showUnits: boolean; showCogs: boolean; showMargin: boolean;
}
const DEFAULT_CONFIG: BuilderConfig = { groupBy: "category", kind: "all", method: "all", showUnits: true, showCogs: true, showMargin: true };
const VIEWS_KEY = "counterrx:reportviews";

function BuilderTab({ from, to, preset }: { from: number; to: number; preset: Preset }) {
  const { t } = useTranslation();
  const { state } = usePos();
  const [cfg, setCfg] = useState<BuilderConfig>(DEFAULT_CONFIG);
  const [views, setViews] = useState<{ name: string; cfg: BuilderConfig }[]>(() => {
    try { return JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "[]"); } catch { return []; }
  });
  const [saveName, setSaveName] = useState("");

  useEffect(() => { try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); } catch { /* full */ } }, [views]);

  const rows = useMemo(() => {
    const keyOf = (t: Transaction, l: TxLine): string => {
      switch (cfg.groupBy) {
        case "product": return l.productId;
        case "category": return state.products.find((p) => p.id === l.productId)?.category ?? "other";
        case "day": { const d = new Date(t.at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
        case "method": return t.method;
      }
    };
    /* W2.1 — category rows fold child categories into their parent. */
    const rollUp = (k: string) => {
      if (cfg.groupBy !== "category") return k;
      const parent = state.categories?.find((x) => x.id === k)?.parentId;
      return parent ?? k;
    };
    const labelOf = (k: string): string => {
      switch (cfg.groupBy) {
        case "product": return state.products.find((p) => p.id === k)?.name ?? k;
        case "category": return catLabel(k, state.categories);
        case "day": return k;
        case "method": return k;
      }
    };
    const agg = new Map<string, { label: string; count: number; units: number; revenue: number; cogs: number }>();
    const consider = (t: Transaction, sign: 1 | -1) => {
      if (cfg.method !== "all" && t.method !== cfg.method) return;
      for (const l of t.lines) {
        if (cfg.kind === "rx" && !l.rx) continue;
        if (cfg.kind === "otc" && l.rx) continue;
        const k = rollUp(keyOf(t, l));
        const cur = agg.get(k) ?? { label: labelOf(k), count: 0, units: 0, revenue: 0, cogs: 0 };
        cur.count += sign;
        cur.units += sign * l.qty;
        cur.revenue += sign * l.qty * l.price;
        cur.cogs += sign * l.qty * lineCost(l, state.products);
        agg.set(k, cur);
      }
    };
    state.transactions.filter((t) => inRange(t.at, from, to)).forEach((t) => consider(t, t.refundOf ? -1 : 1));
    return [...agg.values()]
      .map((r) => ({ ...r, margin: r.revenue - r.cogs }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [cfg, state.transactions, state.products, from, to]);

  const head = ["group", "lines", ...(cfg.showUnits ? ["units"] : []), "revenue", ...(cfg.showCogs ? ["cogs"] : []), ...(cfg.showMargin ? ["margin"] : [])];
  const exportRows = rows.map((r) => [r.label, r.count, ...(cfg.showUnits ? [String(r.units)] : []), r.revenue.toFixed(2), ...(cfg.showCogs ? [r.cogs.toFixed(2)] : []), ...(cfg.showMargin ? [r.margin.toFixed(2)] : [])]);

  return (
    <div className="grid lg:grid-cols-4 gap-4">
      {/* config rail */}
      <div className="lg:col-span-1 rounded-xl border border-mist bg-card shadow-lift p-4 h-fit anim-fade-up">
        <h3 className="font-display font-bold text-[14px] text-ink mb-3">Build a report</h3>
        <Field label="Group by">
          <Seg value={cfg.groupBy} onChange={(v) => setCfg({ ...cfg, groupBy: v })}
            options={[{ id: "product", label: "Product" }, { id: "category", label: "Category" }, { id: "day", label: "Day" }, { id: "method", label: "Tender" }]} vertical />
        </Field>
        <Field label="Item type">
          <Seg value={cfg.kind} onChange={(v) => setCfg({ ...cfg, kind: v })}
            options={[{ id: "all", label: "All" }, { id: "rx", label: "℞ only" }, { id: "otc", label: "OTC only" }]} vertical />
        </Field>
        <Field label="Tender">
          <Seg value={cfg.method} onChange={(v) => setCfg({ ...cfg, method: v })}
            options={[{ id: "all", label: "All" }, { id: "cash", label: "Cash" }, { id: "card", label: "Card" }, { id: "insurance", label: "Insurance" }]} vertical />
        </Field>
        <div className="mt-3 space-y-1.5">
          {([["showUnits", "Units"], ["showCogs", "COGS"], ["showMargin", t("reports.margin")]] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
              <input type="checkbox" checked={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.checked })}
                className="w-3.5 h-3.5 accent-pine-700" />
              {label}
            </label>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-mist">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-1.5">Saved views</p>
          <div className="flex gap-1.5">
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="View name"
              className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-mist text-xs focus:border-pine-500 focus:outline-none" />
            <button onClick={() => { if (saveName.trim()) { setViews((v) => [...v, { name: saveName.trim(), cfg }]); setSaveName(""); } }}
              className="px-2 rounded-md bg-pine-700 text-pine-50 hover:bg-pine-600 transition active:scale-95" aria-label="Save view"><IPlus size={13} /></button>
          </div>
          <div className="mt-2 space-y-1">
            {views.map((v, i) => (
              <div key={`${v.name}-${i}`} className="flex items-center gap-1.5 group">
                <button onClick={() => setCfg(v.cfg)}
                  className="flex-1 text-start text-xs font-semibold text-ink hover:text-pine-700 truncate transition-colors">{v.name}</button>
                <button onClick={() => setViews((vs) => vs.filter((_, j) => j !== i))}
                  className="p-0.5 rounded text-inksoft opacity-0 group-hover:opacity-100 hover:text-brick-700 transition" aria-label={`Delete ${v.name}`}><IX size={11} /></button>
              </div>
            ))}
            {views.length === 0 && <p className="text-[10px] text-inksoft">No saved views yet.</p>}
          </div>
        </div>
      </div>

      {/* results */}
      <div className="lg:col-span-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-inksoft"><span className="font-bold text-ink">{rows.length}</span> groups · {PRESETS.find((p) => p.id === preset)?.label ?? "range"} ledger</p>
          <ExportCsv name="custom-report" head={head} rows={exportRows} />
        </div>
        <div className="rounded-xl border border-mist bg-card shadow-lift overflow-auto scroll-slim">
          <table className="w-full text-sm border-collapse min-w-[560px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-pine-900 text-pine-100 text-start text-[10px] uppercase tracking-[0.14em]">
                <th className="px-4 py-2.5 font-bold">Group</th>
                <th className="px-3 py-2.5 font-bold text-center">Lines</th>
                {cfg.showUnits && <th className="px-3 py-2.5 font-bold text-center">Units</th>}
                <th className="px-3 py-2.5 font-bold text-end">Revenue</th>
                {cfg.showCogs && <th className="px-3 py-2.5 font-bold text-end">COGS</th>}
                {cfg.showMargin && <th className="px-4 py-2.5 font-bold text-end">Margin</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className={cx("border-t border-mist/70", i % 2 === 1 && "bg-paper/50")}>
                  <td className="px-4 py-2 font-semibold text-ink">{r.label}</td>
                  <td className="px-3 py-2 text-center num text-inksoft">{r.count}</td>
                  {cfg.showUnits && <td className="px-3 py-2 text-center num text-inksoft">{r.units}</td>}
                  <td className="px-3 py-2 text-end num text-ink">{money(r.revenue)}</td>
                  {cfg.showCogs && <td className="px-3 py-2 text-end num text-inksoft">{money(r.cogs)}</td>}
                  {cfg.showMargin && <td className={cx("px-4 py-2 text-end num font-bold", r.margin >= 0 ? "text-pine-800" : "text-brick-700")}>{money(r.margin)}</td>}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6}><Empty icon={<ISearch size={20} />} title="Nothing matches" hint="Loosen the filters to see results." /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================= shared bits ================= */
function StatStrip({ stats }: { stats: { label: string; value: string; accent?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
      {stats.map((s, i) => (
        <div key={s.label} style={{ animationDelay: `${i * 50}ms` }}
          className={cx("anim-fade-up rounded-xl border px-3.5 py-2.5", s.accent ? "bg-pine-800 border-pine-800 text-pine-50" : "bg-card border-mist")}>
          <p className={cx("text-[10px] font-bold uppercase tracking-[0.14em]", s.accent ? "text-pine-200" : "text-inksoft")}>{s.label}</p>
          <p className={cx("num text-lg font-bold leading-tight", s.accent ? "text-pine-50" : "text-ink")}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function RatioRow({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-ink">{label}</span><span className="num font-bold text-pine-800">{pct.toFixed(1)}%</span></div>
      <div className="h-2 rounded-full bg-mist/70 overflow-hidden">
        <div className="anim-grow-w h-full rounded-full bg-pine-600" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-1">{label}</p>
      {children}
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options, vertical }: {
  value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; vertical?: boolean;
}) {
  return (
    <div className={cx("flex gap-1 rounded-lg border border-mist bg-paper p-0.5", vertical ? "flex-col" : "")}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={cx("px-2 py-1 rounded-md text-[11px] font-bold transition-all duration-150",
            value === o.id ? "bg-pine-700 text-pine-50 shadow-lift" : "text-inksoft hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ExportCsv({ name, head, rows }: { name: string; head: string[]; rows: (string | number)[][] }) {
  const { dispatch } = usePos();
  const { t } = useTranslation();
  const go = () => {
    const blob = new Blob([[head.join(","), ...rows.map((r) => r.join(","))].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    dispatch({ type: "TOAST", kind: "success", msg: `${name}.csv exported` });
  };
  const goExcel = () => {
    const tRows: Record<string, unknown>[] = rows.map((r) =>
      Object.fromEntries(head.map((h, i) => [h, r[i]])));
    const buf = buildXlsx(tRows, `${name}.xlsx`);
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
    dispatch({ type: "TOAST", kind: "success", msg: `${name}.xlsx exported` });
  };
  return (
    <div className="flex gap-1.5">
      <button onClick={go}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95">
        <IDownload size={13} /> Export CSV
      </button>
      <button onClick={goExcel}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-mist text-ink border border-mist text-xs font-semibold hover:border-pine-300 hover:bg-pine-50 transition active:scale-95">
        <IDownload size={13} /> {t("reports.exportExcel")}
      </button>
    </div>
  );
}

/* ================= TILL TAB (Phase A) — X/Z reports ================= */
function TillTab() {
  const { t } = useTranslation();
  const { state, dispatch } = usePos();
  const [closing, setClosing] = useState<Shift | null>(null);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [viewShift, setViewShift] = useState<Shift | null>(null);

  const openShift = state.currentShift;
  const closedShifts = useMemo(
    () => state.shifts.filter((s) => s.status === "closed").sort((a, b) => b.openedAt - a.openedAt),
    [state.shifts]);

  const xReport = openShift ? generateXReport(openShift) : null;

  return (
    <div className="space-y-4">
      {/* open shift — live X snapshot, Z closes it */}
      {openShift && xReport ? (
        <div className="rounded-xl border-2 border-pine-300 bg-pine-50/40 p-4 anim-fade-up">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-display font-bold text-ink flex items-center gap-2"><ICash size={18} className="text-pine-700" /> {t("reports.tillOpen")} · {openShift.id}</h2>
              <p className="text-[11px] text-inksoft mt-0.5">{openShift.cashierName} · {openShift.terminalId} · opened {clockTime(openShift.openedAt)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setViewShift(openShift)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-mist bg-card text-xs font-bold text-ink hover:border-pine-400 hover:bg-pine-50 transition active:scale-95">
                <ICalendar size={14} /> {t("reports.xReport")}
              </button>
              <button onClick={() => { setCounted(String(openShift.expectedCash)); setNotes(""); setClosing(openShift); }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-ink text-paper text-xs font-bold hover:bg-pine-900 transition active:scale-95 shadow-lift">
                {t("reports.zReport")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-mist bg-card p-6 text-center">
          <p className="text-sm text-inksoft">{t("reports.noOpenShift")}</p>
          <button onClick={() => dispatch({ type: "SHIFT_OPEN", terminalId: "", openingBalance: 0 })}
            className="mt-3 px-4 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95">
            {t("reports.openShiftNow")}
          </button>
        </div>
      )}

      {/* closed-shift history */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-2">{t("reports.closedShifts")}</p>
        {closedShifts.length === 0 ? (
          <p className="text-xs text-inksoft">{t("reports.noClosedShifts")}</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {closedShifts.map((s) => {
              const z = generateZReport(s);
              return (
                <button key={s.id} onClick={() => setViewShift(s)}
                  className="text-start rounded-lg border border-mist bg-card px-3 py-2.5 hover:border-pine-400 transition">
                  <div className="flex items-center justify-between">
                    <span className="num font-bold text-ink">{s.id}</span>
                    <span className={cx("num text-xs font-bold", (z?.overShort ?? 0) >= 0 ? "text-pine-700" : "text-brick-700")}>
                      {(z?.overShort ?? 0) >= 0 ? "+" : "−"}{money(Math.abs(z?.overShort ?? 0))}
                    </span>
                  </div>
                  <p className="text-[10px] text-inksoft mt-0.5">{s.cashierName} · {clockTime(s.closedAt ?? s.openedAt)}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Z close dialog — counted cash → over/short */}
      {closing && (
        <Modal onClose={() => setClosing(null)} width={460} labelledBy="z-title">
          <div className="px-5 py-4 border-b border-mist">
            <h2 id="z-title" className="font-display font-bold text-ink">{t("reports.zClose")} · {closing.id}</h2>
            <p className="text-xs text-inksoft mt-0.5">{t("reports.zCloseHint")}</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-paper border border-mist px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-inksoft">{t("shift.expectedCash")}</p><p className="num font-bold text-ink">{money(closing.expectedCash)}</p></div>
              <div className="rounded-lg bg-paper border border-mist px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-inksoft">{t("shift.openingBalance")}</p><p className="num font-bold text-ink">{money(closing.openingBalance)}</p></div>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("reports.countedCash")}</label>
              <input value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal" autoFocus
                className="num w-full mt-1.5 px-3 py-2.5 rounded-lg border-2 border-mist bg-card text-base font-semibold text-ink focus:border-pine-500 focus:outline-none transition" />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("shift.notes")}</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full mt-1.5 px-3 py-2.5 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition" />
            </div>
            <div className={cx("rounded-lg px-3 py-2 text-sm font-bold", (parseFloat(counted) - closing.expectedCash) >= 0 ? "bg-pine-100 text-pine-800" : "bg-brick-100 text-brick-700")}>
              {t("reports.overUnder")}: {(parseFloat(counted) - closing.expectedCash) >= 0 ? "+" : "−"}{money(Math.abs(parseFloat(counted) || 0 - closing.expectedCash))}
            </div>
            <button onClick={() => { dispatch({ type: "SHIFT_CLOSE", countedCash: parseFloat(counted) || 0, notes: notes.trim() || undefined }); setClosing(null); }}
              className="w-full py-2.5 rounded-lg bg-ink text-paper text-sm font-bold hover:bg-pine-900 transition active:scale-[0.98] shadow-lift">
              {t("reports.confirmClose")}
            </button>
          </div>
        </Modal>
      )}

      {/* X / Z report viewer */}
      {viewShift && <XZReport shift={viewShift} onClose={() => setViewShift(null)} />}
    </div>
  );
}

function XZReport({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const { t } = useTranslation();
  const r = shift.status === "closed" ? generateZReport(shift) : generateXReport(shift);
  if (!r) return null;
  const isZ = "countedCash" in r;
  const tenders = (Object.entries(r.tenderBreakdown) as [string, number][]).filter(([, v]) => v !== 0);
  return (
    <Modal onClose={onClose} width={520} labelledBy="xz-title">
      <div className="px-5 py-4 border-b border-mist flex items-center justify-between">
        <div>
          <h2 id="xz-title" className="font-display font-bold text-ink flex items-center gap-2"><ICash size={17} className="text-pine-700" /> {isZ ? t("reports.zReport") : t("reports.xReport")} · {shift.id}</h2>
          <p className="text-[11px] text-inksoft mt-0.5">{shift.cashierName} · {shift.terminalId} · {clockTime(shift.openedAt)}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t("shift.transactionCount")} value={String(r.transactionCount)} />
          <Stat label={t("shift.totalSales")} value={money(r.salesTotal)} />
          <Stat label={t("shift.totalRefunds")} value={money(r.refundsTotal)} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-1">{t("shift.tenderTotals")}</p>
          <div className="space-y-1">
            {tenders.length === 0 && <p className="text-xs text-inksoft">—</p>}
            {tenders.map(([m, v]) => (
              <div key={m} className="flex justify-between"><span className="text-ink capitalize">{m.replace("_", " ")}</span><span className="num text-ink">{money(v)}</span></div>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-paper border border-mist px-3 py-2 flex justify-between"><span className="text-inksoft">{t("shift.paidIn")}</span><span className="num text-pine-700">{money(shift.paidInTotal)}</span></div>
        <div className="rounded-lg bg-paper border border-mist px-3 py-2 flex justify-between"><span className="text-inksoft">{t("shift.paidOut")}</span><span className="num text-brick-700">−{money(shift.paidOutTotal)}</span></div>
        <div className="rounded-lg bg-paper border border-mist px-3 py-2 flex justify-between"><span className="font-bold text-ink">{t("reports.currentCash")}</span><span className="num font-bold text-ink">{money(r.currentCash)}</span></div>
        {isZ && (
          <>
            <div className="rounded-lg bg-paper border border-mist px-3 py-2 flex justify-between"><span className="text-inksoft">{t("reports.countedCash")}</span><span className="num text-ink">{money((r as ZReport).countedCash)}</span></div>
            <div className={cx("rounded-lg px-3 py-2 flex justify-between font-bold", (r as ZReport).overShort >= 0 ? "bg-pine-100 text-pine-800" : "bg-brick-100 text-brick-700")}>
              <span>{t("shift.overShort")}</span><span className="num">{(r as ZReport).overShort >= 0 ? "+" : "−"}{money(Math.abs((r as ZReport).overShort))}</span>
            </div>
          </>
        )}
        {shift.cashMovements.length > 0 && (
          <div className="pt-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-1">{t("reports.cashMovements")}</p>
            <div className="space-y-1">
              {shift.cashMovements.map((m) => (
                <div key={m.id} className="flex justify-between text-xs"><span className="text-ink">{m.reason}<span className="text-inksoft"> · {clockTime(m.at)}</span></span><span className={cx("num font-semibold", m.type === "paid_in" ? "text-pine-700" : "text-brick-700")}>{m.type === "paid_in" ? "+" : "−"}{money(m.amount)}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ================= ANALYTICS TAB (Phase F) ================= */
function AnalyticsTab() {
  const { t } = useTranslation();
  const { state } = usePos();
  const [preset, setPreset] = useState<Preset>("30d");
  const { from, to } = rangeFor(preset);

  const ltv = useMemo(() => calculateLTV(state.customers, state.transactions.filter(t => inRange(t.at, from, to))), [state.customers, state.transactions, from, to]);
  const supplierPerf = useMemo(() => supplierPerformance(state.purchaseOrders, state.apInvoices, state.deliveries, state.suppliers), [state.purchaseOrders, state.apInvoices, state.deliveries, state.suppliers]);
  const expiryRisk = useMemo(() => expiryAtRisk(state.products, 90), [state.products]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-mist bg-card p-1">
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => setPreset(p.id)}
            className={cx("px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all duration-150",
              preset === p.id ? "bg-pine-700 text-pine-50 shadow-lift" : "text-inksoft hover:text-ink hover:bg-mist/60")}>
            {p.label}
          </button>
        ))}
      </div>

      {/* LTV Section */}
      <div className="rounded-xl border border-mist bg-card shadow-lift overflow-auto scroll-slim">
        <div className="px-4 py-3 border-b border-mist flex items-center justify-between">
          <h2 className="font-display font-bold text-[15px] text-ink">{t("analytics.ltv")}</h2>
          <Badge tone="mist">{ltv.length} {t("analytics.customers")}</Badge>
        </div>
        <div className="p-4">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-pine-900 text-pine-100 text-start text-[10px] uppercase tracking-[0.14em]">
                <th className="px-4 py-2.5 font-bold">{t("analytics.customer")}</th>
                <th className="px-3 py-2.5 font-bold text-end">{t("analytics.ltv")}</th>
                <th className="px-3 py-2.5 font-bold text-end">{t("analytics.visits")}</th>
                <th className="px-3 py-2.5 font-bold text-end">{t("analytics.avgBasket")}</th>
                <th className="px-4 py-2.5 font-bold text-end">{t("analytics.lastVisit")}</th>
              </tr>
            </thead>
            <tbody>
              {ltv.slice(0, 50).map((r, i) => (
                <tr key={r.customerId} className={cx("border-t border-mist/70 transition-colors hover:bg-pine-50/60", i % 2 === 1 && "bg-paper/50")}>
                  <td className="px-4 py-2 font-semibold text-ink">{state.customers.find(c => c.id === r.customerId)?.name ?? r.customerId}</td>
                  <td className="px-3 py-2 text-end num text-ink">{money(r.ltv)}</td>
                  <td className="px-3 py-2 text-center num text-inksoft">{r.visits}</td>
                  <td className="px-3 py-2 text-end num text-ink">{money(r.avgBasket)}</td>
                  <td className="px-4 py-2 text-end num text-inksoft">{new Date(r.lastVisit).toLocaleDateString()}</td>
                </tr>
              ))}
              {ltv.length === 0 && <tr><td colSpan={5}><Empty icon={<ITrendUp size={20} />} title={t("analytics.noData")} hint={t("analytics.noLtvHint")} /></td></tr>}
            </tbody>
          </table>
        </div>
        {ltv.length > 0 && (
          <div className="px-4 py-3 border-t border-mist flex items-center justify-end">
            <ExportCsv name="ltv-report" head={["customer", "ltv", "visits", "avg_basket", "last_visit"]}
              rows={ltv.map((r) => [state.customers.find(c => c.id === r.customerId)?.name ?? r.customerId, r.ltv.toFixed(2), r.visits, r.avgBasket.toFixed(2), new Date(r.lastVisit).toISOString()])} />
          </div>
        )}
      </div>

      {/* Supplier Performance Section */}
      <div className="rounded-xl border border-mist bg-card shadow-lift overflow-auto scroll-slim">
        <div className="px-4 py-3 border-b border-mist flex items-center justify-between">
          <h2 className="font-display font-bold text-[15px] text-ink">{t("analytics.supplierPerformance")}</h2>
          <Badge tone="mist">{supplierPerf.length} {t("analytics.suppliers")}</Badge>
        </div>
        <div className="p-4">
          <table className="w-full text-sm border-collapse min-w-[720px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-pine-900 text-pine-100 text-start text-[10px] uppercase tracking-[0.14em]">
                <th className="px-4 py-2.5 font-bold">{t("analytics.supplier")}</th>
                <th className="px-3 py-2.5 font-bold text-end">{t("analytics.onTimeRate")}</th>
                <th className="px-3 py-2.5 font-bold text-end">{t("analytics.avgLeadDays")}</th>
                <th className="px-3 py-2.5 font-bold text-end">{t("analytics.totalSpend")}</th>
                <th className="px-4 py-2.5 font-bold text-end">{t("analytics.invoiceCount")}</th>
              </tr>
            </thead>
            <tbody>
              {supplierPerf.map((r, i) => (
                <tr key={r.supplierId} className={cx("border-t border-mist/70 transition-colors hover:bg-pine-50/60", i % 2 === 1 && "bg-paper/50")}>
                  <td className="px-4 py-2 font-semibold text-ink">{r.supplierName}</td>
                  <td className="px-3 py-2 text-end num text-ink">{Math.round(r.onTimeRate * 100)}%</td>
                  <td className="px-3 py-2 text-center num text-inksoft">{r.avgLeadDays}</td>
                  <td className="px-3 py-2 text-end num text-ink">{money(r.totalSpend)}</td>
                  <td className="px-4 py-2 text-center num text-inksoft">{r.invoiceCount}</td>
                </tr>
              ))}
              {supplierPerf.length === 0 && <tr><td colSpan={5}><Empty icon={<IBox size={20} />} title={t("analytics.noData")} hint={t("analytics.noSupplierHint")} /></td></tr>}
            </tbody>
          </table>
        </div>
        {supplierPerf.length > 0 && (
          <div className="px-4 py-3 border-t border-mist flex items-center justify-end">
            <ExportCsv name="supplier-performance" head={["supplier", "on_time_rate", "avg_lead_days", "total_spend", "invoice_count"]}
              rows={supplierPerf.map((r) => [r.supplierName, Math.round(r.onTimeRate * 100), r.avgLeadDays, r.totalSpend.toFixed(2), r.invoiceCount])} />
          </div>
        )}
      </div>

      {/* Expiry At-Risk Section */}
      <div className="rounded-xl border border-mist bg-card shadow-lift overflow-auto scroll-slim">
        <div className="px-4 py-3 border-b border-mist flex items-center justify-between">
          <h2 className="font-display font-bold text-[15px] text-ink">{t("analytics.expiryAtRisk")}</h2>
          <Badge tone={expiryRisk.length > 0 ? "honey" : "pine"}>{expiryRisk.length} {t("analytics.batches")}</Badge>
        </div>
        <div className="p-4">
          <table className="w-full text-sm border-collapse min-w-[800px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-pine-900 text-pine-100 text-start text-[10px] uppercase tracking-[0.14em]">
                <th className="px-4 py-2.5 font-bold">{t("analytics.product")}</th>
                <th className="px-3 py-2.5 font-bold text-center">{t("analytics.batch")}</th>
                <th className="px-3 py-2.5 font-bold text-center">{t("analytics.qty")}</th>
                <th className="px-4 py-2.5 font-bold text-center">{t("analytics.expiryDate")}</th>
                <th className="px-3 py-2.5 font-bold text-end">{t("analytics.daysLeft")}</th>
                <th className="px-4 py-2.5 font-bold text-end">{t("analytics.valueAtRisk")}</th>
              </tr>
            </thead>
            <tbody>
              {expiryRisk.slice(0, 100).map((r, i) => (
                <tr key={`${r.productId}-${r.batch}`} className={cx("border-t border-mist/70 transition-colors hover:bg-pine-50/60", i % 2 === 1 && "bg-paper/50")}>
                  <td className="px-4 py-2 font-semibold text-ink">{r.productName}</td>
                  <td className="px-3 py-2 text-center text-inksoft">{r.batch}</td>
                  <td className="px-3 py-2 text-center num text-ink">{r.qty}</td>
                  <td className="px-4 py-2 text-center text-inksoft">{new Date(r.expiryDate).toLocaleDateString()}</td>
                  <td className={cx("px-3 py-2 text-end num font-bold", r.daysUntilExpiry <= 30 ? "text-brick-700" : r.daysUntilExpiry <= 60 ? "text-amber-700" : "text-ink")}>{r.daysUntilExpiry}</td>
                  <td className="px-4 py-2 text-end num text-ink">{money(r.valueAtRisk)}</td>
                </tr>
              ))}
              {expiryRisk.length === 0 && <tr><td colSpan={6}><Empty icon={<ICalendar size={20} />} title={t("analytics.noAtRisk")} hint={t("analytics.noAtRiskHint")} /></td></tr>}
            </tbody>
          </table>
        </div>
        {expiryRisk.length > 0 && (
          <div className="px-4 py-3 border-t border-mist flex items-center justify-end">
            <ExportCsv name="expiry-at-risk" head={["product", "batch", "qty", "expiry_date", "days_left", "value_at_risk"]}
              rows={expiryRisk.map((r) => [r.productName, r.batch, r.qty, new Date(r.expiryDate).toISOString(), r.daysUntilExpiry, r.valueAtRisk.toFixed(2)])} />
          </div>
        )}
      </div>
    </div>
  );
}

function RecallLookupTab() {
  const { t, i18n: i18nInst } = useTranslation();
  const { state, dispatch } = usePos();
  const [batch, setBatch] = useState("");
  const [searched, setSearched] = useState("");

  const doSearch = () => { setSearched(batch.trim()); };
  const clearSearch = () => { setBatch(""); setSearched(""); };

  const hits = useMemo(
    () => searched ? patientsForBatchCode(state.transactions, searched) : [],
    [state.transactions, searched],
  );

  const enriched = useMemo(
    () => hits.map((h) => {
      const c = state.customers.find((x) => x.id === h.customerId);
      return { ...h, customer: c };
    }),
    [hits, state.customers],
  );

  const uniquePatients = useMemo(
    () => [...new Set(enriched.filter((h) => h.customerId).map((h) => h.customerId!))],
    [enriched],
  );

  const escapeHtml = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]);

  const printContactSheet = () => {
    if (!enriched.length || !uniquePatients.length) return;
    const printRoot = document.getElementById("print-root");
    if (!printRoot) return;
    const tableRows = uniquePatients.map((pid) => {
      const c = enriched.find((h) => h.customerId === pid)!.customer!;
      const lines = enriched.filter((h) => h.customerId === pid);
      const total = lines.reduce((s, h) => s + h.qty, 0);
      return `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone ?? "—")}</td><td>${escapeHtml(c.address ?? "—")}</td><td class="num">${total}</td></tr>`;
    }).join("");
    const html = `
      <html><head><title>${escapeHtml(t("reports.recallPrintHint", { batch: searched }))}</title>
      <style>
        @page { margin: 1in; }
        body { font-family: system-ui, sans-serif; font-size: 12pt; }
        h1 { font-size: 14pt; margin-bottom: 4pt; }
        h2 { font-size: 10pt; color: #666; margin-bottom: 12pt; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 4pt 6pt; text-align: left; }
        th { background: #f0f0f0; font-size: 8pt; text-transform: uppercase; }
        .num { text-align: right; }
      </style></head>
      <body>
        <h1>${escapeHtml(t("reports.recallResults"))}</h1>
        <h2>${escapeHtml(t("reports.recallPrintHint", { batch: searched }))} — ${escapeHtml(new Date().toLocaleDateString(i18nInst.language))}</h2>
        <table>
          <thead><tr><th>${escapeHtml(t("reports.recallName"))}</th><th>${escapeHtml(t("reports.recallPhone"))}</th><th>${escapeHtml(t("reports.recallAddress"))}</th><th class="num">${escapeHtml(t("reports.recallQty"))}</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body></html>`;
    printRoot.innerHTML = html;
    printRoot.style.display = "block";
    window.print();
    printRoot.innerHTML = "";
    printRoot.style.display = "none";
  };

  const ExportCsv = () => {
    const head = [t("reports.recallProduct"), t("reports.recallDate"), t("reports.recallName"),
      t("reports.recallPhone"), t("reports.recallAddress"), t("reports.recallQty"), "Receipt"];
    const rows = enriched.map((h) => [
      h.customer ? h.customer.name : "walk-in",
      h.at,
      h.customer ? h.customer.name : "",
      h.customer ? (h.customer.phone ?? "") : "",
      h.customer ? (h.customer.address ?? "") : "",
      h.qty,
      h.txId,
    ]);
    const blob = new Blob([[head.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `recall-${searched}.csv`;
    a.click(); URL.revokeObjectURL(url);
    dispatch({ type: "TOAST", kind: "success", msg: `Exported ${rows.length} rows to CSV` });
  };

  const ExportXlsx = () => {
    const rows = enriched.map((h) => ({
      [t("reports.recallProduct")]: h.productName,
      [t("reports.recallDate")]: new Date(h.at).toLocaleString(),
      [t("reports.recallName")]: h.customer?.name ?? "walk-in",
      [t("reports.recallPhone")]: h.customer?.phone ?? "",
      [t("reports.recallAddress")]: h.customer?.address ?? "",
      [t("reports.recallQty")]: h.qty,
      receipt: h.txId,
    }));
    const buf = buildXlsx(rows, `recall-${searched}.xlsx`);
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `recall-${searched}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
    dispatch({ type: "TOAST", kind: "success", msg: `Exported ${rows.length} rows to XLSX` });
  };

  return (
    <div className="space-y-4">
      {/* input card */}
      <div className="rounded-xl border border-mist bg-card shadow-lift p-4 anim-fade-up">
        <div className="flex items-center gap-2 mb-3">
          <IAlert size={16} className="text-brick-700" />
          <h2 className="font-display font-bold text-ink">{t("reports.recallLookup")}</h2>
        </div>
        <p className="text-xs text-inksoft mb-3">{t("reports.recallScan")}</p>
        <div className="flex gap-2 max-w-md">
          <input value={batch} onChange={(e) => setBatch(e.target.value.toUpperCase())}
            placeholder={t("reports.recallBatch")}
            className="flex-1 px-3 py-2 rounded-lg border border-mist bg-paper text-sm font-mono focus:border-pine-500 focus:outline-none"
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
            autoFocus />
          <button onClick={doSearch} disabled={!batch.trim()}
            className="px-4 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 disabled:opacity-40 transition active:scale-95">
            {t("reports.recallSearch")}
          </button>
          {searched && (
            <button onClick={clearSearch}
              className="px-2 py-1.5 rounded-lg border border-mist bg-mist/40 text-xs text-inksoft hover:bg-mist transition">
              <IX size={12} />
            </button>
          )}
        </div>
      </div>

      {/* results */}
      {searched && (
        <div className="rounded-xl border border-mist bg-card shadow-lift overflow-hidden anim-fade-up">
          <div className="px-4 py-3 border-b border-mist flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-ink">{t("reports.recallResults")}</h3>
              {enriched.length > 0
                ? <p className="text-xs text-inksoft mt-0.5">{t("reports.recallFound", { count: enriched.length, qty: enriched.reduce((s, h) => s + h.qty, 0), batch: searched })}</p>
                : <p className="text-xs text-inksoft mt-0.5">{t("reports.recallNoMatch")}</p>}
            </div>
            {uniquePatients.length > 0 && (
              <div className="flex gap-1.5">
                <button onClick={printContactSheet}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-pine-400 hover:bg-pine-50 transition">
                  <ICheck size={13} /> {t("reports.recallPrintContact")}
                </button>
                <button onClick={ExportCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-pine-400 hover:bg-pine-50 transition">
                  <IDownload size={13} /> CSV
                </button>
                <button onClick={ExportXlsx}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-pine-400 hover:bg-pine-50 transition">
                  <IDownload size={13} /> XLSX
                </button>
              </div>
            )}
          </div>
          {enriched.length > 0 ? (
            <div className="overflow-auto scroll-slim max-h-[500px]">
              <table className="w-full text-sm border-collapse min-w-[800px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-pine-900 text-pine-100 text-start text-[10px] uppercase tracking-[0.14em]">
                    <th className="px-4 py-2.5 font-bold">{t("reports.recallProduct")}</th>
                    <th className="px-3 py-2.5 font-bold">{t("reports.recallDate")}</th>
                    <th className="px-3 py-2.5 font-bold">{t("reports.recallName")}</th>
                    <th className="px-3 py-2.5 font-bold">{t("reports.recallPhone")}</th>
                    <th className="px-3 py-2.5 font-bold">{t("reports.recallAddress")}</th>
                    <th className="px-3 py-2.5 font-bold text-center">{t("reports.recallQty")}</th>
                    <th className="px-3 py-2.5 font-bold text-center">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.map((h, i) => (
                    <tr key={`${h.txId}-${h.productId}`} className={cx("border-t border-mist/70", i % 2 === 1 && "bg-paper/50")}>
                      <td className="px-4 py-2 font-semibold text-ink">{h.productName}</td>
                      <td className="px-3 py-2 num text-inksoft">{new Date(h.at).toLocaleDateString()} {clockTime(h.at)}</td>
                      <td className="px-3 py-2">{h.customer ? h.customer.name : <span className="text-inksoft italic">walk-in</span>}</td>
                      <td className="px-3 py-2 num text-inksoft">{h.customer?.phone ?? "—"}</td>
                      <td className="px-3 py-2 text-inksoft">{h.customer?.address?.slice(0, 50) ?? "—"}</td>
                      <td className="px-3 py-2 text-center num font-bold text-pine-800">×{h.qty}</td>
                      <td className="px-3 py-2 num text-[10px] text-inksoft">{h.txId.slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-6 text-center">
              <Empty icon={<IAlert size={20} />} title={t("reports.recallNoMatch")} hint={t("reports.recallEmptyHint")} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-paper border border-mist px-3 py-2 text-center">
      <p className="num text-sm font-bold text-ink">{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-wide text-inksoft">{label}</p>
    </div>
  );
}
