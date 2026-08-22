import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { usePos, money, relTime, unitPrice, cartTotals, uomFactor } from "../store";
import { daysUntil, stockOf, nearestExpiry, bulkPct, fefoBatches, findInteractions, allergyConflicts } from "../data";
import type { Product } from "../data";
import { aiClassify } from "../lib/ai";
import { cartToInteractionPrompt, parseClassifyJson } from "../lib/ai-ui";
import { cx, Badge, Empty, Modal } from "../ui";
import {
  ISearch, IPlus, IMinus, ITrash, IPause, IRecall, IX, ICart, IPill, IChevD, ISpark as ISparkIcon, IEdit, ITag, IUsers, IAlert, IPrint, ICold, ICheck,
} from "../icons";
import ShiftBar from "./Till";
import { printReceipt, HardwareError } from "../lib/hardware";

/* Tiny WebAudio "scanner beep" — the signature sound of a POS, fired on a real barcode hit. */
let audioCtx: AudioContext | null = null;
function playScanBeep() {
  try {
    audioCtx = audioCtx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1180, t);
    osc.frequency.exponentialRampToValueAtTime(1560, t + 0.07);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  } catch { /* audio unavailable — stay silent */ }
}

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
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [priceFor, setPriceFor] = useState<string | null>(null);
  const [priceVal, setPriceVal] = useState("");
  const [discFor, setDiscFor] = useState<string | null>(null);
  const [discVal, setDiscVal] = useState("");
  const [discMode, setDiscMode] = useState<"amt" | "pct">("pct");
  const [scanMiss, setScanMiss] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  /* generic substitution gate (§3 DAW) — offer the cheaper equivalent before a brand goes on the ticket */
  const [subPrompt, setSubPrompt] = useState<{ brand: Product; gen: Product } | null>(null);
  const [dawChoice, setDawChoice] = useState(1);
  const tryAdd = (p: Product, uom?: string) => {
    const gen = state.products.find((x) => x.genericOf === p.id);
    const alreadyOnTicket = state.cart.some((c) => c.productId === p.id);
    if (gen && !p.genericOf && !alreadyOnTicket && stockOf(gen) > 0) {
      setSubPrompt({ brand: p, gen });
      setDawChoice(1);
      return;
    }
    dispatch({ type: "ADD_CART", productId: p.id, uom });
  };
  const acceptGeneric = () => {
    if (!subPrompt) return;
    dispatch({ type: "ADD_CART", productId: subPrompt.gen.id, substitutedFrom: subPrompt.brand.id });
    dispatch({ type: "AUDIT_LOG", kind: "rx", detail: `Generic substitution — ${subPrompt.gen.brand} dispensed for ${subPrompt.brand.brand} · patient saves ${money(subPrompt.brand.price - subPrompt.gen.price)}/unit` });
    setSubPrompt(null);
  };
  const keepBrand = () => {
    if (!subPrompt) return;
    dispatch({ type: "ADD_CART", productId: subPrompt.brand.id, daw: dawChoice });
    dispatch({ type: "AUDIT_LOG", kind: "rx", detail: `DAW-${dawChoice} documented — ${subPrompt.brand.brand} dispensed as written (${dawChoice === 1 ? "prescriber directed" : "patient requested brand"})` });
    setSubPrompt(null);
  };

  const saveNote = (productId: string, value: string) => {
    dispatch({ type: "SET_NOTE", productId, note: value });
    setNoteFor(null);
  };

  const needle = q.trim().toLowerCase();

  const categories = useMemo(
    () => (state.categories ?? []).filter((c) => !c.archived).sort((x, y) => x.sort - y.sort),
    [state.categories]);
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
    const norm = (s: string) => s.replace(/[^0-9a-z]/gi, "");
    const hit = state.products.find((p) =>
      p.barcode === needle
      || p.sku.toLowerCase() === needle.toLowerCase()
      || (p.ndc && norm(p.ndc) === norm(needle))     /* NDC scan — dashes optional (§3) */
      || (p.gtin && p.gtin === needle.replace(/\D/g, "")));
    if (hit) {
      tryAdd(hit);
      if (state.settings.scanBeep) playScanBeep();
      setQ("");
      return;
    }
    /* per-UOM pack barcode (§5) — sell straight into the pack UOM */
    const uomHit = state.products
      .map((p) => ({ p, uom: p.uoms?.find((u) => u.barcode && u.barcode === needle) }))
      .find((x): x is { p: Product; uom: NonNullable<Product["uoms"]>[number] } => !!x.uom);
    if (uomHit) {
      tryAdd(uomHit.p, uomHit.uom.code);
      if (state.settings.scanBeep) playScanBeep();
      setQ("");
      return;
    }
    /* looks like a scannable code (no spaces, ≥6 chars) but nothing matched → tell the cashier */
    const looksScannable = !/\s/.test(needle) && needle.length >= 6;
    if (looksScannable) {
      dispatch({ type: "TOAST", kind: "error", msg: `No SKU for code “${needle}” — check the barcode` });
      setScanMiss((n) => n + 1);
    }
  };

  const cartLines = state.cart.map((c) => ({ line: c, p: product(c.productId)! })).filter((x) => x.p);
  /* products involved in a major interaction with something else in the cart */
  const interactingIds = new Set(
    findInteractions(cartLines.map((x) => x.p.id))
      .filter((i) => i.severity === "major")
      .flatMap((i) => [i.a, i.b]));
  /* single source of truth — matches the payment modal exactly */
  const attachedCustomer = state.customers.find((c) => c.id === state.saleCustomerId) ?? null;
  const totals = cartTotals(state, 0, !!attachedCustomer?.taxExempt);

  const lineDiscountValue = (price: number, qty: number, disc?: { mode: "amt" | "pct"; value: number }): number => {
    if (!disc || disc.value <= 0) return 0;
    const gross = price * qty;
    return disc.mode === "pct"
      ? Math.round((gross * Math.min(100, disc.value)) / 100 * 100) / 100
      : Math.round(Math.min(disc.value, gross) * 100) / 100;
  };
  const applyLineDiscount = (productId: string, uom?: string) => {
    const v = parseFloat(discVal);
    const discount = !v || v <= 0 ? undefined : { mode: discMode, value: v } as const;
    dispatch({ type: "SET_LINE_DISCOUNT", productId, uom, discount });
    setDiscFor(null);
  };
  const { subtotal, tax, total } = totals;
  const itemCount = state.cart.reduce((s, c) => s + c.qty, 0);
  const hasRx = cartLines.some((x) => x.p.rx);

  const onPrintToDevice = async () => {
    const s = state.settings;
    const lines = cartLines.map(({ line, p }) => {
      const up = unitPrice(state, p.id);
      const name = `${p.name}${p.rx ? " ℞" : ""}${line.daw ? ` (DAW-${line.daw})` : ""}${line.substitutedFrom ? " [gen]" : ""}`;
      return `${name} x${line.qty}  ${money(up * line.qty)}`;
    });
    if (totals.bulkSavings > 0) lines.push(`Bulk savings     -${money(totals.bulkSavings)}`);
    if (totals.loyaltyDeduct > 0) lines.push(`Points redeemed -${money(totals.loyaltyDeduct)}`);
    lines.push(`Subtotal        ${money(subtotal)}`);
    lines.push(`TOTAL           ${money(total)}`);
    try {
      await printReceipt({
        header: [s.orgName, s.branch, s.address, s.phone, s.license],
        lines,
        footer: s.receiptFooter || s.receiptTerms,
      }, s.hardwareEnabled);
      dispatch({ type: "TOAST", kind: "success", msg: t("pos.printSent") });
    } catch (e) {
      const err = e as HardwareError;
      const msg = err instanceof HardwareError && err.code === "disabled"
        ? t("pos.printDisabled")
        : t("pos.printFailed");
      dispatch({ type: "TOAST", kind: "error", msg });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 overflow-y-auto lg:overflow-hidden scroll-slim">
      {/* -------- catalog side -------- */}
      <section className="flex-1 min-w-0 flex flex-col lg:min-h-0">
        <div className="px-3 sm:px-5 pt-4 pb-3 space-y-3">
          <div className="flex gap-2.5 items-center">
            <div key={scanMiss} className={cx("relative flex-1", scanMiss > 0 && "anim-shake")}>
              <ISearch size={16} className="absolute start-3 inset-y-0 flex items-center text-inksoft" />
              <input
                id="pos-search" ref={searchRef} value={q}
                onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey}
                placeholder={t("pos.searchFuzzyHint")}
                className="w-full ps-9 pe-20 py-2.5 rounded-lg bg-card border border-mist text-sm text-ink placeholder:text-inksoft/70 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition"
              />
            </div>
            <div className="relative">
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                className="appearance-none ps-3 pe-8 py-2.5 rounded-lg bg-card border border-mist text-xs font-semibold text-ink focus:border-pine-500 focus:outline-none cursor-pointer">
                <option value="name">Sort · Name</option>
                <option value="price">Sort · Price</option>
                <option value="stock">Sort · Stock</option>
              </select>
              <IChevD size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-inksoft" />
            </div>
          </div>

          <ShiftBar />

          <div className="flex gap-1.5 overflow-x-auto scroll-slim pb-1 -mx-1 px-1">
            <CatChip active={cat === "all"} label={t("pos.allItems")} count={state.products.length}
              onClick={() => setCat("all")} dot="#5c6b66" />
            {categories.map((c) => (
              <CatChip key={c.id} active={cat === c.id} label={c.label} dot={c.color}
                count={state.products.filter((p) => p.category === c.id).length}
                onClick={() => setCat(cat === c.id ? "all" : c.id)} />
            ))}
          </div>
        </div>

        <div className="lg:flex-1 overflow-y-auto scroll-slim px-3 sm:px-5 pb-6">
          {needle === "" && cat === "all" && topSellers.length > 0 && (
            <QuickPicks items={topSellers} colorOf={(c) => state.categories?.find((x) => x.id === c)?.color ?? "#5c6b66"} onAdd={(id) => { const p = state.products.find((x) => x.id === id); if (p) tryAdd(p); }} />
          )}
          {list.length === 0 ? (
            <Empty icon={<IPill size={22} />} title={t("pos.noProductsMatch")}
              hint={`Nothing found for “${q}”. Try a fuzzy match like “para 500”, a generic name, or scan the barcode.`} />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {list.map(({ p, idx }) => (
                <ProductCard key={p.id} p={p} hl={idx}
                  flashing={state.flashId === p.id} flashKey={state.flashKey} colorOf={(c) => state.categories?.find((x) => x.id === c)?.color ?? "#5c6b66"}
                  onAdd={() => tryAdd(p)} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* -------- cart side -------- */}
      <aside className="w-full lg:w-[372px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-mist bg-card flex flex-col lg:min-h-0">
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

        {/* Phase G (P1): AI second-pass interaction check — advisory only, never blocks checkout */}
        {state.cart.length > 0 && (
          <AiSecondPass
            meds={cartLines.map(({ line, p }) => ({ productId: p.id, name: p.name, generic: p.generic, qty: line.qty }))}
            allergies={attachedCustomer?.allergies ?? []}
            patientName={attachedCustomer?.name ?? ""}
          />
        )}

        {subPrompt && (
          <div className="mx-4 mt-3 rounded-lg border-2 border-pine-500 bg-pine-100/70 p-3 anim-fade-up shadow-lift">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-pine-800 flex items-center gap-1.5">
              <IPill size={12} /> Generic available — substitution prompt
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-ink truncate">{subPrompt.gen.name} <span className="text-pine-700">({subPrompt.gen.brand})</span></p>
                <p className="num text-[11px] text-pine-800 font-semibold">
                  {money(subPrompt.gen.price)} <span className="text-inksoft line-through font-normal">{money(subPrompt.brand.price)}</span>
                  <span className="ms-1.5 text-[10px] font-bold text-pine-700">save {money(subPrompt.brand.price - subPrompt.gen.price)}/unit</span>
                </p>
              </div>
              <button onClick={() => setSubPrompt(null)} className="p-1 rounded text-inksoft hover:text-brick-700 transition shrink-0" aria-label="Dismiss">
                <IX size={12} />
              </button>
            </div>
            <div className="mt-2.5 flex gap-1.5">
              <button onClick={acceptGeneric}
                className="flex-1 py-1.5 rounded-md bg-pine-700 text-pine-50 text-[11px] font-bold hover:bg-pine-600 transition active:scale-[0.97]">
                Dispense generic
              </button>
              <select value={dawChoice} onChange={(e) => setDawChoice(Number(e.target.value))}
                className="px-1.5 rounded-md border border-pine-300 bg-card text-[10px] font-bold text-ink focus:outline-none"
                aria-label="Dispense-as-written reason">
                <option value={1}>DAW-1</option>
                <option value={2}>DAW-2</option>
              </select>
              <button onClick={keepBrand}
                className="flex-1 py-1.5 rounded-md border border-pine-300 bg-card text-pine-800 text-[11px] font-bold hover:bg-pine-50 transition active:scale-[0.97]">
                Keep brand
              </button>
            </div>
            <p className="mt-1.5 text-[9px] text-pine-700">DAW-1 prescriber directed · DAW-2 patient requested brand — recorded on the receipt</p>
          </div>
        )}

        {state.held.length > 0 && (
          <div className="px-4 py-2.5 bg-honey-100/60 border-b border-honey-300/50">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-honey-700 mb-1.5">Parked sales · {state.held.length}</p>
            <div className="flex flex-wrap gap-1.5">
              {state.held.map((h) => (
                <span key={h.id} className="group inline-flex items-center gap-1 bg-card border border-honey-300/70 rounded-md ps-2 pe-1 py-1 text-[11px] font-semibold text-ink">
                  <button onClick={() => dispatch({ type: "RECALL_HELD", id: h.id })}
                    className="flex items-center gap-1 hover:text-pine-700 transition" title={`Recall ${h.label} (${relTime(h.at)})`}>
                    <IRecall size={11} /> {h.label} · {h.items.reduce((s, i) => s + i.qty, 0)}
                  </button>
                  {h.expiresAt != null && (
                    <span className="num text-[10px] text-honey-700 ms-0.5" title={t("pos.layawayExpires")}>
                      · {daysUntil(new Date(h.expiresAt).toISOString()) > 0 ? `${daysUntil(new Date(h.expiresAt).toISOString())}d` : t("pos.expired")}
                    </span>
                  )}
                  <button onClick={() => dispatch({ type: "DROP_HELD", id: h.id })}
                    className="p-0.5 rounded text-inksoft opacity-50 hover:opacity-100 hover:text-brick-700 transition" aria-label={`Drop ${h.label}`}>
                    <IX size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="max-h-[320px] lg:max-h-none lg:flex-1 overflow-y-auto scroll-slim px-4 py-3 space-y-2">
          {cartLines.length === 0 && (
            <Empty icon={<ICart size={22} />} title={t("pos.cartEmpty")}
              hint={t("pos.cartHint")} />
          )}
          {cartLines.map(({ line, p }) => (
            <div key={`${p.id}-${line.uom ?? ""}-${line.qty}`} className="anim-fade-up group bg-paper border border-mist rounded-lg p-2.5 hover:border-pine-300 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink leading-tight truncate">{p.name}</p>
                  <p className="text-[11px] text-inksoft truncate">
                    {p.form} ·{" "}
                    {(() => {
                      const up = unitPrice(state, p.id, line.uom);
                      const uomLabel = p.uoms?.find((u) => u.code === line.uom)?.label;
                      return up !== p.price ? (<><span className="num text-brick-700 font-semibold">{money(up)}</span> <span className="num line-through">{money(p.price)}</span>{uomLabel ? ` / ${uomLabel}` : " ea"}</>) : (<>{money(p.price)}{uomLabel ? ` / ${uomLabel}` : " ea"}</>);
                    })()}
                  </p>
                </div>
                <span className="num text-[13px] font-bold text-ink shrink-0 flex items-center gap-1.5">
                  {interactingIds.has(p.id) && (
                    <span className="num text-[9px] font-bold px-1.5 py-0.5 rounded bg-brick-100 border border-brick-300/60 text-brick-700 flex items-center gap-0.5"
                      title={t("pos.interactionWarning")}>
                      <IAlert size={9} /> interact
                    </span>
                  )}
                  {!p.rx && bulkPct(line.qty) > 0 && (
                    <span className="num text-[9px] font-bold px-1.5 py-0.5 rounded bg-honey-100 border border-honey-300/60 text-honey-700">
                      bulk −{bulkPct(line.qty)}%
                    </span>
                  )}
                  {money((line.priceOverride ?? unitPrice(state, p.id, line.uom)) * line.qty)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1">
                  <QtyBtn onClick={() => dispatch({ type: "SET_QTY", productId: p.id, qty: line.qty - 1, uom: line.uom })} label={t("pos.decrease")}><IMinus size={12} /></QtyBtn>
                  <span className="num w-8 text-center text-sm font-bold text-ink">{line.qty}</span>
                  <QtyBtn onClick={() => dispatch({ type: "ADD_CART", productId: p.id, uom: line.uom })} label={t("pos.increase")} disabled={line.qty >= Math.max(1, Math.floor(stockOf(p) / uomFactor(state, p.id, line.uom)))}><IPlus size={12} /></QtyBtn>
                  {line.qty >= Math.max(1, Math.floor(stockOf(p) / uomFactor(state, p.id, line.uom))) && <Badge tone="honey">max</Badge>}
                  {p.rx && <Badge tone="brick">℞</Badge>}
                  {p.controlled && <span className="px-1.5 py-0.5 rounded bg-ink text-paper text-[9px] font-bold tracking-wide">{p.controlled}</span>}
                  {p.restricted && <span className="px-1.5 py-0.5 rounded bg-honey-500 text-pine-950 text-[9px] font-bold tracking-wide">BTC</span>}
                  {line.daw && <span className="px-1.5 py-0.5 rounded bg-brick-100 border border-brick-300/60 text-brick-700 text-[9px] font-bold">DAW-{line.daw}</span>}
                  {line.substitutedFrom && <span className="px-1.5 py-0.5 rounded bg-pine-100 border border-pine-300/60 text-pine-700 text-[9px] font-bold" title={`Generic substitution for ${state.products.find((x) => x.id === line.substitutedFrom)?.brand ?? ""}`}>↪ gen</span>}
                  {p.coldChain && <span className="px-1.5 py-0.5 rounded bg-sky-100 border border-sky-300/60 text-sky-800 text-[9px] font-bold tracking-wide" title="Cold chain — 2–8 °C"><ICold size={9} /> ❄</span>}
                  {p.uoms && p.uoms.length > 0 && (
                    <select value={line.uom ?? ""} onChange={(e) => dispatch({ type: "SET_LINE_UOM", productId: p.id, uom: e.target.value || undefined })}
                      className="px-1.5 py-0.5 rounded-md border border-mist bg-card text-[10px] font-bold text-ink focus:border-pine-500 focus:outline-none cursor-pointer"
                      title="Sell in a pack — stock converts to base units"
                      aria-label={`Unit of measure for ${p.name}`}>
                      <option value="">{t("supply.uomBaseUnit")}</option>
                      {p.uoms.map((u) => (
                        <option key={u.code} value={u.code}>{u.label} · ×{u.factor}</option>
                      ))}
                    </select>
                  )}
                </div>
                <button onClick={() => dispatch({ type: "REMOVE_LINE", productId: p.id, uom: line.uom })}
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
              {discFor === p.id ? (
                <div className="anim-fade-up mt-1.5 flex items-center gap-1.5">
                  <div className="flex rounded-md overflow-hidden border border-pine-300">
                    <button onClick={() => setDiscMode("pct")}
                      className={cx("px-2 py-1 text-[10px] font-bold transition", discMode === "pct" ? "bg-pine-700 text-pine-50" : "bg-card text-inksoft hover:bg-mist")}>%</button>
                    <button onClick={() => setDiscMode("amt")}
                      className={cx("px-2 py-1 text-[10px] font-bold transition", discMode === "amt" ? "bg-pine-700 text-pine-50" : "bg-card text-inksoft hover:bg-mist")}>$</button>
                  </div>
                  <input autoFocus value={discVal} onChange={(e) => setDiscVal(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder={discMode === "pct" ? "10" : "5.00"} inputMode="decimal"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { applyLineDiscount(p.id, line.uom); }
                      if (e.key === "Escape") setDiscFor(null);
                    }}
                    onBlur={() => applyLineDiscount(p.id, line.uom)}
                    className="num flex-1 min-w-0 text-[11px] px-2 py-1.5 rounded-md border border-pine-300 bg-card text-ink focus:outline-none focus:border-pine-500 focus:ring-2 focus:ring-pine-200 transition" />
                </div>
              ) : line.lineDiscount ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-brick-700 bg-brick-100/70 border border-brick-300/50 rounded-md px-2 py-1 num">
                  <ITag size={9} className="shrink-0" />
                  <span>discount −{money(lineDiscountValue(line.priceOverride ?? unitPrice(state, p.id, line.uom), line.qty, line.lineDiscount))}</span>
                  <button onClick={() => dispatch({ type: "SET_LINE_DISCOUNT", productId: p.id, uom: line.uom })}
                    className="ml-auto shrink-0 p-0.5 rounded text-inksoft hover:text-brick-700 transition" aria-label="Remove line discount">
                    <IX size={9} />
                  </button>
                </p>
              ) : (
                <button onClick={() => { setDiscFor(p.id); setDiscVal(""); setDiscMode("pct"); }}
                  className="mt-1.5 mr-3 flex items-center gap-1 text-[10px] font-semibold text-inksoft/60 hover:text-brick-700 opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <ITag size={9} /> Line discount
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-mist px-4 py-4 bg-card">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-inksoft"><span>Subtotal</span><span className="num">{money(subtotal)}</span></div>
            {totals.lineDiscounts > 0 && (
              <div className="flex justify-between text-brick-700 font-semibold anim-fade-up"><span>Line discounts</span><span className="num">−{money(totals.lineDiscounts)}</span></div>
            )}
            {totals.bulkSavings > 0 && (
              <div className="flex justify-between text-honey-700 font-semibold anim-fade-up"><span>Bulk-tier savings</span><span className="num">−{money(totals.bulkSavings)}</span></div>
            )}
            {totals.loyaltyDeduct > 0 && (
              <div className="flex justify-between text-pine-700 font-semibold anim-fade-up"><span>Points · {state.redeemPoints} pts</span><span className="num">−{money(totals.loyaltyDeduct)}</span></div>
            )}
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
              onClick={onPrintToDevice}
              disabled={state.cart.length === 0}
              title={t("pos.printDeviceHint")}
              className={cx("px-3 py-3 rounded-lg border font-display font-semibold text-sm flex items-center gap-1.5 transition-all",
                state.cart.length ? "border-mist text-ink hover:border-pine-400 hover:bg-pine-50 active:scale-[0.97]" : "border-mist text-inksoft/50 cursor-not-allowed")}>
              <IPrint size={14} /> Print
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

function QuickPicks({ items, onAdd, colorOf }: { items: { p: Product; sold: number }[]; onAdd: (id: string) => void; colorOf: (cat: string) => string }) {
  return (
    <div className="mb-4 anim-fade-up">
      <div className="flex items-center gap-1.5 mb-2">
        <ISparkIcon size={13} className="text-honey-700" />
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft">Fast movers · top sellers</p>
      </div>
      <div className="flex gap-2 overflow-x-auto scroll-slim pb-1">
        {items.map(({ p, sold }) => (
          <button key={p.id} onClick={() => onAdd(p.id)}
            className="group shrink-0 w-[172px] text-start bg-pine-50/60 border border-pine-200/70 rounded-xl p-2.5 hover:border-pine-400 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.97] transition-all duration-200">
            <div className="flex items-center justify-between gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: colorOf(p.category) }} />
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
  const { t } = useTranslation();
  const { state, dispatch, product } = usePos();
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
        <span className="flex-1 text-start min-w-0">
          <span className={cx("block text-xs font-bold truncate", customer ? "text-honey-800" : "text-inksoft")}>
            {customer ? customer.name : t("pos.walkIn")}
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

      {customer?.allergies && customer.allergies.length > 0 && (
        <div className="mt-2 anim-fade-up rounded-lg border border-brick-300/70 bg-brick-100/50 px-2.5 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-brick-700 flex items-center gap-1">
            <IAlert size={10} /> Allergies: {customer.allergies.join(", ")}
          </p>
          {(() => {
            const hits = state.cart
              .map((c) => ({ c, p: product(c.productId) }))
              .flatMap(({ c, p }) => allergyConflicts(customer.allergies, p).map((x) => ({ line: p!.name, ...x })));
            return hits.length > 0 ? (
              <p className="mt-1 text-[10px] font-bold text-brick-700 leading-snug">
                ⚠ Cart conflict — {hits.map((h) => `${h.line} (${h.allergen})`).join(", ")}
              </p>
            ) : (
              <p className="mt-0.5 text-[9px] text-brick-700/70">No conflict with current basket.</p>
            );
          })()}
        </div>
      )}

      {open && !customer && (
        <div className="anim-pop absolute left-4 right-4 top-full mt-1.5 z-30 bg-card border border-mist rounded-xl shadow-pop p-2.5">
          <div className="relative">
            <ISearch size={12} className="absolute start-2.5 inset-y-0 flex items-center text-inksoft" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pos.searchCustomer")}
              className="w-full ps-7.5 ps-8 pe-2 py-1.5 rounded-md border border-mist text-xs focus:border-pine-500 focus:outline-none transition" />
          </div>
          <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto scroll-slim">
            {matches.map((c) => (
              <button key={c.id} onClick={() => attach(c.id)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-pine-50 transition text-start">
                <span className="text-xs font-semibold text-ink truncate">{c.name}</span>
                <span className="num text-[10px] text-inksoft shrink-0 ms-2">{c.phone} · {c.points} pts</span>
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
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("pos.customerName")}
                  className="w-full px-2 py-1.5 rounded-md border border-mist text-xs focus:border-pine-500 focus:outline-none transition" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("pos.phone")}
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

function ProductCard({ p, hl = [], flashing, flashKey, onAdd, colorOf }: {
  p: Product; hl?: number[]; flashing: boolean; flashKey: number; onAdd: () => void; colorOf: (cat: string) => string;
}) {
  const { t } = useTranslation();
  const near = nearestExpiry(p);
  const d = near ? daysUntil(near) : 9999;
  const avail = stockOf(p);
  const out = avail <= 0;
  const low = !out && avail <= p.reorderLevel;
  return (
    <button onClick={onAdd} disabled={out}
      className={cx(
        "group relative text-start bg-card border border-mist rounded-xl p-3.5 transition-all duration-200 overflow-hidden",
        out ? "opacity-45 cursor-not-allowed" : "hover:border-pine-400 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98]",
      )}>
      {flashing && <span key={flashKey} className="anim-pop absolute inset-0 rounded-xl ring-2 ring-pine-500 pointer-events-none" />}
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-inksoft">
          <span className="w-2 h-2 rounded-full" style={{ background: colorOf(p.category) }} />
          {p.brand}
        </span>
        <span className="flex items-center gap-1">
          {p.rx && <Badge tone="brick">℞</Badge>}
          {p.genericOf && <span className="px-1.5 py-0.5 rounded bg-pine-600 text-pine-50 text-[9px] font-bold tracking-wide">GEN</span>}
          {p.controlled && <span className="px-1.5 py-0.5 rounded bg-ink text-paper text-[9px] font-bold tracking-wide">{p.controlled}</span>}
          {p.restricted && <span className="px-1.5 py-0.5 rounded bg-honey-500 text-pine-950 text-[9px] font-bold tracking-wide">BTC</span>}
        </span>
      </div>
      <p className="mt-1.5 font-display font-semibold text-[14px] text-ink leading-snug line-clamp-2 min-h-[2.5em]">
        <Highlight text={p.name} idx={hl} />
      </p>
      <p className="text-[11px] text-inksoft truncate">{p.generic}</p>
      <p className="text-[11px] text-inksoft/80 mt-0.5 truncate">{p.form}</p>

      <div className="mt-2.5 pt-2.5 border-t border-dashed border-mist flex items-end justify-between">
        <div>
          {(() => {
            const lot = fefoBatches(p)[0];
            const lotPriced = lot?.price !== undefined && lot.price !== p.price;
            return lotPriced ? (
              <p className="leading-none">
                <span className="num text-[16px] font-bold text-brick-700">{money(lot!.price!)}</span>
                <span className="num text-[11px] text-inksoft line-through ms-1.5">{money(p.price)}</span>
                <span className="ms-1.5 align-middle px-1 py-0.5 rounded bg-brick-100 border border-brick-300/50 text-[8px] font-bold tracking-wide text-brick-700">LOT SALE</span>
              </p>
            ) : (
              <p className="num text-[16px] font-bold text-ink leading-none">{money(p.price)}</p>
            );
          })()}
          <p className={cx("mt-1 text-[10px] font-semibold flex items-center gap-1",
            out ? "text-brick-700" : low ? "text-honey-700" : "text-pine-600")}>
            <span className={cx("w-1.5 h-1.5 rounded-full", (low || out) && "anim-pulse-dot")}
              style={{ background: out ? "#c24a2e" : low ? "#e0a63c" : "#3b8668" }} />
            {out ? t("pos.outOfStock") : t("pos.available", { count: avail })}
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

/* ================================================================== */
/*  Phase G — AI second-pass interaction check (advisory only)        */
/* ================================================================== */

interface AiConflict {
  product_id?: string;
  mechanism?: string;
  severity?: string;
  recommendation?: string;
}

/** LLM cross-check of the basket against the patient's allergy list as a
 *  SECOND pass over the curated Phase C checker. Surfaces novel conflicts in a
 *  review dialog for the pharmacist; NEVER blocks checkout. Degrades to an
 *  inline note when the function is unreachable. */
function AiSecondPass({ meds, allergies, patientName }: {
  meds: Array<{ productId: string; name: string; generic: string; qty: number }>;
  allergies: string[];
  patientName: string;
}) {
  const { t } = useTranslation();
  const { dispatch, state } = usePos();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [conflicts, setConflicts] = useState<AiConflict[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  /* re-run whenever the cart contents change */
  const cartKey = meds.map((m) => `${m.productId}:${m.qty}`).join("|");
  useEffect(() => {
    setConflicts(null);
    setFailed(false);
    setDialogOpen(false);
  }, [cartKey]);

  const run = async () => {
    if (busy || meds.length === 0) return;
    setBusy(true);
    setFailed(false);
    try {
      const { system, user } = cartToInteractionPrompt({ cart: meds, allergies, patientName });
      const res = await aiClassify(system, user);
      const parsed = parseClassifyJson(res?.text ?? "") as { conflicts?: AiConflict[]; overall?: string } | null;
      const found = Array.isArray(parsed?.conflicts) ? parsed!.conflicts! : [];
      setConflicts(found);
      if (found.length > 0) {
        dispatch({
          type: "AUDIT_LOG",
          kind: "rx",
          detail: `AI second pass flagged ${found.length} novel conflict${found.length === 1 ? "" : "s"} on the basket — pharmacist review opened`,
        });
      }
    } catch {
      setFailed(true);
      dispatch({ type: "TOAST", kind: "info", msg: t("ai.assistFailed") });
    } finally {
      setBusy(false);
    }
  };

  const hasResult = conflicts !== null;
  const count = conflicts?.length ?? 0;

  return (
    <div className="px-4 pt-2">
      {!hasResult && (
        <button onClick={run} disabled={busy}
          className={cx("w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-dashed text-[11px] font-bold transition active:scale-[0.98]",
            failed ? "border-mist bg-card text-inksoft/70" : "border-pine-300 bg-pine-50/50 text-pine-700 hover:bg-pine-100",
            busy && "opacity-60 cursor-wait")}>
          <ISparkIcon size={11} /> {busy ? t("ai.assistRunning") : failed ? `${t("ai.assistButton")} · retry` : t("ai.assistButton")}
        </button>
      )}
      {hasResult && count === 0 && (
        <p className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-pine-200 bg-pine-100/60 text-[10px] font-semibold text-pine-700">
          <ICheck size={10} /> {t("ai.assistClean")}
        </p>
      )}
      {hasResult && count > 0 && (
        <button onClick={() => setDialogOpen(true)}
          className="w-full mt-0.5 flex items-center gap-2 px-2.5 py-2 rounded-md border-2 border-honey-500 bg-honey-100/70 hover:bg-honey-100 transition text-start">
          <IAlert size={13} className="text-honey-700 shrink-0 anim-pulse-dot" />
          <span className="min-w-0">
            <span className="block text-[11px] font-bold text-honey-800">{t("ai.assistConflicts")} · {count}</span>
            <span className="block text-[9px] font-semibold text-honey-700 truncate">{t("pos.interactionWarning")}</span>
          </span>
          <IChevD size={12} className="-rotate-90 text-honey-700 shrink-0" />
        </button>
      )}

      {dialogOpen && conflicts && (
        <Modal onClose={() => setDialogOpen(false)} width={520} labelledBy="ai-sp-title">
          <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
            <div>
              <h2 id="ai-sp-title" className="font-display font-bold text-ink flex items-center gap-2">
                <ISparkIcon size={16} className="text-pine-700" /> {t("ai.assistTitle")}
              </h2>
              <p className="text-xs text-inksoft mt-0.5">{t("ai.assistHint")}</p>
            </div>
            <button onClick={() => setDialogOpen(false)} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label={t("common.close")}><IX size={14} /></button>
          </div>
          <div className="p-5 space-y-3 max-h-[56vh] overflow-y-auto scroll-slim">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brick-700 flex items-center gap-1.5">
              <IAlert size={10} /> {t("ai.assistConflicts")} — {patientName || "walk-in"}
            </p>
            {conflicts.map((c, i) => (
              <div key={i} className="rounded-lg border border-honey-300/70 bg-honey-100/40 px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-ink truncate">{state.products.find((p) => p.id === c.product_id)?.name ?? c.product_id ?? "—"}</p>
                  {c.severity && (
                    <span className="num shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-honey-500 text-pine-950">
                      {c.severity}
                    </span>
                  )}
                </div>
                {c.mechanism && <p className="text-[11px] text-inksoft leading-snug"><span className="font-bold text-ink">{t("ai.assistMechanism")}:</span> {c.mechanism}</p>}
                {c.recommendation && <p className="text-[11px] text-pine-800 leading-snug"><span className="font-bold">{t("ai.assistRecommendation")}:</span> {c.recommendation}</p>}
              </div>
            ))}
            <p className="text-[10px] text-inksoft leading-snug border-t border-mist pt-2.5">
              AI output is advisory only — the curated interaction database still governs checkout. Document any override in the audit trail.
            </p>
          </div>
          <div className="px-5 py-4 border-t border-mist flex justify-end">
            <button onClick={() => setDialogOpen(false)}
              className="px-4 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95">
              {t("ai.assistDismiss")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
