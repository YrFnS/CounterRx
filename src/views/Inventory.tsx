import { useEffect, useMemo, useState } from "react";
import { usePos, money, relTime } from "../store";
import { CATEGORIES, daysUntil, fefoBatches, stockOf, nearestExpiry, newBatchCode, FIELD_SUGGESTIONS, BRANCHES } from "../data";
import type { CategoryId, Product, Batch, TransferStatus } from "../data";
import { cx, Badge, Modal, StockBar, Empty, CustomFieldsBlock } from "../ui";
import { ISearch, IPlus, IBox, IAlert, IDownload, IEdit, IX, ICheck, IReport, ICalendar, IClipboard, ITag, ISwap } from "../icons";

type Filter = "all" | "low" | "expiring" | "rx" | "controlled";

export default function Inventory() {
  const { state, dispatch } = usePos();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [filter, setFilter] = useState<Filter>(state.invPreset === "expiring" ? "expiring" : state.invPreset === "low" ? "low" : "all");
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [receiving, setReceiving] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [counting, setCounting] = useState(false);
  const [report, setReport] = useState<"low" | "expiry" | null>(null);
  const [transfersOpen, setTransfersOpen] = useState(false);

  /* respond to alert-bell navigation presets even when already mounted */
  useEffect(() => {
    setFilter(state.invPreset === "expiring" ? "expiring" : state.invPreset === "low" ? "low" : "all");
  }, [state.invPreset]);

  /* ---- expiry horizon: units at risk per month, next 12 months ---- */
  const horizon = useMemo(() => {
    const buckets: { key: string; label: string; units: number; lots: number }[] = [];
    const expired = { key: "expired", label: "Expired", units: 0, lots: 0 };
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-US", { month: "short" }),
        units: 0, lots: 0,
      });
    }
    for (const p of state.products) {
      for (const b of p.batches) {
        const bd = new Date(b.expiry + "T00:00:00");
        const key = `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, "0")}`;
        const bucket = buckets.find((x) => x.key === key);
        if (daysUntil(b.expiry) < 0) { expired.units += b.qty; expired.lots += 1; }
        else if (bucket) { bucket.units += b.qty; bucket.lots += 1; }
      }
    }
    return { buckets, expired };
  }, [state.products]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.products.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      const stock = stockOf(p);
      const near = nearestExpiry(p);
      if (filter === "low" && stock > p.reorderLevel) return false;
      if (filter === "rx" && !p.rx) return false;
      if (filter === "controlled" && !p.controlled) return false;
      if (filter === "expiring" && (!near || daysUntil(near) > 60)) return false;
      if (monthFilter) {
        const hit = p.batches.some((b) =>
          monthFilter === "expired" ? daysUntil(b.expiry) < 0 : b.expiry.startsWith(monthFilter));
        if (!hit) return false;
      }
      if (!needle) return true;
      return [p.name, p.generic, p.brand, p.sku, p.barcode, ...p.batches.map((b) => b.batch)]
        .some((s) => s.toLowerCase().includes(needle));
    });
  }, [state.products, q, cat, filter, monthFilter]);

  const stockValue = rows.reduce((s, p) => s + p.cost * stockOf(p), 0);
  const totalLots = state.products.reduce((s, p) => s + p.batches.length, 0);

  const exportCsv = () => {
    const head = ["sku", "name", "generic", "brand", "category", "form", "price", "cost", "lot", "lot_qty", "expiry", "total_stock", "reorder_level", "rx", "supplier"];
    const body = rows.flatMap((p) =>
      fefoBatches(p).map((b) => [p.sku, `"${p.name}"`, `"${p.generic}"`, `"${p.brand}"`, p.category, `"${p.form}"`, p.price, p.cost, b.batch, b.qty, b.expiry, stockOf(p), p.reorderLevel, p.rx, `"${p.supplier}"`].join(",")));
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `inventory-lots-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    dispatch({ type: "TOAST", kind: "success", msg: `Exported ${body.length} lot rows to CSV` });
  };

  const filters: { id: Filter; label: string; count: number; tone?: string }[] = [
    { id: "all", label: "Everything", count: state.products.length },
    { id: "low", label: "Low stock", count: state.products.filter((p) => stockOf(p) <= p.reorderLevel).length, tone: "#e0a63c" },
    { id: "expiring", label: "Expiring ≤60d", count: state.products.filter((p) => { const e = nearestExpiry(p); return e !== null && daysUntil(e) <= 60; }).length, tone: "#c24a2e" },
    { id: "rx", label: "℞ only", count: state.products.filter((p) => p.rx).length },
    { id: "controlled", label: "Controlled", count: state.products.filter((p) => p.controlled).length, tone: "#222a27" },
  ];

  const maxBucket = Math.max(...horizon.buckets.map((b) => b.units), horizon.expired.units, 1);

  return (
    <div className="h-full flex flex-col px-3 sm:px-6 py-4 sm:py-5 min-h-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <ISearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-inksoft" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search SKU, lot, barcode…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-mist text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition" />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {filters.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={cx("flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all",
                filter === f.id ? "bg-ink text-paper border-ink shadow-lift" : "bg-card border-mist text-inksoft hover:border-pine-300 hover:text-ink")}>
              {f.tone && <span className="w-1.5 h-1.5 rounded-full" style={{ background: f.tone }} />}
              {f.label}
              <span className={cx("num text-[10px] px-1.5 py-0.5 rounded", filter === f.id ? "bg-white/15" : "bg-mist/60")}>{f.count}</span>
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <button onClick={() => setReport("low")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-honey-400 hover:bg-honey-100/50 transition active:scale-95">
          <IReport size={14} /> Reorder report
        </button>
        <button onClick={() => setReport("expiry")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-brick-400 hover:bg-brick-100/40 transition active:scale-95">
          <ICalendar size={14} /> Expiry report
        </button>
        <button onClick={() => setCounting(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-pine-400 hover:bg-pine-50 transition active:scale-95">
          <IClipboard size={14} /> Count sheet
        </button>
        <button onClick={() => setTransfersOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-pine-400 hover:bg-pine-50 transition active:scale-95">
          <ISwap size={14} /> Transfers
        </button>
        <button onClick={exportCsv}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-pine-400 hover:bg-pine-50 transition active:scale-95">
          <IDownload size={14} /> Export CSV
        </button>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95 shadow-lift">
          <IPlus size={14} /> Add product
        </button>
      </div>

      {/* ---- expiry horizon heatmap ---- */}
      <div className="mt-4 bg-card border border-mist rounded-xl px-4 py-3 shadow-lift">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft flex items-center gap-1.5">
            <IAlert size={11} className="text-honey-700" /> Expiry horizon · units at risk by month
          </p>
          {monthFilter && (
            <button onClick={() => setMonthFilter(null)}
              className="flex items-center gap-1 text-[10px] font-bold text-brick-700 hover:bg-brick-100 px-2 py-0.5 rounded transition">
              <IX size={10} /> Clear month filter
            </button>
          )}
        </div>
        <div className="flex items-end gap-1 overflow-x-auto scroll-slim pb-1 -mx-1 px-1">
          <HeatCell label="Exp." units={horizon.expired.units} lots={horizon.expired.lots}
            max={maxBucket} active={monthFilter === "expired"} danger
            onClick={() => setMonthFilter(monthFilter === "expired" ? null : "expired")} />
          {horizon.buckets.map((b) => (
            <HeatCell key={b.key} label={b.label} units={b.units} lots={b.lots} max={maxBucket}
              active={monthFilter === b.key}
              onClick={() => setMonthFilter(monthFilter === b.key ? null : b.key)} />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-inksoft flex-wrap">
        <select value={cat} onChange={(e) => setCat(e.target.value as CategoryId | "all")}
          className="px-2.5 py-1.5 rounded-lg border border-mist bg-card text-xs font-semibold text-ink focus:outline-none focus:border-pine-500 cursor-pointer">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <span>· {rows.length} of {state.products.length} products · {totalLots} lots · stock value at cost</span>
        <span className="num font-bold text-pine-800">{money(stockValue)}</span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.14em] text-inksoft/70">Lots listed FEFO — earliest expiry sells first</span>
      </div>

      <div className="mt-3 flex-1 min-h-0 overflow-auto scroll-slim rounded-xl border border-mist bg-card shadow-lift">
        {rows.length === 0 ? (
          <Empty icon={<IBox size={22} />} title="Nothing here" hint="Adjust the filters or add a new product to the catalog." />
        ) : (
          <table className="w-full text-sm border-collapse min-w-[980px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-pine-900 text-pine-100 text-left text-[10px] uppercase tracking-[0.14em]">
                <th className="px-4 py-2.5 font-bold">Product</th>
                <th className="px-3 py-2.5 font-bold">Lots · batch / expiry</th>
                <th className="px-3 py-2.5 font-bold">Total stock</th>
                <th className="px-3 py-2.5 font-bold text-right">Price</th>
                <th className="px-4 py-2.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const stock = stockOf(p);
                const low = stock <= p.reorderLevel;
                return (
                  <tr key={p.id} className={cx("border-t border-mist/70 align-top transition-colors hover:bg-pine-50/60", i % 2 === 1 && "bg-paper/50")}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 shrink-0 rounded-full mt-1" style={{ background: CATEGORIES.find((c) => c.id === p.category)?.dot }} />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink leading-tight truncate max-w-[260px]">
                            {p.name} {p.rx && <span className="text-brick-700 font-bold">℞</span>}
                            {p.controlled && <span className="ml-1 px-1.5 py-0.5 rounded bg-ink text-paper text-[9px] font-bold tracking-wide align-middle">{p.controlled}</span>}
                          </p>
                          <p className="num text-[10px] text-inksoft">{p.sku} · {p.barcode} · {p.supplier}</p>
                          {(p.fields && p.fields.length > 0) && (
                            <div className="mt-1"><CustomFieldsBlock fields={p.fields} suggestions={FIELD_SUGGESTIONS} listId={`pf-${p.id}`}
                              onSave={(k, v) => dispatch({ type: "SET_FIELD", target: "product", id: p.id, field: { key: k, value: v } })}
                              onRemove={(k) => dispatch({ type: "CLEAR_FIELD", target: "product", id: p.id, key: k })} /></div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1 py-0.5">
                        {fefoBatches(p).map((b, bi) => <LotRow key={b.batch} b={b} first={bi === 0} p={p} />)}
                        {p.batches.length === 0 && <p className="text-[11px] text-brick-700 font-bold">No lots on shelf</p>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StockBar stock={stock} reorder={p.reorderLevel} />
                      {low && <Badge tone={stock <= Math.ceil(p.reorderLevel / 3) ? "brick" : "honey"}>reorder</Badge>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="num font-bold text-ink">{money(p.price)}</p>
                      <p className="num text-[10px] text-inksoft">cost {money(p.cost)}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setReceiving(p)}
                          title={`Receive stock from ${p.supplier}`}
                          className="px-2 py-1.5 rounded-md border border-pine-200 bg-pine-50 text-pine-700 text-[11px] font-bold hover:bg-pine-700 hover:text-pine-50 transition active:scale-95">
                          Receive
                        </button>
                        <button onClick={() => setAdjusting(p)}
                          className="grid place-items-center w-7 h-7 rounded-md border border-mist text-inksoft hover:border-pine-400 hover:text-pine-700 transition active:scale-90" aria-label={`Adjust ${p.name}`}>
                          <IEdit size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {adjusting && <AdjustModal p={adjusting} onClose={() => setAdjusting(null)} />}
      {receiving && <ReceiveModal p={receiving} onClose={() => setReceiving(null)} />}
      {adding && <AddProductModal onClose={() => setAdding(false)} />}
      {report && <ReportModal mode={report} onClose={() => setReport(null)} />}
      {counting && <CountModal onClose={() => setCounting(false)} />}
      {transfersOpen && <TransferModal onClose={() => setTransfersOpen(false)} />}
    </div>
  );
}

/* Inter-branch transfer requests (2.6) */
function TransferModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch, product } = usePos();
  const canApprove = state.user?.role !== "cashier";
  const [pid, setPid] = useState(state.products.find((p) => stockOf(p) > 0)?.id ?? "");
  const [qty, setQty] = useState("10");
  const [to, setTo] = useState(BRANCHES[0]);

  const statusTone: Record<TransferStatus, string> = {
    requested: "bg-honey-100 text-honey-700",
    approved: "bg-pine-100 text-pine-700",
    shipped: "bg-mist/60 text-ink",
    received: "bg-pine-700 text-pine-50",
    rejected: "bg-brick-100 text-brick-700",
  };
  const nextAction: Record<TransferStatus, { label: string; to: TransferStatus } | null> = {
    requested: { label: "Approve", to: "approved" },
    approved: { label: "Mark shipped", to: "shipped" },
    shipped: { label: "Mark received", to: "received" },
    received: null,
    rejected: null,
  };

  const submit = () => {
    const n = parseInt(qty, 10);
    if (!pid || !n || n <= 0) return;
    dispatch({ type: "ADD_TRANSFER", productId: pid, qty: n, toBranch: to });
  };

  return (
    <Modal onClose={onClose} width={640} labelledBy="tr-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="tr-title" className="font-display font-bold text-ink flex items-center gap-2">
            <ISwap size={17} className="text-pine-700" /> Inter-branch transfers
          </h2>
          <p className="text-xs text-inksoft mt-0.5">
            Move stock between branches — {canApprove ? "you can approve & ship" : "cashiers can only request"}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>

      <div className="p-5">
        <div className="rounded-xl border border-mist bg-paper p-3.5 grid md:grid-cols-[1fr_90px_1fr_auto] gap-2.5 items-end">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Product</label>
            <select value={pid} onChange={(e) => setPid(e.target.value)}
              className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-xs focus:border-pine-500 focus:outline-none">
              {state.products.filter((p) => stockOf(p) > 0).map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {stockOf(p)} on hand</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Qty</label>
            <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
              className="num w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-xs font-bold focus:border-pine-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">To branch</label>
            <select value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-xs focus:border-pine-500 focus:outline-none">
              {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <button onClick={submit}
            className="px-4 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95 shadow-lift">
            Request
          </button>
        </div>

        <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto scroll-slim">
          {state.transfers.length === 0 && <p className="text-xs text-inksoft text-center py-6">No transfers yet.</p>}
          {state.transfers.map((tr) => {
            const p = product(tr.productId);
            const act = nextAction[tr.status];
            return (
              <div key={tr.id} className="flex items-center gap-3 rounded-lg border border-mist bg-card px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-ink truncate">
                    {tr.qty} × {p?.name ?? tr.productId}
                    <span className="text-inksoft font-semibold"> → {tr.toBranch}</span>
                  </p>
                  <p className="text-[10px] text-inksoft num">
                    {tr.id} · {relTime(tr.createdAt)} · by {tr.requestedBy}{tr.note ? ` · ${tr.note}` : ""}
                  </p>
                </div>
                <span className={cx("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide shrink-0", statusTone[tr.status])}>{tr.status}</span>
                {act && canApprove && (
                  <button onClick={() => dispatch({ type: "TRANSFER_STATUS", id: tr.id, status: act.to })}
                    className="px-2.5 py-1.5 rounded-md bg-ink text-paper text-[11px] font-bold hover:bg-pine-900 transition active:scale-95 shrink-0">
                    {act.label}
                  </button>
                )}
                {tr.status === "requested" && canApprove && (
                  <button onClick={() => dispatch({ type: "TRANSFER_STATUS", id: tr.id, status: "rejected" })}
                    className="px-2 py-1.5 rounded-md border border-mist text-[11px] font-bold text-inksoft hover:text-brick-700 hover:border-brick-400 transition shrink-0"
                    aria-label="Reject">
                    <IX size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

function HeatCell({ label, units, lots, max, active, danger, onClick }: {
  label: string; units: number; lots: number; max: number; active: boolean; danger?: boolean; onClick: () => void;
}) {
  const t = units / max;
  const bg = danger
    ? `rgba(194,74,46,${0.12 + t * 0.75})`
    : units === 0 ? "rgba(148,163,157,0.10)" : `rgba(224,166,60,${0.14 + t * 0.7})`;
  return (
    <button onClick={onClick}
      title={`${units} units in ${lots} lot${lots === 1 ? "" : "s"} — click to filter`}
      className={cx("flex-1 min-w-[52px] rounded-md border px-0.5 pt-1.5 pb-1 transition-all duration-200 text-center",
        active ? "border-ink shadow-lift -translate-y-0.5" : "border-transparent hover:border-mist hover:-translate-y-0.5")}
      style={{ background: bg }}>
      <span className={cx("block num text-[10px] font-bold leading-none", danger && units > 0 ? "text-brick-100" : units / max > 0.45 ? "text-pine-950" : "text-ink")}>
        {units}
      </span>
      <span className={cx("block text-[9px] font-semibold mt-0.5", danger && units > 0 ? "text-brick-100/85" : "text-inksoft")}>{label}</span>
    </button>
  );
}

function LotRow({ b, first, p }: { b: Batch; first: boolean; p: Product }) {
  const { dispatch } = usePos();
  const d = daysUntil(b.expiry);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const priced = b.price !== undefined;

  const save = () => {
    const n = parseFloat(val);
    if (val.trim() !== "" && Number.isFinite(n) && n > 0) {
      dispatch({ type: "SET_BATCH_PRICE", productId: p.id, batch: b.batch, price: n });
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="num text-xs font-semibold text-ink w-[86px] truncate" title={b.batch}>{b.batch}</span>
      <span className={cx("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold num",
        d < 0 ? "bg-ink text-paper" : d <= 30 ? "bg-brick-100 text-brick-700" : d <= 60 ? "bg-honey-100 text-honey-700" : "bg-pine-100 text-pine-700")}>
        {(d < 0 || d <= 60) && <IAlert size={10} />}
        {d < 0 ? "EXPIRED" : `${d}d`}
      </span>
      <span className="num text-[10px] text-inksoft">{b.expiry}</span>

      {/* lot-level pricing (1.4) */}
      {editing ? (
        <span className="flex items-center gap-1 anim-fade-up">
          <input autoFocus value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            onBlur={save} placeholder={p.price.toFixed(2)} inputMode="decimal"
            className="num w-16 px-1.5 py-0.5 rounded border border-honey-500 bg-honey-100/60 text-[10px] font-bold text-ink focus:outline-none" />
        </span>
      ) : priced ? (
        <button onClick={() => { setVal(String(b.price)); setEditing(true); }}
          className="group/lp flex items-center gap-1 px-1.5 py-0.5 rounded bg-honey-100 border border-honey-300/70 hover:border-honey-500 transition" title="Lot clearance price — click to edit">
          <ITag size={9} className="text-honey-700" />
          <span className="num text-[10px] font-bold text-honey-800">{money(b.price!)}</span>
          <span className="num text-[9px] text-inksoft line-through">{money(p.price)}</span>
        </button>
      ) : (
        <button onClick={() => { setVal(""); setEditing(true); }}
          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-mist text-[9px] font-bold text-inksoft hover:text-honey-700 hover:border-honey-400 transition-all"
          title="Set a clearance price for this lot">
          <ITag size={9} /> price
        </button>
      )}
      {priced && !editing && (
        <button onClick={() => dispatch({ type: "SET_BATCH_PRICE", productId: p.id, batch: b.batch, price: null })}
          className="text-inksoft/50 hover:text-brick-700 transition" aria-label="Clear lot price"><IX size={9} /></button>
      )}

      <span className="num text-xs font-bold text-ink ml-auto pr-1">×{b.qty}</span>
      {first && <Badge tone="pine">FEFO</Badge>}
    </div>
  );
}

function ReceiveModal({ p, onClose }: { p: Product; onClose: () => void }) {
  const { dispatch } = usePos();
  const onHand = stockOf(p);
  const suggested = Math.max(10, p.reorderLevel * 2 - onHand);
  const [qty, setQty] = useState(String(suggested));
  const [batch, setBatch] = useState(newBatchCode());
  const [expiry, setExpiry] = useState(new Date(Date.now() + 540 * 86_400_000).toISOString().slice(0, 10));
  const [cost, setCost] = useState(p.cost.toFixed(2));

  const qtyNum = parseInt(qty) || 0;
  const valid = qtyNum > 0 && batch.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(expiry);
  const expDays = Math.ceil((new Date(expiry + "T00:00:00").getTime() - Date.now()) / 86_400_000);

  const submit = () => {
    if (!valid) return;
    dispatch({ type: "RESTOCK", productId: p.id, amount: qtyNum, batch: batch.trim(), expiry });
    onClose();
  };

  return (
    <Modal onClose={onClose} width={440} labelledBy="rcv-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="rcv-title" className="font-display font-bold text-ink">Receive stock</h2>
          <p className="text-xs text-inksoft mt-0.5">{p.name} · {p.form}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-pine-50 border border-pine-200">
          <IBox size={15} className="text-pine-700 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-ink truncate">{p.supplier}</p>
            <p className="text-[10px] text-inksoft">
              On hand <span className="num font-bold text-ink">{onHand}</span> · reorder at{" "}
              <span className="num font-bold text-ink">{p.reorderLevel}</span> · par level{" "}
              <span className="num font-bold text-pine-800">{p.reorderLevel * 2}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Quantity received</span>
            <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
              className="num w-full mt-1 px-2.5 py-2 rounded-lg border-2 border-mist bg-card text-base font-bold focus:border-pine-500 focus:outline-none transition" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Unit cost $</span>
            <input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal"
              className="num w-full mt-1 px-2.5 py-2 rounded-lg border-2 border-mist bg-card text-base font-bold focus:border-pine-500 focus:outline-none transition" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Lot / batch code</span>
            <input value={batch} onChange={(e) => setBatch(e.target.value)}
              className="num w-full mt-1 px-2.5 py-2 rounded-lg border-2 border-mist bg-card text-sm font-semibold focus:border-pine-500 focus:outline-none transition" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Expiry date</span>
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)}
              className="num w-full mt-1 px-2.5 py-2 rounded-lg border-2 border-mist bg-card text-sm font-semibold focus:border-pine-500 focus:outline-none transition" />
          </label>
        </div>

        <div className="flex gap-1.5">
          <button onClick={() => setQty(String(suggested))}
            className="num flex-1 px-2 py-1.5 rounded-md bg-card border border-mist text-[11px] font-bold text-ink hover:border-pine-400 hover:bg-pine-50 transition">
            Par {suggested}
          </button>
          {[20, 50, 100].map((v) => (
            <button key={v} onClick={() => setQty(String(v))}
              className="num flex-1 px-2 py-1.5 rounded-md bg-card border border-mist text-[11px] font-bold text-ink hover:border-pine-400 hover:bg-pine-50 transition">
              +{v}
            </button>
          ))}
        </div>

        <div className={cx("px-3 py-2 rounded-lg border text-[11px] font-semibold",
          valid && expDays > 60 ? "bg-pine-100 border-pine-200 text-pine-900"
            : valid ? "bg-honey-100 border-honey-300/60 text-honey-700"
            : "bg-mist/50 border-mist text-inksoft")}>
          {valid
            ? expDays > 60
              ? `New lot ${batch.trim()} · ${expDays}d shelf life · stock becomes ${onHand + qtyNum}`
              : `⚠ Short-dated lot — only ${expDays}d until expiry. Flagged on the register immediately.`
            : "Enter quantity, lot code and a valid expiry date"}
        </div>

        <button onClick={submit} disabled={!valid}
          className={cx("w-full py-2.5 rounded-lg font-display font-bold text-sm transition active:scale-[0.98] flex items-center justify-center gap-2",
            valid ? "bg-pine-700 text-pine-50 hover:bg-pine-600" : "bg-mist text-inksoft/60 cursor-not-allowed")}>
          <ICheck size={15} /> Book into stock
        </button>
      </div>
    </Modal>
  );
}

/* Physical count sheet (2.7) — walk the shelves, enter counted qty, apply variances */
function CountModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePos();
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(state.products.map((p) => [p.id, String(stockOf(p))])));
  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const rows = state.products.filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.sku.toLowerCase().includes(needle));

  const diffs = rows
    .map((p) => {
      const counted = Math.max(0, parseInt(counts[p.id] ?? "", 10));
      return { p, counted, onHand: stockOf(p), delta: (Number.isFinite(counted) ? counted : stockOf(p)) - stockOf(p) };
    })
    .filter((r) => r.delta !== 0);
  const netUnits = diffs.reduce((s, r) => s + r.delta, 0);
  const netValue = diffs.reduce((s, r) => s + r.delta * r.p.cost, 0);

  const apply = () => {
    dispatch({ type: "COUNT_APPLY", entries: diffs.map((r) => ({ productId: r.p.id, counted: r.counted })) });
    onClose();
  };

  return (
    <Modal onClose={onClose} width={680} labelledBy="cnt-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="cnt-title" className="font-display font-bold text-ink flex items-center gap-2">
            <IClipboard size={17} className="text-pine-700" /> Physical count sheet
          </h2>
          <p className="text-xs text-inksoft mt-0.5">
            Enter counted qty per SKU — variances post to the earliest-expiry lot and the audit trail
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <ISearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-inksoft" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter SKUs to count…"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-mist text-sm focus:border-pine-500 focus:outline-none transition" />
          </div>
          <span className={cx("num text-[11px] font-bold px-2.5 py-1.5 rounded-md border",
            diffs.length === 0 ? "bg-card border-mist text-inksoft" : netUnits >= 0 ? "bg-pine-100 border-pine-300/60 text-pine-700" : "bg-brick-100 border-brick-300/60 text-brick-700")}>
            {diffs.length} variance{diffs.length === 1 ? "" : "s"} · {netUnits >= 0 ? "+" : ""}{netUnits} units · {money(netValue)}
          </span>
        </div>

        <div className="max-h-[380px] overflow-auto scroll-slim rounded-lg border border-mist">
              <table className="w-full text-xs border-collapse min-w-[540px]">
                <thead className="sticky top-0">
                  <tr className="bg-pine-900 text-pine-100 text-left text-[9px] uppercase tracking-[0.14em]">
                    <th className="px-3 py-2 font-bold">SKU · product</th>                <th className="px-2 py-2 font-bold text-center">On hand</th>
                <th className="px-2 py-2 font-bold text-center">Counted</th>
                <th className="px-3 py-2 font-bold text-center">Variance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const onHand = stockOf(p);
                const counted = Math.max(0, parseInt(counts[p.id] ?? "", 10));
                const delta = (Number.isFinite(counted) ? counted : onHand) - onHand;
                return (
                  <tr key={p.id} className={cx("border-t border-mist/70", i % 2 === 1 && "bg-paper/60", delta !== 0 && "bg-honey-100/30")}>
                    <td className="px-3 py-1.5">
                      <p className="font-semibold text-ink truncate">{p.name}</p>
                      <p className="num text-[10px] text-inksoft">{p.sku}</p>
                    </td>
                    <td className="px-2 py-1.5 text-center num font-bold text-inksoft">{onHand}</td>
                    <td className="px-2 py-1.5 text-center">
                      <input value={counts[p.id]} onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value.replace(/[^\d]/g, "") })}
                        inputMode="numeric"
                        className={cx("num w-16 px-2 py-1 rounded-md border text-center font-bold focus:outline-none transition",
                          delta !== 0 ? "border-honey-500 bg-honey-100/60 text-honey-800" : "border-mist bg-card text-ink focus:border-pine-500")} />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={cx("num inline-block min-w-[44px] px-1.5 py-0.5 rounded font-bold",
                        delta > 0 ? "bg-pine-100 text-pine-700" : delta < 0 ? "bg-brick-100 text-brick-700" : "text-inksoft/60")}>
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-inksoft">No SKUs match that filter.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-mist text-xs font-semibold text-inksoft hover:text-ink hover:border-ink/30 transition">Cancel</button>
          <button onClick={apply} disabled={diffs.length === 0}
            className={cx("flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition active:scale-95",
              diffs.length > 0 ? "bg-pine-700 text-pine-50 hover:bg-pine-600 shadow-lift" : "bg-mist text-inksoft cursor-not-allowed")}>
            <ICheck size={13} /> Apply count · {diffs.length} variance{diffs.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ReportModal({ mode, onClose }: { mode: "low" | "expiry"; onClose: () => void }) {
  const { state, dispatch } = usePos();
  const isLow = mode === "low";

  /* --- reorder report: everything at/below par, with suggested order qty --- */
  const lowRows = useMemo(() => state.products
    .filter((p) => stockOf(p) <= p.reorderLevel)
    .map((p) => {
      const onHand = stockOf(p);
      const suggest = Math.max(0, p.reorderLevel * 2 - onHand);
      return { p, onHand, suggest, orderCost: suggest * p.cost };
    })
    .sort((a, b) => (a.onHand / Math.max(1, a.p.reorderLevel)) - (b.onHand / Math.max(1, b.p.reorderLevel))),
  [state.products]);
  const poTotal = lowRows.reduce((s, r) => s + r.orderCost, 0);

  /* --- expiry report: every lot due within 90 days (incl. expired) --- */
  const expRows = useMemo(() => {
    const rows: { p: Product; b: Batch; d: number }[] = [];
    for (const p of state.products) for (const b of p.batches) {
      const d = daysUntil(b.expiry);
      if (d <= 90) rows.push({ p, b, d });
    }
    return rows.sort((x, y) => x.b.expiry.localeCompare(y.b.expiry));
  }, [state.products]);

  const bucket = (lo: number, hi: number) => expRows.filter((r) => r.d >= lo && r.d <= hi);
  const buckets = [
    { label: "Expired", rows: bucket(-9999, 0), tone: "#c24a2e" },
    { label: "0–30d", rows: bucket(1, 30), tone: "#c24a2e" },
    { label: "31–60d", rows: bucket(31, 60), tone: "#e0a63c" },
    { label: "61–90d", rows: bucket(61, 90), tone: "#3b8668" },
  ];
  const writeOff = expRows.reduce((s, r) => s + r.b.qty * r.p.cost, 0);

  const exportCsv = () => {
    let head: string[], body: string[];
    if (isLow) {
      head = ["sku", "product", "on_hand", "reorder_level", "suggested_order", "supplier", "unit_cost", "order_cost"];
      body = lowRows.map((r) => [r.p.sku, `\"${r.p.name}\"`, r.onHand, r.p.reorderLevel, r.suggest, `\"${r.p.supplier}\"`, r.p.cost.toFixed(2), r.orderCost.toFixed(2)].join(","));
    } else {
      head = ["sku", "product", "batch", "expiry", "days_left", "qty", "value_at_cost"];
      body = expRows.map((r) => [r.p.sku, `\"${r.p.name}\"`, r.b.batch, r.b.expiry, r.d, r.b.qty, (r.b.qty * r.p.cost).toFixed(2)].join(","));
    }
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${isLow ? "reorder" : "expiry"}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    dispatch({ type: "TOAST", kind: "success", msg: `${isLow ? "Reorder" : "Expiry"} report exported` });
  };

  const rows = isLow ? lowRows.length : expRows.length;

  return (
    <Modal onClose={onClose} width={680} labelledBy="rpt-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="rpt-title" className="font-display font-bold text-ink flex items-center gap-2">
            {isLow ? <IReport size={17} className="text-honey-700" /> : <ICalendar size={17} className="text-brick-700" />}
            {isLow ? "Reorder report" : "Expiry report · next 90 days"}
          </h2>
          <p className="text-xs text-inksoft mt-0.5">
            {isLow
              ? <>Suggested order brings each SKU to <span className="font-semibold">2× par</span> · est. PO value <span className="num font-bold text-ink">{money(poTotal)}</span></>
              : <>At-risk inventory value <span className="num font-bold text-brick-700">{money(writeOff)}</span> across {rows} lots</>}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>

      <div className="p-5">
        {isLow ? (
          <>
            <div className="flex gap-2 flex-wrap mb-3">
              <span className="px-2.5 py-1 rounded-md bg-honey-100 text-honey-700 text-[11px] font-bold num">{lowRows.length} SKUs below par</span>
              <span className="px-2.5 py-1 rounded-md bg-pine-100 text-pine-700 text-[11px] font-bold num">{lowRows.reduce((s, r) => s + r.suggest, 0)} units to order</span>
              <span className="px-2.5 py-1 rounded-md bg-ink text-paper text-[11px] font-bold num">PO est. {money(poTotal)}</span>
            </div>
            <div className="max-h-80 overflow-auto scroll-slim rounded-lg border border-mist">
              <table className="w-full text-xs border-collapse min-w-[640px]">
                <thead className="sticky top-0">
                  <tr className="bg-pine-900 text-pine-100 text-left text-[9px] uppercase tracking-[0.14em]">
                    <th className="px-3 py-2 font-bold">Product</th>
                    <th className="px-2 py-2 font-bold text-center">On hand</th>
                    <th className="px-2 py-2 font-bold text-center">Par</th>
                    <th className="px-2 py-2 font-bold text-center">Suggest</th>
                    <th className="px-2 py-2 font-bold">Supplier</th>
                    <th className="px-3 py-2 font-bold text-right">Order cost</th>
                  </tr>
                </thead>
                <tbody>
                  {lowRows.map((r, i) => (
                    <tr key={r.p.id} className={cx("border-t border-mist/70", i % 2 === 1 && "bg-paper/60")}>
                      <td className="px-3 py-2 font-semibold text-ink">{r.p.name}{r.p.rx && <span className="text-brick-700 font-bold"> ℞</span>}</td>
                      <td className={cx("px-2 py-2 text-center num font-bold", r.onHand <= Math.ceil(r.p.reorderLevel / 3) ? "text-brick-700" : "text-honey-700")}>{r.onHand}</td>
                      <td className="px-2 py-2 text-center num text-inksoft">{r.p.reorderLevel}</td>
                      <td className="px-2 py-2 text-center num font-bold text-pine-700">+{r.suggest}</td>
                      <td className="px-2 py-2 text-inksoft">{r.p.supplier}</td>
                      <td className="px-3 py-2 text-right num font-semibold text-ink">{money(r.orderCost)}</td>
                    </tr>
                  ))}
                  {lowRows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-inksoft">All SKUs above par — nothing to order. ✓</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap mb-3">
              {buckets.map((b) => (
                <span key={b.label} className="px-2.5 py-1 rounded-md text-[11px] font-bold num flex items-center gap-1.5 border"
                  style={{ background: `${b.tone}14`, color: b.tone, borderColor: `${b.tone}44` }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.tone }} />
                  {b.label}: {b.rows.length} lots · {money(b.rows.reduce((s, r) => s + r.b.qty * r.p.cost, 0))}
                </span>
              ))}
            </div>
            <div className="max-h-80 overflow-auto scroll-slim rounded-lg border border-mist">
              <table className="w-full text-xs border-collapse min-w-[560px]">
                <thead className="sticky top-0">
                  <tr className="bg-pine-900 text-pine-100 text-left text-[9px] uppercase tracking-[0.14em]">
                    <th className="px-3 py-2 font-bold">Product · lot</th>
                    <th className="px-2 py-2 font-bold">Expiry</th>
                    <th className="px-2 py-2 font-bold text-center">Days</th>
                    <th className="px-2 py-2 font-bold text-center">Qty</th>
                    <th className="px-3 py-2 font-bold text-right">Value at cost</th>
                  </tr>
                </thead>
                <tbody>
                  {expRows.map((r, i) => (
                    <tr key={`${r.p.id}-${r.b.batch}`} className={cx("border-t border-mist/70", i % 2 === 1 && "bg-paper/60")}>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-ink">{r.p.name}</p>
                        <p className="num text-[10px] text-inksoft">lot {r.b.batch} · {r.p.supplier}</p>
                      </td>
                      <td className="px-2 py-2 num text-inksoft">{r.b.expiry}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={cx("num inline-block min-w-[38px] px-1.5 py-0.5 rounded font-bold",
                          r.d <= 0 ? "bg-ink text-paper" : r.d <= 30 ? "bg-brick-100 text-brick-700" : r.d <= 60 ? "bg-honey-100 text-honey-700" : "bg-pine-100 text-pine-700")}>
                          {r.d <= 0 ? "EXP" : r.d}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center num font-bold text-ink">{r.b.qty}</td>
                      <td className="px-3 py-2 text-right num font-semibold text-ink">{money(r.b.qty * r.p.cost)}</td>
                    </tr>
                  ))}
                  {expRows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-inksoft">No lots expiring within 90 days. ✓</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-mist text-xs font-semibold text-inksoft hover:text-ink hover:border-ink/30 transition">Close</button>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95">
            <IDownload size={13} /> Export CSV
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AdjustModal({ p, onClose }: { p: Product; onClose: () => void }) {
  const { dispatch } = usePos();
  const lots = fefoBatches(p);
  const [batch, setBatch] = useState(lots[0]?.batch ?? "");
  const cur = lots.find((b) => b.batch === batch);
  const [qty, setQty] = useState(String(cur?.qty ?? 0));
  const [reason, setReason] = useState("Cycle count correction");

  const pick = (code: string) => {
    setBatch(code);
    setQty(String(lots.find((b) => b.batch === code)?.qty ?? 0));
  };

  return (
    <Modal onClose={onClose} width={420} labelledBy="adj-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="adj-title" className="font-display font-bold text-ink">Adjust lot</h2>
          <p className="text-xs text-inksoft mt-0.5">{p.name}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Lot</label>
          <select value={batch} onChange={(e) => pick(e.target.value)}
            className="w-full mt-1.5 px-3 py-2.5 rounded-lg border border-mist bg-card text-sm num focus:border-pine-500 focus:outline-none">
            {lots.map((b) => (
              <option key={b.batch} value={b.batch}>
                {b.batch} — {b.qty} on hand · exp {b.expiry}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">New on-hand quantity</label>
          <div className="flex items-center gap-2 mt-1.5">
            <button onClick={() => setQty(String(Math.max(0, (parseInt(qty) || 0) - 1)))}
              className="w-9 h-10 rounded-lg border border-mist bg-card text-ink font-bold hover:border-pine-400 transition active:scale-95">−</button>
            <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
              className="num flex-1 h-10 text-center text-lg font-bold rounded-lg border-2 border-mist focus:border-pine-500 focus:outline-none" />
            <button onClick={() => setQty(String((parseInt(qty) || 0) + 1))}
              className="w-9 h-10 rounded-lg border border-mist bg-card text-ink font-bold hover:border-pine-400 transition active:scale-95">+</button>
          </div>
          <p className="text-[11px] text-inksoft mt-1.5">
            Currently <span className="num font-bold text-ink">{cur?.qty ?? 0}</span> → delta{" "}
            <span className={cx("num font-bold", (parseInt(qty) || 0) >= (cur?.qty ?? 0) ? "text-pine-700" : "text-brick-700")}>
              {(parseInt(qty) || 0) - (cur?.qty ?? 0) >= 0 ? "+" : ""}{(parseInt(qty) || 0) - (cur?.qty ?? 0)}
            </span>
            {(parseInt(qty) || 0) === 0 && <span className="text-brick-700 font-semibold"> · lot will be removed from shelf</span>}
          </p>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full mt-1.5 px-3 py-2.5 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none">
            {["Cycle count correction", "Damaged / write-off", "Expired — disposal", "Supplier return", "Theft / shrinkage", "Inter-branch transfer"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <button
          onClick={() => { dispatch({ type: "ADJUST_BATCH", productId: p.id, batch, newQty: parseInt(qty) || 0, reason }); onClose(); }}
          disabled={!batch}
          className={cx("w-full py-2.5 rounded-lg font-display font-bold text-sm transition active:scale-[0.98] flex items-center justify-center gap-2",
            batch ? "bg-pine-700 text-pine-50 hover:bg-pine-600" : "bg-mist text-inksoft/60 cursor-not-allowed")}>
          <ICheck size={15} /> Apply · {reason}
        </button>
      </div>
    </Modal>
  );
}

function AddProductModal({ onClose }: { onClose: () => void }) {
  const { dispatch } = usePos();
  const [f, setF] = useState({
    name: "", generic: "", brand: "", category: "pain" as CategoryId, form: "Tablet · strip of 10",
    price: "", cost: "", stock: "24", reorder: "10", rx: false, expDays: "365", batch: "",
  });
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.name.trim() && parseFloat(f.price) > 0;

  const submit = () => {
    if (!valid) return;
    const id = `new${Date.now().toString(36)}`;
    const expiry = new Date(Date.now() + (parseInt(f.expDays) || 365) * 86_400_000).toISOString().slice(0, 10);
    dispatch({
      type: "ADD_PRODUCT",
      product: {
        id, sku: `SKU-${id.slice(-5).toUpperCase()}`, barcode: `890${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`,
        name: f.name.trim(), generic: f.generic.trim() || f.name.trim(), brand: f.brand.trim() || "House brand",
        category: f.category, form: f.form, price: parseFloat(f.price), cost: parseFloat(f.cost) || parseFloat(f.price) * 0.55,
        reorderLevel: parseInt(f.reorder) || 10, rx: f.rx,
        supplier: "Manual entry",
        batches: [{ batch: f.batch.trim() || `HB-${new Date().getFullYear()}A01`, expiry, qty: parseInt(f.stock) || 0 }],
      },
    });
    onClose();
  };

  const Field = ({ label, k, ph, num }: { label: string; k: keyof typeof f; ph?: string; num?: boolean }) => (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">{label}</span>
      <input value={f[k] as string} onChange={(e) => set(k, num ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)}
        placeholder={ph}
        className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition" />
    </label>
  );

  return (
    <Modal onClose={onClose} width={520} labelledBy="add-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="add-title" className="font-display font-bold text-ink">New product</h2>
          <p className="text-xs text-inksoft mt-0.5">Adds straight to the register catalog as one opening lot</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 grid grid-cols-2 gap-3.5">
        <div className="col-span-2"><Field label="Product name" k="name" ph="e.g. Loratadine 10mg" /></div>
        <Field label="Generic / molecule" k="generic" ph="Loratadine" />
        <Field label="Brand" k="brand" ph="Claritin" />
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Category</span>
          <select value={f.category} onChange={(e) => set("category", e.target.value)}
            className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none">
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <Field label="Pack form" k="form" ph="Syrup · 100ml" />
        <Field label="Retail price $" k="price" ph="6.50" num />
        <Field label="Cost $" k="cost" ph="3.40" num />
        <Field label="Opening lot qty" k="stock" num />
        <Field label="Reorder level" k="reorder" num />
        <Field label="Lot code" k="batch" ph="LRT-26A01" />
        <Field label="Expiry in days" k="expDays" num />
        <label className="flex items-center gap-2 self-end pb-2 cursor-pointer">
          <input type="checkbox" checked={f.rx} onChange={(e) => set("rx", e.target.checked)}
            className="w-4 h-4 accent-pine-700" />
          <span className="text-sm font-semibold text-ink">Requires prescription ℞</span>
        </label>
        <button onClick={submit} disabled={!valid}
          className={cx("col-span-2 py-2.5 rounded-lg font-display font-bold text-sm transition active:scale-[0.98]",
            valid ? "bg-pine-700 text-pine-50 hover:bg-pine-600" : "bg-mist text-inksoft/60 cursor-not-allowed")}>
          Add to catalog
        </button>
      </div>
    </Modal>
  );
}
