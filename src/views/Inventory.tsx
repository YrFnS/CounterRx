import { useEffect, useMemo, useState } from "react";
import { usePos, money } from "../store";
import { CATEGORIES, daysUntil } from "../data";
import type { CategoryId, Product } from "../data";
import { cx, Badge, Modal, StockBar, Empty } from "../ui";
import { ISearch, IPlus, IBox, IAlert, IDownload, IEdit, IX, ICheck } from "../icons";

type Filter = "all" | "low" | "expiring" | "rx";

export default function Inventory() {
  const { state, dispatch } = usePos();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [filter, setFilter] = useState<Filter>(state.invPreset === "expiring" ? "expiring" : state.invPreset === "low" ? "low" : "all");
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);

  /* respond to alert-bell navigation presets even when already mounted */
  useEffect(() => {
    setFilter(state.invPreset === "expiring" ? "expiring" : state.invPreset === "low" ? "low" : "all");
  }, [state.invPreset]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.products.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (filter === "low" && p.stock > p.reorderLevel) return false;
      if (filter === "rx" && !p.rx) return false;
      if (filter === "expiring" && daysUntil(p.expiry) > 60) return false;
      if (!needle) return true;
      return [p.name, p.generic, p.brand, p.sku, p.barcode, p.batch].some((s) => s.toLowerCase().includes(needle));
    });
  }, [state.products, q, cat, filter]);

  const stockValue = rows.reduce((s, p) => s + p.cost * p.stock, 0);

  const exportCsv = () => {
    const head = ["sku", "name", "generic", "brand", "category", "form", "price", "cost", "stock", "reorder_level", "rx", "batch", "expiry", "supplier"];
    const body = rows.map((p) => [p.sku, `"${p.name}"`, `"${p.generic}"`, `"${p.brand}"`, p.category, `"${p.form}"`, p.price, p.cost, p.stock, p.reorderLevel, p.rx, p.batch, p.expiry, `"${p.supplier}"`].join(","));
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    dispatch({ type: "TOAST", kind: "success", msg: `Exported ${rows.length} rows to CSV` });
  };

  const filters: { id: Filter; label: string; count: number; tone?: string }[] = [
    { id: "all", label: "Everything", count: state.products.length },
    { id: "low", label: "Low stock", count: state.products.filter((p) => p.stock <= p.reorderLevel).length, tone: "#e0a63c" },
    { id: "expiring", label: "Expiring ≤60d", count: state.products.filter((p) => daysUntil(p.expiry) <= 60).length, tone: "#c24a2e" },
    { id: "rx", label: "℞ only", count: state.products.filter((p) => p.rx).length },
  ];

  return (
    <div className="h-full flex flex-col px-6 py-5 min-h-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <ISearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-inksoft" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search SKU, batch, barcode…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-mist text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition" />
        </div>

        <div className="flex gap-1.5">
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

      <div className="mt-4 flex items-center gap-2 text-xs text-inksoft">
        <select value={cat} onChange={(e) => setCat(e.target.value as CategoryId | "all")}
          className="px-2.5 py-1.5 rounded-lg border border-mist bg-card text-xs font-semibold text-ink focus:outline-none focus:border-pine-500 cursor-pointer">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <span>· {rows.length} of {state.products.length} products · stock value at cost</span>
        <span className="num font-bold text-pine-800">{money(stockValue)}</span>
      </div>

      <div className="mt-3 flex-1 min-h-0 overflow-y-auto scroll-slim rounded-xl border border-mist bg-card shadow-lift">
        {rows.length === 0 ? (
          <Empty icon={<IBox size={22} />} title="Nothing here" hint="Adjust the filters or add a new product to the catalog." />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-pine-900 text-pine-100 text-left text-[10px] uppercase tracking-[0.14em]">
                <th className="px-4 py-2.5 font-bold">Product</th>
                <th className="px-3 py-2.5 font-bold">Batch / Expiry</th>
                <th className="px-3 py-2.5 font-bold">Stock</th>
                <th className="px-3 py-2.5 font-bold text-right">Price</th>
                <th className="px-4 py-2.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const d = daysUntil(p.expiry);
                const low = p.stock <= p.reorderLevel;
                return (
                  <tr key={p.id} className={cx("border-t border-mist/70 transition-colors hover:bg-pine-50/60", i % 2 === 1 && "bg-paper/50")}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 shrink-0 rounded-full" style={{ background: CATEGORIES.find((c) => c.id === p.category)?.dot }} />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink leading-tight truncate max-w-[280px]">
                            {p.name} {p.rx && <span className="text-brick-700 font-bold">℞</span>}
                          </p>
                          <p className="num text-[10px] text-inksoft">{p.sku} · {p.barcode} · {p.supplier}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="num text-xs font-semibold text-ink">{p.batch}</p>
                      <span className={cx("inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold",
                        d <= 30 ? "bg-brick-100 text-brick-700" : d <= 60 ? "bg-honey-100 text-honey-700" : "bg-pine-100 text-pine-700")}>
                        {d <= 60 && <IAlert size={10} />}
                        {d <= 0 ? "EXPIRED" : `${d}d left`} · {p.expiry}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <StockBar stock={p.stock} reorder={p.reorderLevel} />
                      {low && <Badge tone={p.stock <= Math.ceil(p.reorderLevel / 3) ? "brick" : "honey"}>reorder</Badge>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="num font-bold text-ink">{money(p.price)}</p>
                      <p className="num text-[10px] text-inksoft">cost {money(p.cost)}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => dispatch({ type: "RESTOCK", productId: p.id, amount: 20 })}
                          className="px-2 py-1.5 rounded-md border border-pine-200 bg-pine-50 text-pine-700 text-[11px] font-bold hover:bg-pine-700 hover:text-pine-50 transition active:scale-95">
                          +20
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
      {adding && <AddProductModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function AdjustModal({ p, onClose }: { p: Product; onClose: () => void }) {
  const { dispatch } = usePos();
  const [qty, setQty] = useState(String(p.stock));
  const [reason, setReason] = useState("Cycle count correction");
  return (
    <Modal onClose={onClose} width={420} labelledBy="adj-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="adj-title" className="font-display font-bold text-ink">Adjust stock</h2>
          <p className="text-xs text-inksoft mt-0.5">{p.name} · batch {p.batch}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-4">
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
            Currently <span className="num font-bold text-ink">{p.stock}</span> → delta{" "}
            <span className={cx("num font-bold", (parseInt(qty) || 0) >= p.stock ? "text-pine-700" : "text-brick-700")}>
              {(parseInt(qty) || 0) - p.stock >= 0 ? "+" : ""}{(parseInt(qty) || 0) - p.stock}
            </span>
          </p>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full mt-1.5 px-3 py-2.5 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none">
            {["Cycle count correction", "Damaged / write-off", "Supplier return", "Theft / shrinkage", "Inter-branch transfer"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <button
          onClick={() => { dispatch({ type: "ADJUST_STOCK", productId: p.id, newQty: parseInt(qty) || 0 }); onClose(); }}
          className="w-full py-2.5 rounded-lg bg-pine-700 text-pine-50 font-display font-bold text-sm hover:bg-pine-600 transition active:scale-[0.98] flex items-center justify-center gap-2">
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
    price: "", cost: "", stock: "24", reorder: "10", rx: false, expDays: "365",
  });
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.name.trim() && parseFloat(f.price) > 0;

  const submit = () => {
    if (!valid) return;
    const id = `new${Date.now().toString(36)}`;
    dispatch({
      type: "ADD_PRODUCT",
      product: {
        id, sku: `SKU-${id.slice(-5).toUpperCase()}`, barcode: `890${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`,
        name: f.name.trim(), generic: f.generic.trim() || f.name.trim(), brand: f.brand.trim() || "House brand",
        category: f.category, form: f.form, price: parseFloat(f.price), cost: parseFloat(f.cost) || parseFloat(f.price) * 0.55,
        stock: parseInt(f.stock) || 0, reorderLevel: parseInt(f.reorder) || 10, rx: f.rx,
        batch: `HB-${new Date().getFullYear()}A01`,
        expiry: new Date(Date.now() + (parseInt(f.expDays) || 365) * 86_400_000).toISOString().slice(0, 10),
        supplier: "Manual entry",
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
          <p className="text-xs text-inksoft mt-0.5">Adds straight to the register catalog</p>
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
        <Field label="Opening stock" k="stock" num />
        <Field label="Reorder level" k="reorder" num />
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
