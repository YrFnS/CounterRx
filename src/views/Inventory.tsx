import { useEffect, useMemo, useState } from "react";
import { usePos, money } from "../store";
import { CATEGORIES, daysUntil, fefoBatches, stockOf, nearestExpiry, newBatchCode } from "../data";
import type { CategoryId, Product, Batch } from "../data";
import { cx, Badge, Modal, StockBar, Empty } from "../ui";
import { ISearch, IPlus, IBox, IAlert, IDownload, IEdit, IX, ICheck } from "../icons";

type Filter = "all" | "low" | "expiring" | "rx";

export default function Inventory() {
  const { state, dispatch } = usePos();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [filter, setFilter] = useState<Filter>(state.invPreset === "expiring" ? "expiring" : state.invPreset === "low" ? "low" : "all");
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [receiving, setReceiving] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);

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
  ];

  const maxBucket = Math.max(...horizon.buckets.map((b) => b.units), horizon.expired.units, 1);

  return (
    <div className="h-full flex flex-col px-6 py-5 min-h-0">
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
        <div className="flex items-end gap-1">
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

      <div className="mt-3 flex-1 min-h-0 overflow-y-auto scroll-slim rounded-xl border border-mist bg-card shadow-lift">
        {rows.length === 0 ? (
          <Empty icon={<IBox size={22} />} title="Nothing here" hint="Adjust the filters or add a new product to the catalog." />
        ) : (
          <table className="w-full text-sm border-collapse">
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
                          </p>
                          <p className="num text-[10px] text-inksoft">{p.sku} · {p.barcode} · {p.supplier}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-1 py-0.5">
                        {fefoBatches(p).map((b, bi) => <LotRow key={b.batch} b={b} first={bi === 0} />)}
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
    </div>
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
      className={cx("flex-1 min-w-0 rounded-md border px-0.5 pt-1.5 pb-1 transition-all duration-200 text-center",
        active ? "border-ink shadow-lift -translate-y-0.5" : "border-transparent hover:border-mist hover:-translate-y-0.5")}
      style={{ background: bg }}>
      <span className={cx("block num text-[10px] font-bold leading-none", danger && units > 0 ? "text-brick-100" : units / max > 0.45 ? "text-pine-950" : "text-ink")}>
        {units}
      </span>
      <span className={cx("block text-[9px] font-semibold mt-0.5", danger && units > 0 ? "text-brick-100/85" : "text-inksoft")}>{label}</span>
    </button>
  );
}

function LotRow({ b, first }: { b: Batch; first: boolean }) {
  const d = daysUntil(b.expiry);
  return (
    <div className="flex items-center gap-2">
      <span className="num text-xs font-semibold text-ink w-[86px] truncate" title={b.batch}>{b.batch}</span>
      <span className={cx("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold num",
        d < 0 ? "bg-ink text-paper" : d <= 30 ? "bg-brick-100 text-brick-700" : d <= 60 ? "bg-honey-100 text-honey-700" : "bg-pine-100 text-pine-700")}>
        {(d < 0 || d <= 60) && <IAlert size={10} />}
        {d < 0 ? "EXPIRED" : `${d}d`}
      </span>
      <span className="num text-[10px] text-inksoft">{b.expiry}</span>
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
