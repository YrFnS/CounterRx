import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePos, money, clockTime } from "../store";
import { daysUntil, nearestExpiry, stockOf, fefoBatches, catLabel } from "../data";
import type { Customer } from "../data";
import { aiAnomaly } from "../lib/ai";
import type { Anomaly } from "../lib/ai";
import { buildAnomalySummary, type AnomalySummary } from "../lib/ai-ui";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { Stat, cx } from "../ui";
import { ISpark, IRefresh } from "../icons";
import {
  ICash, ICart, ITrendUp, ITrendDown, IAlert, IBox, IRx, IPill, IChevD, IFlask, IUsers, IStar,
} from "../icons";

const DAY = 86_400_000;

export default function Dashboard() {
  const { t } = useTranslation();
  const { state, dispatch, lowStock, expiring, newRx, todayStats } = usePos();
  const [range, setRange] = useState<7 | 30>(7);

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const t0 = dayStart.getTime();

  const [hover, setHover] = useState<number | null>(null);

  const week = useMemo(() => {
    const days: { label: string; date: string; total: number; count: number; units: number }[] = [];
    for (let d = range - 1; d >= 0; d--) {
      const start = t0 - d * DAY;
      const txs = state.transactions.filter((t) => t.at >= start && t.at < start + DAY);
      const sales = txs.filter((t) => !t.refundOf);
      days.push({
        label: new Date(start).toLocaleDateString("en-US", { weekday: "short" }),
        date: new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        total: txs.reduce((s, t) => s + t.total, 0),
        count: sales.length,
        units: sales.reduce((s, t) => s + t.lines.reduce((x, l) => x + l.qty, 0), 0),
      });
    }
    return days;
  }, [state.transactions, t0, range]);

  const yesterday = state.transactions.filter((t) => t.at >= t0 - DAY && t.at < t0);
  const yRevenue = yesterday.reduce((s, t) => s + t.total, 0);
  const delta = yRevenue > 0 ? ((todayStats.revenue - yRevenue) / yRevenue) * 100 : 0;
  const maxDay = Math.max(...week.map((w) => w.total), 1);

  const topSellers = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; revenue: number; cat: string }>();
    state.transactions.filter((t) => t.at >= t0 - (range - 1) * DAY && !t.refundOf).forEach((t) =>
      t.lines.forEach((l) => {
        const cur = agg.get(l.productId) ?? { name: l.name, qty: 0, revenue: 0, cat: "" };
        const prod = state.products.find((p) => p.id === l.productId);
        agg.set(l.productId, { ...cur, qty: cur.qty + l.qty, revenue: cur.revenue + l.qty * l.price, cat: prod?.category ?? "" });
      }));
    return [...agg.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);
  }, [state.transactions, state.products, t0, range]);

  const maxQty = Math.max(...topSellers.map((t) => t.qty), 1);
  const recent = state.transactions.slice(0, 7);

  /* W2.1 roll-up — revenue per top-level category over the selected range.
   * Child-category sales walk up to their root parent so totals nest cleanly. */
  const catBreakdown = useMemo(() => {
    const cats = state.categories ?? [];
    const rootOf = (id: string): string => {
      let cur = id;
      for (let guard = 0; guard < 3; guard++) {
        const parent = cats.find((x) => x.id === cur)?.parentId;
        if (!parent) break;
        cur = parent;
      }
      return cur;
    };
    const m = new Map<string, number>();
    for (const tr of state.transactions) {
      if (tr.refundOf || tr.at < t0 - (range - 1) * DAY) continue;
      for (const l of tr.lines) {
        const c = state.products.find((p) => p.id === l.productId)?.category;
        if (!c) continue;
        const root = rootOf(c);
        m.set(root, (m.get(root) ?? 0) + l.qty * l.price);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [state.transactions, state.products, state.categories, t0, range]);
  const maxCatRevenue = Math.max(...catBreakdown.map(([, r]) => r), 1);

  /* inventory trends (4.2) — 14-day sell-through burn vs shelf stock */
  const burn = useMemo(() => {
    const DAYS = 14;
    const per = new Map<string, number[]>();
    for (const t of state.transactions) {
      if (t.refundOf) continue;
      const age = Math.floor((t0 + DAY - t.at) / DAY);
      if (age < 0 || age >= DAYS) continue;
      const idx = DAYS - 1 - age;
      for (const l of t.lines) {
        const arr = per.get(l.productId) ?? Array.from({ length: DAYS }, () => 0);
        arr[idx] += l.qty;
        per.set(l.productId, arr);
      }
    }
    return [...per.entries()]
      .map(([id, arr]) => {
        const p = state.products.find((x) => x.id === id);
        if (!p) return null;
        const total = arr.reduce((s, n) => s + n, 0);
        const perDay = total / DAYS;
        const stock = stockOf(p);
        return { p, arr, total, perDay, daysLeft: perDay > 0 ? Math.floor(stock / perDay) : null };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [state.transactions, state.products, t0]);
  const maxSpark = Math.max(...burn.flatMap((b) => b.arr), 1);

  /* customer insights (4.3) */
  const custStats = useMemo(() => {
    const now = Date.now();
    const spendBy = new Map<string, number>();
    for (const t of state.transactions) {
      if (!t.customerId || t.refundOf) continue;
      spendBy.set(t.customerId, (spendBy.get(t.customerId) ?? 0) + t.total);
    }
    const top = [...spendBy.entries()]
      .map(([id, spend]) => ({ c: state.customers.find((x) => x.id === id), spend }))
      .filter((x): x is { c: Customer; spend: number } => Boolean(x.c))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 4);
    const newThisWeek = state.customers.filter((c) => now - c.createdAt < 7 * DAY).length;
    const totalPoints = state.customers.reduce((s, c) => s + c.points, 0);
    const regulars = state.customers.filter((c) => {
      const v = state.transactions.filter((t) => t.customerId === c.id && !t.refundOf).length;
      return v >= 3;
    }).length;
    return { top, newThisWeek, totalPoints, regulars, maxSpend: Math.max(...top.map((t) => t.spend), 1) };
  }, [state.customers, state.transactions]);

  const Delta = ({ v }: { v: number }) => (
    <span className={cx("inline-flex items-center gap-1 font-bold num text-[11px]", v >= 0 ? "text-pine-600" : "text-brick-700")}>
      {v >= 0 ? <ITrendUp size={12} /> : <ITrendDown size={12} />}
      {v >= 0 ? "+" : ""}{v.toFixed(1)}% vs yesterday
    </span>
  );

  return (
    <div className="h-full overflow-y-auto scroll-slim px-3 sm:px-6 py-4 sm:py-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
        <Stat label={t("dashboard.salesToday")} value={money(todayStats.revenue)}
          icon={<ICash size={15} />} accent="#0f4437" sub={<Delta v={delta} />} />
        <Stat label={t("dashboard.transactions")} value={todayStats.count}
          icon={<ICart size={15} />} accent="#3b8668" sub={<span>{yesterday.length} yesterday · avg basket <span className="num font-bold">{money(todayStats.avg)}</span></span>} />
        <Stat label={t("dashboard.unitsSold")} value={todayStats.items}
          icon={<IPill size={15} />} accent="#5da184" sub={<span>across {new Set(state.transactions.filter((t) => t.at >= t0).flatMap((t) => t.lines.map((l) => l.productId))).size} products</span>} />
        <Stat label={t("dashboard.openAlerts")} value={lowStock.length + expiring.length + newRx}
          icon={<IAlert size={15} />} accent="#c24a2e"
          sub={<span><span className="font-bold text-honey-700">{lowStock.length}</span> low · <span className="font-bold text-brick-700">{expiring.length}</span> expiring · <span className="font-bold">{newRx}</span> ℞ queue</span>} />
      </div>

      <div className="mt-4 grid xl:grid-cols-3 gap-3.5">
        {/* revenue chart */}
        <div className="xl:col-span-2 bg-card border border-mist rounded-xl shadow-lift p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="font-display font-bold text-ink text-[15px]">Revenue · last {range} days</h2>
              <p className="text-xs text-inksoft mt-0.5">
                Period total <span className="num font-bold text-pine-800">{money(week.reduce((s, w) => s + w.total, 0))}</span>
                {" "}· best day {week.reduce((a, b) => (b.total > a.total ? b : a)).label}
              </p>
            </div>
            <div className="flex rounded-lg border border-mist overflow-hidden shrink-0">
              {([7, 30] as const).map((r) => (
                <button key={r} onClick={() => setRange(r)}
                  className={cx("num px-2.5 py-1.5 text-[11px] font-bold transition-all duration-200",
                    range === r ? "bg-pine-800 text-pine-50" : "bg-card text-inksoft hover:text-ink hover:bg-pine-50")}>
                  {r}d
                </button>
              ))}
            </div>
          </div>
          <div className={cx("mt-5 flex items-end h-44", range === 7 ? "gap-3" : "gap-[3px]")}>
            {week.map((w, i) => {
              const h = Math.max(6, (w.total / maxDay) * 100);
              const isToday = i === week.length - 1;
              const active = hover === i;
              return (
                <div key={i}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                  className="relative flex-1 flex flex-col items-center gap-1.5 group">
                  {active && (
                    <div className="anim-pop absolute bottom-[calc(100%-6px)] left-1/2 -translate-x-1/2 z-20 whitespace-nowrap pointer-events-none">
                      <div className="bg-pine-950 text-pine-50 rounded-lg px-3 py-2 shadow-lift text-start">
                        <p className="text-[11px] font-bold">{w.label}, {w.date}{isToday && <span className="text-pine-300"> · today</span>}</p>
                        <p className="num text-[13px] font-bold text-honey-300">{money(w.total)}</p>
                        <p className="text-[10px] text-pine-200 num">{w.units} units · {w.count} sale{w.count === 1 ? "" : "s"}</p>
                      </div>
                      <span className="block w-2 h-2 bg-pine-950 rotate-45 mx-auto -mt-1" />
                    </div>
                  )}
                  <span className={cx("num text-[10px] font-bold transition-opacity", isToday ? "text-pine-800" : "text-inksoft opacity-0 group-hover:opacity-100")}>
                    {money(w.total).replace(".00", "")}
                  </span>
                  <div className="w-full flex justify-center">
                    <div className={cx("anim-bar w-full rounded-t-md transition-all duration-200 cursor-pointer", range === 7 ? "max-w-[46px]" : "max-w-[16px] rounded-t-[3px]")}
                      style={{
                        height: `${(h / 100) * 132}px`, animationDelay: `${i * 60}ms`,
                        transform: active ? "scaleX(1.08)" : undefined,
                        background: isToday
                          ? "linear-gradient(180deg,#256b54,#0f4437)"
                          : active
                            ? "linear-gradient(180deg,#5da184,#3b8668)"
                            : "linear-gradient(180deg,#8fbfa9,#5da184)",
                      }} />
                  </div>
                  <span className={cx("text-[10px] font-semibold h-3.5 leading-none",
                    range === 30 && !isToday && !active && (week.length - 1 - i) % 5 !== 0 ? "opacity-0" : "",
                    isToday || active ? "text-pine-800" : "text-inksoft")}>
                    {range === 7 ? w.label : w.date.replace(/^([A-Za-z]+) /, "")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* alert feed */}
        <div className="bg-card border border-mist rounded-xl shadow-lift p-5 flex flex-col">
          <h2 className="font-display font-bold text-ink text-[15px]">Needs attention</h2>
          <div className="mt-3 space-y-2 flex-1 overflow-y-auto scroll-slim pe-1">
            {expiring.slice(0, 4).map((p) => {
              const e = nearestExpiry(p)!;
              const d = daysUntil(e);
              return (
                <button key={p.id} onClick={() => dispatch({ type: "GO", view: "inventory", invPreset: "expiring" })}
                  className="w-full text-start flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-brick-100/50 border border-brick-300/40 hover:border-brick-500/60 transition group">
                  <IAlert size={14} className="text-brick-700 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold text-ink truncate">{p.name}</span>
                    <span className="block text-[10px] text-brick-700 font-bold">
                      {d <= 0 ? "EXPIRED — pull from shelf" : `expires in ${d}d`} · lot {fefoBatches(p)[0]?.batch}
                    </span>
                  </span>
                  <IChevD size={12} className="-rotate-90 text-brick-700 opacity-0 group-hover:opacity-100 transition" />
                </button>
              );
            })}
            {lowStock.slice(0, 4).map((p) => (
              <button key={`low-${p.id}`} onClick={() => dispatch({ type: "GO", view: "inventory", invPreset: "low" })}
                className="w-full text-start flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-honey-100/60 border border-honey-300/50 hover:border-honey-500/70 transition group">
                <IBox size={14} className="text-honey-700 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-ink truncate">{p.name}</span>
                  <span className="block text-[10px] text-honey-700 font-bold">only {stockOf(p)} left · reorder at {p.reorderLevel}</span>
                </span>
                <IChevD size={12} className="-rotate-90 text-honey-700 opacity-0 group-hover:opacity-100 transition" />
              </button>
            ))}
            {newRx > 0 && (
              <button onClick={() => dispatch({ type: "GO", view: "prescriptions" })}
                className="w-full text-start flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-pine-100/70 border border-pine-200 hover:border-pine-400 transition group">
                <IRx size={14} className="text-pine-700 shrink-0" />
                <span className="flex-1">
                  <span className="block text-xs font-semibold text-ink">{newRx} prescription{newRx === 1 ? "" : "s"} in review</span>
                  <span className="block text-[10px] text-pine-700 font-bold">pharmacist queue waiting</span>
                </span>
                <IChevD size={12} className="-rotate-90 text-pine-700 opacity-0 group-hover:opacity-100 transition" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid xl:grid-cols-3 gap-3.5 pb-6">
        {/* top sellers */}
        <div className="bg-card border border-mist rounded-xl shadow-lift p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-ink text-[15px]">Top movers · {range} days</h2>
            <IFlask size={15} className="text-pine-600" />
          </div>
          <div className="mt-4 space-y-3">
            {topSellers.map((t, i) => (
              <div key={t.name} className="flex items-center gap-3">
                <span className="num w-5 text-xs font-bold text-inksoft">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-ink truncate">{t.name}</span>
                    <span className="num text-inksoft shrink-0 ms-2">{t.qty} sold · {money(t.revenue)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-mist/60 overflow-hidden">
                    <div className="anim-grow-w h-full rounded-full"
                      style={{
                        width: `${(t.qty / maxQty) * 100}%`, animationDelay: `${i * 70}ms`,
                        background: state.categories?.find((c) => c.id === t.cat)?.color ?? "#3b8668",
                      }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* W2.1 — sales by category, children rolled up into their parent */}
        {catBreakdown.length > 0 && (
          <div className="bg-card border border-mist rounded-xl shadow-lift p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-ink text-[15px]">{t("dashboard.catBreakdown")} · {range}d</h2>
              <button onClick={() => dispatch({ type: "GO", view: "reports" })}
                className="text-xs font-bold text-pine-700 hover:text-pine-600 transition">{t("dashboard.catBreakdownAll")} →</button>
            </div>
            <div className="mt-4 space-y-3">
              {catBreakdown.map(([cid, revenue], i) => {
                const c = state.categories?.find((x) => x.id === cid);
                return (
                  <div key={cid}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-ink truncate">{c?.color && <span className="w-2 h-2 rounded-full inline-block me-1.5" style={{ background: c.color }} />}{catLabel(cid, state.categories)}</span>
                      <span className="num text-inksoft shrink-0 ms-2">{money(revenue)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-mist/60 overflow-hidden">
                      <div className="anim-grow-w h-full rounded-full" style={{ width: `${(revenue / maxCatRevenue) * 100}%`, animationDelay: `${i * 70}ms`, background: c?.color ?? "#3b8668" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* recent transactions */}
        <div className="bg-card border border-mist rounded-xl shadow-lift p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-ink text-[15px]">Latest from the till</h2>
            <button onClick={() => dispatch({ type: "GO", view: "history" })}
              className="text-xs font-bold text-pine-700 hover:text-pine-600 transition">Full history →</button>
          </div>
          <div className="mt-3 divide-y divide-mist/70">
            {recent.map((t) => (
              <button key={t.id} onClick={() => dispatch({ type: "OPEN_RECEIPT", tx: t })}
                className="w-full flex items-center gap-3 py-2 text-start hover:bg-pine-50/60 rounded-md px-1.5 -mx-1.5 transition group">
                <span className="num text-[11px] text-inksoft w-14 shrink-0">{clockTime(t.at)}</span>
                <span className="num text-[11px] font-bold text-ink w-16 shrink-0">{t.id}</span>
                <span className="flex-1 text-xs text-inksoft truncate">
                  {t.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                </span>
                <span className="num text-xs font-bold text-pine-800 shrink-0 group-hover:scale-105 transition-transform">{money(t.total)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* customer book insights (4.3) */}
        <div className="bg-card border border-mist rounded-xl shadow-lift p-5 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-ink text-[15px]">Customer book</h2>
            <button onClick={() => dispatch({ type: "GO", view: "customers" })}
              className="text-xs font-bold text-pine-700 hover:text-pine-600 transition">Open book →</button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-pine-100/70 border border-pine-200/60 px-2.5 py-2">
              <p className="num text-base font-bold text-pine-800 leading-none">{custStats.newThisWeek}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-pine-700 mt-1">New / 7d</p>
            </div>
            <div className="rounded-lg bg-mist/50 border border-mist px-2.5 py-2">
              <p className="num text-base font-bold text-ink leading-none">{custStats.regulars}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-inksoft mt-1">Regulars</p>
            </div>
            <div className="rounded-lg bg-honey-100/70 border border-honey-300/50 px-2.5 py-2">
              <p className="num text-base font-bold text-honey-700 leading-none flex items-center gap-1"><IStar size={11} className="text-honey-500" />{custStats.totalPoints}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-honey-700 mt-1">Pts live</p>
            </div>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mt-4 mb-2 flex items-center gap-1.5">
            <IUsers size={11} /> Top spenders · lifetime
          </p>
          <div className="space-y-2.5 flex-1">
            {custStats.top.map((t, i) => (
              <div key={t.c.id} className="flex items-center gap-2.5">
                <span className="grid place-items-center w-7 h-7 rounded-lg bg-pine-800 text-pine-100 font-display font-bold text-[10px] shrink-0">
                  {t.c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-semibold text-ink truncate">{t.c.name}</span>
                    <span className="num text-pine-800 font-bold shrink-0 ms-2">{money(t.spend)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-mist/60 overflow-hidden">
                    <div className="anim-grow-w h-full rounded-full bg-honey-500"
                      style={{ width: `${(t.spend / custStats.maxSpend) * 100}%`, animationDelay: `${i * 70}ms` }} />
                  </div>
                </div>
              </div>
            ))}
            {custStats.top.length === 0 && <p className="text-xs text-inksoft">No linked sales yet — attach customers at the register.</p>}
          </div>
        </div>

        {/* inventory trends — 14-day burn vs stock (4.2) */}
        <div className="bg-card border border-mist rounded-xl shadow-lift p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-ink text-[15px]">Stock burn · 14 days</h2>
            <button onClick={() => dispatch({ type: "GO", view: "inventory" })}
              className="text-xs font-bold text-pine-700 hover:text-pine-600 transition">Inventory →</button>
          </div>
          <p className="text-[10px] text-inksoft mt-0.5">Units/day sold vs. shelf — projected days to run-out</p>
          <div className="mt-3 space-y-2.5">
            {burn.map((b, i) => {
              const stock = stockOf(b.p);
              const danger = b.daysLeft !== null && b.daysLeft <= 7;
              const warn = !danger && b.daysLeft !== null && b.daysLeft <= 14;
              return (
                <div key={b.p.id} className="anim-fade-up flex items-center gap-2.5" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="w-32 min-w-0">
                    <p className="text-xs font-semibold text-ink truncate leading-tight">{b.p.name}</p>
                    <p className="num text-[10px] text-inksoft">{b.perDay.toFixed(1)}/day · {stock} on shelf</p>
                  </div>
                  <div className="flex-1 flex items-end gap-[3px] h-8">
                    {b.arr.map((n, j) => (
                      <div key={j} className="anim-grow-w flex-1 rounded-sm min-w-[3px]"
                        style={{
                          height: `${Math.max(8, (n / maxSpark) * 100)}%`,
                          animationDelay: `${i * 50 + j * 20}ms`,
                          background: j === b.arr.length - 1 ? "#0f4437" : n > 0 ? "#8fbfa9" : "#e4e6de",
                        }} />
                    ))}
                  </div>
                  <span className={cx("num text-[10px] font-bold px-2 py-1 rounded-md shrink-0 w-[74px] text-center",
                    danger ? "bg-brick-100 text-brick-700" : warn ? "bg-honey-100 text-honey-700" : "bg-pine-100 text-pine-700")}>
                    {b.daysLeft === null ? "no pull" : `≈ ${b.daysLeft}d left`}
                  </span>
                </div>
              );
            })}
            {burn.length === 0 && <p className="text-xs text-inksoft">No sales in the window yet.</p>}
          </div>
        </div>
      </div>

      {/* Phase G (P1): AI anomaly alerts — panel hides itself entirely on API failure */}
      <AiAlertsPanel range={range} t0={t0} />
    </div>
  );
}

/* ================================================================== */
/*  Phase G — AI anomaly alerts + usage readout                       */
/* ================================================================== */

const ANOMALY_LABEL: Record<string, string> = {
  unusual_returns: "ai.anomalyTypeUnusualReturns",
  dead_stock: "ai.anomalyTypeDeadStock",
  stock_sales_divergence: "ai.anomalyTypeStockSalesDivergence",
  other: "ai.anomalyTypeOther",
};

/** Build the compact summary the anomaly endpoint expects, from existing state. */
function AiAlertsPanel({ range, t0 }: { range: 7 | 30; t0: number }) {
  const { t } = useTranslation();
  const { state } = usePos();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [anomalies, setAnomalies] = useState<Anomaly[] | null>(null);

  /* optional AI usage readout: count of recent ai_log rows for this org (RLS-scoped).
     Cheap via the existing supabase client; silently absent when unconfigured or denied. */
  const [usageCount, setUsageCount] = useState<number | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    const since = new Date(Date.now() - 86_400_000).toISOString();
    void (async () => {
      try {
        const { count } = await supabase
          .from("ai_log")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since);
        if (alive && typeof count === "number") setUsageCount(count);
      } catch { /* readout is optional — stay hidden */ }
    })();
    return () => { alive = false; };
  }, []);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const DAY = 86_400_000;
      const start = t0 - (range - 1) * DAY;
      const window = state.transactions.filter((tx) => tx.at >= start);
      const sales = window.filter((tx) => !tx.refundOf);
      const returns = window.filter((tx) => tx.refundOf);

      const unitsByProduct = new Map<string, number>();
      for (const tx of sales) for (const l of tx.lines) {
        unitsByProduct.set(l.productId, (unitsByProduct.get(l.productId) ?? 0) + l.qty);
      }
      const topProducts = [...unitsByProduct.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .flatMap(([id, units]) => {
          const p = state.products.find((x) => x.id === id);
          return p ? [{ id, name: p.name, unitsSold: units, stock: stockOf(p), reorderLevel: p.reorderLevel }] : [];
        });

      const summary: AnomalySummary = {
        periodStart: start,
        periodEnd: Date.now(),
        totalSales: sales.reduce((s, tx) => s + tx.total, 0),
        totalReturns: returns.reduce((s, tx) => s + Math.abs(tx.total), 0),
        lowStockCount: state.products.filter((p) => stockOf(p) <= p.reorderLevel).length,
        topProducts,
        products: state.products.slice(0, 40).map((p) => ({
          id: p.id, name: p.name, stock: stockOf(p), reorderLevel: p.reorderLevel, category: p.category,
        })),
        recentReturns: returns.slice(0, 10).map((tx) => ({
          id: tx.id,
          product_id: tx.lines[0]?.productId ?? "",
          product_name: tx.lines[0]?.name ?? "",
          qty: tx.lines.reduce((s, l) => s + l.qty, 0),
          at: tx.at,
        })),
      };

      const res = await aiAnomaly(buildAnomalySummary(summary));
      setAnomalies(Array.isArray(res) ? res : []);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  /* auto-scan once on mount */
  useEffect(() => { void run(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  /* graceful degradation: API failure → panel renders nothing at all */
  if (failed && anomalies === null) return null;

  return (
    <div className="mt-4 bg-card border border-mist rounded-xl shadow-lift p-5 pb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-ink text-[15px] flex items-center gap-2">
            <ISpark size={15} className="text-pine-600" /> {t("ai.anomalyTitle")}
          </h2>
          <p className="text-[10px] text-inksoft mt-0.5">
            Unusual returns · dead stock · stock-vs-sales divergence over the last {range} days
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {usageCount !== null && (
            <span className="text-[10px] font-semibold text-inksoft num">{t("ai.usageLabel", { count: usageCount })}</span>
          )}
          <button onClick={run} disabled={busy}
            className={cx("flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition active:scale-95",
              busy ? "border-mist bg-mist/40 text-inksoft cursor-wait" : "border-pine-200 bg-pine-50 text-pine-700 hover:bg-pine-100")}>
            <IRefresh size={11} /> {busy ? t("ai.anomalyRunning") : t("ai.anomalyRefresh")}
          </button>
        </div>
      </div>

      {!busy && anomalies !== null && anomalies.length === 0 && (
        <p className="mt-3 text-xs text-inksoft">{t("ai.anomalyNone")}</p>
      )}

      {!busy && anomalies !== null && anomalies.length > 0 && (
        <div className="mt-3 grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {anomalies.map((a, i) => {
            const sev = (a.severity ?? "").toLowerCase();
            const tone = sev.includes("high") || sev.includes("major")
              ? { border: "border-brick-300/70", bg: "bg-brick-100/40", text: "text-brick-700" }
              : sev.includes("moderate") || sev.includes("medium")
                ? { border: "border-honey-300/60", bg: "bg-honey-100/40", text: "text-honey-700" }
                : { border: "border-mist", bg: "bg-paper/60", text: "text-inksoft" };
            return (
              <div key={i} className={cx("anim-fade-up rounded-lg border px-3 py-2.5", tone.border, tone.bg)}
                style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center justify-between gap-2">
                  <p className={cx("text-[10px] font-bold uppercase tracking-[0.12em]", tone.text)}>
                    {t(ANOMALY_LABEL[a.type] ?? ANOMALY_LABEL.other)}
                  </p>
                  {a.severity && <span className={cx("num text-[9px] font-bold uppercase", tone.text)}>{a.severity}</span>}
                </div>
                <p className="text-xs font-bold text-ink truncate mt-0.5">{a.entity}</p>
                <p className="text-[11px] text-inksoft leading-snug mt-0.5">{a.reason}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
