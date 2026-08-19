import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePos, money, relTime } from "../store";
import { CATEGORIES, TAX_RATE, daysUntil, stockOf, nearestExpiry, bulkPct } from "../data";
import type { CategoryId, Product } from "../data";
import { cx, Badge, Empty } from "../ui";
import {
  ISearch, IScan, IPlus, IMinus, ITrash, IPause, IRecall, IX, ICart, IPill, IChevD, ISpark, IEdit, ITag, IUsers,
} from "../icons";

type SortKey = "name" | "price" | "stock";

/* Subsequence fuzzy matcher: returns the matched character indices plus a relevance score. */
function fuzzy(query: string, target: string): { idx: number[]; score: number } | null {
  const qq = query.toLowerCase().replace(/\s+/g, "");
  const t = target.toLowerCase();
  if (!qq) return { idx: [], score: 0 };
  const idx: number[] = [];
  let ti = 0, streak = 0, score = 0;
  for (const ch of qq) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    streak = found === ti ? streak + 1 : 1;
    score += streak * 2;                                        // consecutive-run bonus
    if (found === 0 || /[\s\-/.]/.test(t[found - 1])) score += 6; // word-start bonus
    score += Math.max(0, 12 - found) * 0.15;                    // earlier matches win
    idx.push(found);
    ti = found + 1;
  }
  score += (qq.length / t.length) * 4;                          // tighter matches win
  return { idx, score };
}

export default function Register() {
  const { state, dispatch, product } = usePos();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [priceFor, setPriceFor] = useState<string | null>(null);
  const [priceVal, setPriceVal] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const saveNote = (productId: string, value: string) => {
    dispatch({ type: "SET_NOTE", productId, note: value });
    setNoteFor(null);
  };

  const needle = q.trim().toLowerCase();

  const list = useMemo(() => {
    const entries = state.products
      .filter((p) => cat === "all" || p.category === cat)
      .map((p): { p: Product; idx: number[]; score: number } | null => {
        if (!needle) return { p, idx: [], score: 0 };
        const fm = fuzzy(needle, p.name);
        if (fm) return { p, idx: fm.idx, score: fm.score };
        const fallback = [p.generic, p.brand, p.sku, p.barcode].some((s) => s.toLowerCase().includes(needle));
        return fallback ? { p, idx: [], score: 0 } : null;
      })
      .filter((x): x is { p: Product; idx: number[]; score: number } => x !== null);
    entries.sort((a, b) =>
      needle
        ? b.score - a.score || a.p.name.localeCompare(b.p.name)
        : sort === "price" ? a.p.price - b.p.price
        : sort === "stock" ? stockOf(a.p) - stockOf(b.p)
        : a.p.name.localeCompare(b.p.name));
    return entries;
  }, [state.products, needle, cat, sort]);

  /* Best movers by units sold across all transactions — feeds the quick-pick rail. */
  const topSellers = useMemo(() => {
    const units = new Map<string, number>();
    for (const t of state.transactions) {
      if (t.refundOf) continue; // refunded units don't count as moved
      for (const l of t.lines) units.set(l.productId, (units.get(l.productId) ?? 0) + l.qty);
    }
    return [...units.entries()]
      .map(([id, sold]) => ({ p: state.products.find((x) => x.id === id), sold }))
      .filter((x): x is { p: Product; sold: number } => !!x.p && stockOf(x.p) > 0)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 6);
  }, [state.transactions, state.products]);

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
          {needle === "" && cat === "all" && topSellers.length > 0 && (
            <QuickPicks items={topSellers} onAdd={(id) => dispatch({ type: "ADD_CART", productId: id })} />
          )}
          {list.length === 0 ? (
            <Empty icon={<IPill size={22} />} title="No products match"
              hint={`Nothing found for “${q}”. Try a fuzzy match like “para 500”, a generic name, or scan the barcode.`} />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {list.map(({ p, idx }) => (
                <ProductCard key={p.id} p={p} hl={idx}
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

        <CustomerAttach />

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
                <span className="num text-[13px] font-bold text-ink shrink-0 flex items-center gap-1.5">
                  {!p.rx && bulkPct(line.qty) > 0 && (
                    <span className="num text-[9px] font-bold px-1.5 py-0.5 rounded bg-honey-100 border border-honey-300/60 text-honey-700">
                      bulk −{bulkPct(line.qty)}%
                    </span>
                  )}
                  {money((line.priceOverride ?? p.price) * line.qty)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1">
                  <QtyBtn onClick={() => dispatch({ type: "SET_QTY", productId: p.id, qty: line.qty - 1 })} label="Decrease"><IMinus size={12} /></QtyBtn>
                  <span className="num w-8 text-center text-sm font-bold text-ink">{line.qty}</span>
                  <QtyBtn onClick={() => dispatch({ type: "ADD_CART", productId: p.id })} label="Increase" disabled={line.qty >= stockOf(p)}><IPlus size={12} /></QtyBtn>
                  {line.qty >= stockOf(p) && <Badge tone="honey">max</Badge>}
                  {p.rx && <Badge tone="brick">℞</Badge>}
                  {p.controlled && <span className="px-1.5 py-0.5 rounded bg-ink text-paper text-[9px] font-bold tracking-wide">{p.controlled}</span>}
                </div>
                <button onClick={() => dispatch({ type: "REMOVE_LINE", productId: p.id })}
                  className="p-1.5 rounded-md text-inksoft opacity-40 group-hover:opacity-100 hover:text-brick-700 hover:bg-brick-100 transition" aria-label={`Remove ${p.name}`}>
                  <ITrash size={13} />
                </button>
              </div>
              {noteFor === p.id ? (
                <input autoFocus defaultValue={line.note ?? ""}
                  placeholder="e.g. take with food — counseling given"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveNote(p.id, (e.target as HTMLInputElement).value);
                    if (e.key === "Escape") setNoteFor(null);
                  }}
                  onBlur={(e) => saveNote(p.id, e.target.value)}
                  className="anim-fade-up mt-2 w-full text-[11px] px-2 py-1.5 rounded-md border border-honey-300 bg-card text-ink placeholder:text-inksoft/60 focus:outline-none focus:border-honey-500 focus:ring-2 focus:ring-honey-300/40 transition" />
              ) : line.note ? (
                <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-honey-700 bg-honey-100/70 border border-honey-300/50 rounded-md px-2 py-1">
                  <IEdit size={9} className="shrink-0" />
                  <span className="truncate">{line.note}</span>
                  <button onClick={() => dispatch({ type: "SET_NOTE", productId: p.id, note: "" })}
                    className="ml-auto shrink-0 p-0.5 rounded text-inksoft hover:text-brick-700 transition" aria-label="Clear note">
                    <IX size={9} />
                  </button>
                </p>
              ) : (
                <button onClick={() => setNoteFor(p.id)}
                  className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-inksoft/60 hover:text-honey-700 opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <IEdit size={9} /> Add counter note
                </button>
              )}

              {priceFor === p.id ? (
                <div className="anim-fade-up mt-2 flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-inksoft">$</span>
                  <input autoFocus value={priceVal} onChange={(e) => setPriceVal(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder={p.price.toFixed(2)} inputMode="decimal"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { const v = parseFloat(priceVal); if (v > 0) dispatch({ type: "SET_PRICE", productId: p.id, price: v }); setPriceFor(null); }
                      if (e.key === "Escape") setPriceFor(null);
                    }}
                    onBlur={() => { const v = parseFloat(priceVal); if (v > 0) dispatch({ type: "SET_PRICE", productId: p.id, price: v }); setPriceFor(null); }}
                    className="num flex-1 min-w-0 text-[11px] px-2 py-1.5 rounded-md border border-pine-300 bg-card text-ink focus:outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-200 transition" />
                  <button onClick={() => { dispatch({ type: "SET_PRICE", productId: p.id, price: null }); setPriceFor(null); }}
                    className="text-[10px] font-bold text-inksoft hover:text-brick-700 px-1.5 py-1 rounded transition">List</button>
                </div>
              ) : line.priceOverride !== undefined ? (
                <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-pine-700 bg-pine-100/80 border border-pine-200 rounded-md px-2 py-1 num">
                  <ITag size={9} className="shrink-0" />
                  <span>override {money(line.priceOverride)}</span>
                  <span className="text-inksoft line-through font-medium">{money(p.price)}</span>
                  <button onClick={() => dispatch({ type: "SET_PRICE", productId: p.id, price: null })}
                    className="ml-auto p-0.5 rounded text-inksoft hover:text-brick-700 transition" aria-label="Reset to list price">
                    <IX size={9} />
                  </button>
                </p>
              ) : (
                <button onClick={() => { setPriceFor(p.id); setPriceVal(""); }}
                  className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-inksoft/60 hover:text-pine-700 opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <ITag size={9} /> Override price
                </button>
              )}
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

/* Renders `text` with the fuzzy-matched characters wrapped in a highlight. */
function Highlight({ text, idx }: { text: string; idx: number[] }) {
  if (!idx.length) return <>{text}</>;
  const set = new Set(idx);
  return (
    <>
      {text.split("").map((ch, i) =>
        set.has(i) ? <mark key={i} className="fuzzy-hl">{ch}</mark> : <span key={i}>{ch}</span>)}
    </>
  );
}

function QuickPicks({ items, onAdd }: { items: { p: Product; sold: number }[]; onAdd: (id: string) => void }) {
  return (
    <div className="mb-4 anim-fade-up">
      <div className="flex items-center gap-1.5 mb-2">
        <ISpark size={13} className="text-honey-700" />
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft">Fast movers · top sellers</p>
      </div>
      <div className="flex gap-2 overflow-x-auto scroll-slim pb-1">
        {items.map(({ p, sold }) => (
          <button key={p.id} onClick={() => onAdd(p.id)}
            className="group shrink-0 w-[172px] text-left bg-pine-50/60 border border-pine-200/70 rounded-xl p-2.5 hover:border-pine-400 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.97] transition-all duration-200">
            <div className="flex items-center justify-between gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: CATEGORIES.find((c) => c.id === p.category)?.dot }} />
              <span className="num text-[9px] font-bold text-pine-700 bg-pine-100 rounded px-1 py-0.5">{sold} sold</span>
            </div>
            <p className="mt-1.5 text-[12px] font-semibold text-ink leading-tight line-clamp-2 min-h-[2.4em]">{p.name}</p>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="num text-[13px] font-bold text-pine-800">{money(p.price)}</span>
              <span className="grid place-items-center w-6 h-6 rounded-md bg-pine-700 text-pine-50 group-hover:scale-110 transition-transform">
                <IPlus size={12} />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Customer attach — walk-in by default, searchable book + inline quick-add */
function CustomerAttach() {
  const { state, dispatch } = usePos();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const customer = state.customers.find((c) => c.id === state.saleCustomerId) ?? null;
  const needle = q.trim().toLowerCase();
  const matches = state.customers
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.phone.replace(/\D/g, "").includes(needle.replace(/\D/g, "")))
    .slice(0, 5);

  const attach = (id: string | null) => {
    dispatch({ type: "SET_SALE_CUSTOMER", id });
    setOpen(false); setQ(""); setAdding(false);
  };

  return (
    <div className="relative px-4 pt-3">
      <button onClick={() => setOpen(!open)}
        className={cx("w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all duration-200",
          customer
            ? "border-honey-300 bg-honey-100/60 hover:border-honey-400"
            : "border-mist bg-paper hover:border-pine-300")}>
        <span className={cx("grid place-items-center w-6 h-6 rounded-md shrink-0", customer ? "bg-honey-500 text-pine-950" : "bg-mist text-inksoft")}>
          <IUsers size={12} />
        </span>
        <span className="flex-1 text-left min-w-0">
          <span className={cx("block text-xs font-bold truncate", customer ? "text-honey-800" : "text-inksoft")}>
            {customer ? customer.name : "Walk-in customer"}
          </span>
          <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-inksoft">
            {customer ? `${customer.points} pts · tap to change` : "tap to attach · earn pts"}
          </span>
        </span>
        {customer ? (
          <span onClick={(e) => { e.stopPropagation(); attach(null); }}
            className="p-1 rounded text-inksoft hover:text-brick-700 hover:bg-brick-100 transition" aria-label="Detach customer">
            <IX size={11} />
          </span>
        ) : (
          <IChevD size={12} className={cx("text-inksoft transition-transform duration-200", open && "rotate-180")} />
        )}
      </button>

      {open && !customer && (
        <div className="anim-pop absolute left-4 right-4 top-full mt-1.5 z-30 bg-card border border-mist rounded-xl shadow-pop p-2.5">
          <div className="relative">
            <ISearch size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-inksoft" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone…"
              className="w-full pl-7.5 pl-8 pr-2 py-1.5 rounded-md border border-mist text-xs focus:border-pine-500 focus:outline-none transition" />
          </div>
          <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto scroll-slim">
            {matches.map((c) => (
              <button key={c.id} onClick={() => attach(c.id)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-pine-50 transition text-left">
                <span className="text-xs font-semibold text-ink truncate">{c.name}</span>
                <span className="num text-[10px] text-inksoft shrink-0 ml-2">{c.phone} · {c.points} pts</span>
              </button>
            ))}
            {matches.length === 0 && <p className="px-2 py-2 text-[11px] text-inksoft">No match in the book.</p>}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-mist">
            {!adding ? (
              <button onClick={() => setAdding(true)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-dashed border-pine-300 text-[11px] font-bold text-pine-700 hover:bg-pine-50 transition">
                <IPlus size={11} /> Quick-add new customer
              </button>
            ) : (
              <div className="anim-fade-up space-y-1.5">
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name *"
                  className="w-full px-2 py-1.5 rounded-md border border-mist text-xs focus:border-pine-500 focus:outline-none transition" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone *"
                  className="num w-full px-2 py-1.5 rounded-md border border-mist text-xs focus:border-pine-500 focus:outline-none transition" />
                <button disabled={name.trim().length < 2 || phone.replace(/\D/g, "").length < 7}
                  onClick={() => { dispatch({ type: "ADD_CUSTOMER", name, phone }); setOpen(false); setName(""); setPhone(""); }}
                  className={cx("w-full py-1.5 rounded-md text-[11px] font-bold transition",
                    name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 7
                      ? "bg-pine-700 text-pine-50 hover:bg-pine-600" : "bg-mist text-inksoft cursor-not-allowed")}>
                  Add & attach
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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

function ProductCard({ p, hl = [], flashing, flashKey, onAdd }: {
  p: Product; hl?: number[]; flashing: boolean; flashKey: number; onAdd: () => void;
}) {
  const near = nearestExpiry(p);
  const d = near ? daysUntil(near) : 9999;
  const avail = stockOf(p);
  const out = avail <= 0;
  const low = !out && avail <= p.reorderLevel;
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
        <span className="flex items-center gap-1">
          {p.rx && <Badge tone="brick">℞</Badge>}
          {p.controlled && <span className="px-1.5 py-0.5 rounded bg-ink text-paper text-[9px] font-bold tracking-wide">{p.controlled}</span>}
        </span>
      </div>
      <p className="mt-1.5 font-display font-semibold text-[14px] text-ink leading-snug line-clamp-2 min-h-[2.5em]">
        <Highlight text={p.name} idx={hl} />
      </p>
      <p className="text-[11px] text-inksoft truncate">{p.generic}</p>
      <p className="text-[11px] text-inksoft/80 mt-0.5 truncate">{p.form}</p>

      <div className="mt-2.5 pt-2.5 border-t border-dashed border-mist flex items-end justify-between">
        <div>
          <p className="num text-[16px] font-bold text-ink leading-none">{money(p.price)}</p>
          <p className={cx("mt-1 text-[10px] font-semibold flex items-center gap-1",
            out ? "text-brick-700" : low ? "text-honey-700" : "text-pine-600")}>
            <span className={cx("w-1.5 h-1.5 rounded-full", (low || out) && "anim-pulse-dot")}
              style={{ background: out ? "#c24a2e" : low ? "#e0a63c" : "#3b8668" }} />
            {out ? "Out of stock" : `${avail} in stock`}
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
