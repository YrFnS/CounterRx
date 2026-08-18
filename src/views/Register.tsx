import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePos, money, relTime } from "../store";
import { CATEGORIES, TAX_RATE, daysUntil } from "../data";
import type { CategoryId, Product } from "../data";
import { cx, Badge, Empty } from "../ui";
import {
  ISearch, IScan, IPlus, IMinus, ITrash, IPause, IRecall, IX, ICart, IPill, IChevD,
} from "../icons";

type SortKey = "name" | "price" | "stock";

export default function Register() {
  const { state, dispatch, product } = usePos();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [sort, setSort] = useState<SortKey>("name");
  const searchRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = state.products.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (!needle) return true;
      return [p.name, p.generic, p.brand, p.sku, p.barcode].some((s) => s.toLowerCase().includes(needle));
    });
    arr = [...arr].sort((a, b) =>
      sort === "price" ? a.price - b.price : sort === "stock" ? a.stock - b.stock : a.name.localeCompare(b.name));
    return arr;
  }, [state.products, q, cat, sort]);

  /* barcode scanner simulation: an exact barcode + Enter scans the item in */
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const needle = q.trim();
    if (!needle) return;
    const hit = state.products.find((p) => p.barcode === needle || p.sku.toLowerCase() === needle.toLowerCase());
    if (hit) {
      dispatch({ type: "ADD_CART", productId: hit.id });
      setQ("");
    }
  };

  const cartLines = state.cart.map((c) => ({ line: c, p: product(c.productId)! })).filter((x) => x.p);
  const subtotal = cartLines.reduce((s, x) => s + x.p.price * x.line.qty, 0);
  const tax = (subtotal) * TAX_RATE;
  const total = subtotal + tax;
  const itemCount = state.cart.reduce((s, c) => s + c.qty, 0);
  const hasRx = cartLines.some((x) => x.p.rx);

  return (
    <div className="flex h-full min-h-0">
      {/* -------- catalog side -------- */}
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="px-5 pt-4 pb-3 space-y-3">
          <div className="flex gap-2.5 items-center">
            <div className="relative flex-1">
              <ISearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-inksoft" />
              <input
                id="pos-search" ref={searchRef} value={q}
                onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey}
                placeholder="Search name, generic, brand… or scan a barcode"
                className="w-full pl-9 pr-20 py-2.5 rounded-lg bg-card border border-mist text-sm text-ink placeholder:text-inksoft/70 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition"
              />
              <span className="scan-chip absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-pine-800 text-pine-100 text-[10px] font-semibold tracking-wide">
                <IScan size={12} /> SCANNER LIVE
              </span>
            </div>
            <div className="relative">
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                className="appearance-none pl-3 pr-8 py-2.5 rounded-lg bg-card border border-mist text-xs font-semibold text-ink focus:border-pine-500 focus:outline-none cursor-pointer">
                <option value="name">Sort · Name</option>
                <option value="price">Sort · Price</option>
                <option value="stock">Sort · Stock</option>
              </select>
              <IChevD size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-inksoft" />
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto scroll-slim pb-1 -mx-1 px-1">
            <CatChip active={cat === "all"} label="All items" count={state.products.length}
              onClick={() => setCat("all")} dot="#5c6b66" />
            {CATEGORIES.map((c) => (
              <CatChip key={c.id} active={cat === c.id} label={c.label} dot={c.dot}
                count={state.products.filter((p) => p.category === c.id).length}
                onClick={() => setCat(cat === c.id ? "all" : c.id)} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-slim px-5 pb-6">
          {list.length === 0 ? (
            <Empty icon={<IPill size={22} />} title="No products match"
              hint={`Nothing found for “${q}”. Try a generic name, or scan the item's barcode.`} />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {list.map((p) => (
                <ProductCard key={p.id} p={p}
                  flashing={state.flashId === p.id} flashKey={state.flashKey}
                  onAdd={() => dispatch({ type: "ADD_CART", productId: p.id })} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* -------- cart side -------- */}
      <aside className="w-[372px] shrink-0 border-l border-mist bg-card flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-mist flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-pine-800 text-pine-50"><ICart size={16} /></span>
            <div>
              <h2 className="font-display font-bold text-ink leading-none">Current sale</h2>
              <p className="text-[11px] text-inksoft mt-0.5">{itemCount} item{itemCount === 1 ? "" : "s"} · {hasRx ? "℞ attached" : "no ℞ items"}</p>
            </div>
          </div>
          {state.cart.length > 0 && (
            <button onClick={() => dispatch({ type: "CLEAR_CART" })}
              className="text-[11px] font-semibold text-brick-700 hover:bg-brick-100 px-2 py-1 rounded-md transition">
              Clear all
            </button>
          )}
        </div>

        {state.held.length > 0 && (
          <div className="px-4 py-2.5 bg-honey-100/60 border-b border-honey-300/50">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-honey-700 mb-1.5">Parked sales · {state.held.length}</p>
            <div className="flex flex-wrap gap-1.5">
              {state.held.map((h) => (
                <span key={h.id} className="group inline-flex items-center gap-1 bg-card border border-honey-300/70 rounded-md pl-2 pr-1 py-1 text-[11px] font-semibold text-ink">
                  <button onClick={() => dispatch({ type: "RECALL_HELD", id: h.id })}
                    className="flex items-center gap-1 hover:text-pine-700 transition" title={`Recall ${h.label} (${relTime(h.at)})`}>
                    <IRecall size={11} /> {h.label} · {h.items.reduce((s, i) => s + i.qty, 0)}
                  </button>
                  <button onClick={() => dispatch({ type: "DROP_HELD", id: h.id })}
                    className="p-0.5 rounded text-inksoft opacity-50 hover:opacity-100 hover:text-brick-700 transition" aria-label={`Drop ${h.label}`}>
                    <IX size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scroll-slim px-4 py-3 space-y-2">
          {cartLines.length === 0 && (
            <Empty icon={<ICart size={22} />} title="Cart is empty"
              hint="Tap a product or scan its barcode. Press F2 to jump to search, F8 to take payment." />
          )}
          {cartLines.map(({ line, p }) => (
            <div key={`${p.id}-${line.qty}`} className="anim-fade-up group bg-paper border border-mist rounded-lg p-2.5 hover:border-pine-300 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink leading-tight truncate">{p.name}</p>
                  <p className="text-[11px] text-inksoft truncate">{p.form} · {money(p.price)} ea</p>
                </div>
                <span className="num text-[13px] font-bold text-ink shrink-0">{money(p.price * line.qty)}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1">
                  <QtyBtn onClick={() => dispatch({ type: "SET_QTY", productId: p.id, qty: line.qty - 1 })} label="Decrease"><IMinus size={12} /></QtyBtn>
                  <span className="num w-8 text-center text-sm font-bold text-ink">{line.qty}</span>
                  <QtyBtn onClick={() => dispatch({ type: "ADD_CART", productId: p.id })} label="Increase" disabled={line.qty >= p.stock}><IPlus size={12} /></QtyBtn>
                  {line.qty >= p.stock && <Badge tone="honey">max</Badge>}
                  {p.rx && <Badge tone="brick">℞</Badge>}
                </div>
                <button onClick={() => dispatch({ type: "REMOVE_LINE", productId: p.id })}
                  className="p-1.5 rounded-md text-inksoft opacity-40 group-hover:opacity-100 hover:text-brick-700 hover:bg-brick-100 transition" aria-label={`Remove ${p.name}`}>
                  <ITrash size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-mist px-4 py-4 bg-card">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-inksoft"><span>Subtotal</span><span className="num">{money(subtotal)}</span></div>
            <div className="flex justify-between text-inksoft"><span>Tax 8%</span><span className="num">{money(tax)}</span></div>
            <div className="flex justify-between items-baseline pt-1.5 border-t border-dashed border-mist">
              <span className="font-display font-bold text-ink">Total</span>
              <span className="num text-[26px] font-bold text-pine-800">{money(total)}</span>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => dispatch({ type: "HOLD_SALE", label: `Hold ${state.held.length + 1}` })}
              disabled={state.cart.length === 0}
              className={cx("px-3 py-3 rounded-lg border font-display font-semibold text-sm flex items-center gap-1.5 transition-all",
                state.cart.length ? "border-mist text-ink hover:border-honey-500 hover:bg-honey-100/50 active:scale-[0.97]" : "border-mist text-inksoft/50 cursor-not-allowed")}>
              <IPause size={14} /> Hold
            </button>
            <button
              onClick={() => dispatch({ type: "OPEN_PAY", open: true })}
              disabled={state.cart.length === 0}
              className={cx("flex-1 py-3 rounded-lg font-display font-bold text-[15px] flex items-center justify-center gap-2 transition-all",
                state.cart.length
                  ? "bg-pine-700 text-pine-50 hover:bg-pine-600 active:scale-[0.98] shadow-lift"
                  : "bg-mist text-inksoft/60 cursor-not-allowed")}>
              Charge {money(total)} <span className="text-pine-200 text-[11px] font-semibold">F8</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function QtyBtn({ children, onClick, label, disabled }: {
  children: ReactNode; onClick: () => void; label: string; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label}
      className={cx("grid place-items-center w-7 h-7 rounded-md border transition active:scale-90",
        disabled ? "border-mist text-inksoft/40 cursor-not-allowed" : "border-mist bg-card text-ink hover:border-pine-400 hover:text-pine-700")}>
      {children}
    </button>
  );
}

function CatChip({ active, label, count, dot, onClick }: {
  active: boolean; label: string; count: number; dot: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={cx("shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200",
        active
          ? "bg-pine-800 text-pine-50 border-pine-800 shadow-lift"
          : "bg-card text-inksoft border-mist hover:border-pine-300 hover:text-ink")}>
      <span className="w-2 h-2 rounded-full" style={{ background: active ? "#8fbfa9" : dot }} />
      {label}
      <span className={cx("num text-[10px]", active ? "text-pine-200" : "text-inksoft/70")}>{count}</span>
    </button>
  );
}

function ProductCard({ p, flashing, flashKey, onAdd }: {
  p: Product; flashing: boolean; flashKey: number; onAdd: () => void;
}) {
  const d = daysUntil(p.expiry);
  const out = p.stock <= 0;
  const low = !out && p.stock <= p.reorderLevel;
  return (
    <button onClick={onAdd} disabled={out}
      className={cx(
        "group relative text-left bg-card border border-mist rounded-xl p-3.5 transition-all duration-200 overflow-hidden",
        out ? "opacity-45 cursor-not-allowed" : "hover:border-pine-400 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98]",
      )}>
      {flashing && <span key={flashKey} className="anim-pop absolute inset-0 rounded-xl ring-2 ring-pine-500 pointer-events-none" />}
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-inksoft">
          <span className="w-2 h-2 rounded-full" style={{ background: CATEGORIES.find((c) => c.id === p.category)?.dot }} />
          {p.brand}
        </span>
        {p.rx && <Badge tone="brick">℞</Badge>}
      </div>
      <p className="mt-1.5 font-display font-semibold text-[14px] text-ink leading-snug line-clamp-2 min-h-[2.5em]">{p.name}</p>
      <p className="text-[11px] text-inksoft truncate">{p.generic}</p>
      <p className="text-[11px] text-inksoft/80 mt-0.5 truncate">{p.form}</p>

      <div className="mt-2.5 pt-2.5 border-t border-dashed border-mist flex items-end justify-between">
        <div>
          <p className="num text-[16px] font-bold text-ink leading-none">{money(p.price)}</p>
          <p className={cx("mt-1 text-[10px] font-semibold flex items-center gap-1",
            out ? "text-brick-700" : low ? "text-honey-700" : "text-pine-600")}>
            <span className={cx("w-1.5 h-1.5 rounded-full", (low || out) && "anim-pulse-dot")}
              style={{ background: out ? "#c24a2e" : low ? "#e0a63c" : "#3b8668" }} />
            {out ? "Out of stock" : `${p.stock} in stock`}
          </p>
        </div>
        <span className={cx("grid place-items-center w-8 h-8 rounded-lg border transition-all duration-200",
          out ? "border-mist text-inksoft/40" : "border-pine-200 bg-pine-50 text-pine-700 group-hover:bg-pine-700 group-hover:text-pine-50 group-hover:scale-110")}>
          <IPlus size={15} />
        </span>
      </div>
      {d <= 60 && !out && (
        <span className="absolute top-0 right-0">
          <span className={cx("block text-[9px] font-bold px-1.5 py-0.5 rounded-bl-lg",
            d <= 30 ? "bg-brick-500 text-brick-100" : "bg-honey-500 text-pine-950")}>
            EXP {d}d
          </span>
        </span>
      )}
    </button>
  );
}
