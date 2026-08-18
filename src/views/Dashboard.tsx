import { useMemo, useState } from "react";
import { usePos, money, clockTime } from "../store";
import { CATEGORIES, daysUntil, nearestExpiry, stockOf, fefoBatches } from "../data";
import { Stat, cx } from "../ui";
import {
  ICash, ICart, ITrendUp, ITrendDown, IAlert, IBox, IRx, IPill, IChevD, IFlask,
} from "../icons";

const DAY = 86_400_000;

export default function Dashboard() {
  const { state, dispatch, lowStock, expiring, newRx, todayStats } = usePos();

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const t0 = dayStart.getTime();

  const [hover, setHover] = useState<number | null>(null);

  const week = useMemo(() => {
    const days: { label: string; date: string; total: number; count: number; units: number }[] = [];
    for (let d = 6; d >= 0; d--) {
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
  }, [state.transactions, t0]);

  const yesterday = state.transactions.filter((t) => t.at >= t0 - DAY && t.at < t0);
  const yRevenue = yesterday.reduce((s, t) => s + t.total, 0);
  const delta = yRevenue > 0 ? ((todayStats.revenue - yRevenue) / yRevenue) * 100 : 0;
  const maxDay = Math.max(...week.map((w) => w.total), 1);

  const topSellers = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; revenue: number; cat: string }>();
    state.transactions.filter((t) => t.at >= t0 - 6 * DAY && !t.refundOf).forEach((t) =>
      t.lines.forEach((l) => {
        const cur = agg.get(l.productId) ?? { name: l.name, qty: 0, revenue: 0, cat: "" };
        const prod = state.products.find((p) => p.id === l.productId);
        agg.set(l.productId, { ...cur, qty: cur.qty + l.qty, revenue: cur.revenue + l.qty * l.price, cat: prod?.category ?? "" });
      }));
    return [...agg.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);
  }, [state.transactions, state.products, t0]);

  const maxQty = Math.max(...topSellers.map((t) => t.qty), 1);
  const recent = state.transactions.slice(0, 7);

  const Delta = ({ v }: { v: number }) => (
    <span className={cx("inline-flex items-center gap-1 font-bold num text-[11px]", v >= 0 ? "text-pine-600" : "text-brick-700")}>
      {v >= 0 ? <ITrendUp size={12} /> : <ITrendDown size={12} />}
      {v >= 0 ? "+" : ""}{v.toFixed(1)}% vs yesterday
    </span>
  );

  return (
    <div className="h-full overflow-y-auto scroll-slim px-6 py-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
        <Stat label="Today's revenue" value={money(todayStats.revenue)}
          icon={<ICash size={15} />} accent="#0f4437" sub={<Delta v={delta} />} />
        <Stat label="Transactions" value={todayStats.count}
          icon={<ICart size={15} />} accent="#3b8668" sub={<span>{yesterday.length} yesterday · avg basket <span className="num font-bold">{money(todayStats.avg)}</span></span>} />
        <Stat label="Units sold today" value={todayStats.items}
          icon={<IPill size={15} />} accent="#5da184" sub={<span>across {new Set(state.transactions.filter((t) => t.at >= t0).flatMap((t) => t.lines.map((l) => l.productId))).size} products</span>} />
        <Stat label="Open alerts" value={lowStock.length + expiring.length + newRx}
          icon={<IAlert size={15} />} accent="#c24a2e"
          sub={<span><span className="font-bold text-honey-700">{lowStock.length}</span> low · <span className="font-bold text-brick-700">{expiring.length}</span> expiring · <span className="font-bold">{newRx}</span> ℞ queue</span>} />
      </div>

      <div className="mt-4 grid xl:grid-cols-3 gap-3.5">
        {/* revenue chart */}
        <div className="xl:col-span-2 bg-card border border-mist rounded-xl shadow-lift p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="font-display font-bold text-ink text-[15px]">Revenue · last 7 days</h2>
              <p className="text-xs text-inksoft mt-0.5">
                Week total <span className="num font-bold text-pine-800">{money(week.reduce((s, w) => s + w.total, 0))}</span>
                {" "}· best day {week.reduce((a, b) => (b.total > a.total ? b : a)).label}
              </p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">POS ledger</span>
          </div>
          <div className="mt-5 flex items-end gap-3 h-44">
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
                      <div className="bg-pine-950 text-pine-50 rounded-lg px-3 py-2 shadow-lift text-left">
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
                    <div className="anim-bar w-full max-w-[46px] rounded-t-md transition-all duration-200 cursor-pointer"
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
                  <span className={cx("text-[11px] font-semibold", isToday || active ? "text-pine-800" : "text-inksoft")}>{w.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* alert feed */}
        <div className="bg-card border border-mist rounded-xl shadow-lift p-5 flex flex-col">
          <h2 className="font-display font-bold text-ink text-[15px]">Needs attention</h2>
          <div className="mt-3 space-y-2 flex-1 overflow-y-auto scroll-slim pr-1">
            {expiring.slice(0, 4).map((p) => {
              const e = nearestExpiry(p)!;
              const d = daysUntil(e);
              return (
                <button key={p.id} onClick={() => dispatch({ type: "GO", view: "inventory", invPreset: "expiring" })}
                  className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-brick-100/50 border border-brick-300/40 hover:border-brick-500/60 transition group">
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
                className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-honey-100/60 border border-honey-300/50 hover:border-honey-500/70 transition group">
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
                className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-pine-100/70 border border-pine-200 hover:border-pine-400 transition group">
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

      <div className="mt-4 grid xl:grid-cols-2 gap-3.5 pb-6">
        {/* top sellers */}
        <div className="bg-card border border-mist rounded-xl shadow-lift p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-ink text-[15px]">Top movers · 7 days</h2>
            <IFlask size={15} className="text-pine-600" />
          </div>
          <div className="mt-4 space-y-3">
            {topSellers.map((t, i) => (
              <div key={t.name} className="flex items-center gap-3">
                <span className="num w-5 text-xs font-bold text-inksoft">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-ink truncate">{t.name}</span>
                    <span className="num text-inksoft shrink-0 ml-2">{t.qty} sold · {money(t.revenue)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-mist/60 overflow-hidden">
                    <div className="anim-grow-w h-full rounded-full"
                      style={{
                        width: `${(t.qty / maxQty) * 100}%`, animationDelay: `${i * 70}ms`,
                        background: CATEGORIES.find((c) => c.id === t.cat)?.dot ?? "#3b8668",
                      }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

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
                className="w-full flex items-center gap-3 py-2 text-left hover:bg-pine-50/60 rounded-md px-1.5 -mx-1.5 transition group">
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
      </div>
    </div>
  );
}
