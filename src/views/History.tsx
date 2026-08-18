import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { usePos, money, clockTime, relTime } from "../store";
import type { PayMethod } from "../data";
import { cx, Badge, Empty } from "../ui";
import { IHistory, ISearch, ICash, ICard, IShield, IPill } from "../icons";

export default function History() {
  const { state, dispatch, todayStats } = usePos();
  const [method, setMethod] = useState<PayMethod | "all">("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.transactions.filter((t) => {
      if (method !== "all" && t.method !== method) return false;
      if (!needle) return true;
      return t.id.toLowerCase().includes(needle) ||
        t.lines.some((l) => l.name.toLowerCase().includes(needle));
    });
  }, [state.transactions, method, q]);

  const shownTotal = rows.reduce((s, t) => s + t.total, 0);
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);

  const chips: { id: PayMethod | "all"; label: string; icon?: ReactNode }[] = [
    { id: "all", label: "All" },
    { id: "cash", label: "Cash", icon: <ICash size={12} /> },
    { id: "card", label: "Card", icon: <ICard size={12} /> },
    { id: "insurance", label: "Insurance", icon: <IShield size={12} /> },
  ];

  return (
    <div className="h-full flex flex-col px-6 py-5 min-h-0">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            {chips.map((c) => (
              <button key={c.id} onClick={() => setMethod(c.id)}
                className={cx("flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all",
                  method === c.id ? "bg-ink text-paper border-ink shadow-lift" : "bg-card border-mist text-inksoft hover:border-pine-300 hover:text-ink")}>
                {c.icon}{c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative w-64">
          <ISearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-inksoft" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Receipt # or product…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-mist text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition" />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Shown receipts" value={String(rows.length)} />
        <MiniStat label="Shown revenue" value={money(shownTotal)} />
        <MiniStat label="Today so far" value={money(todayStats.revenue)} accent />
        <MiniStat label="Avg ticket (today)" value={money(todayStats.avg)} />
      </div>

      <div className="mt-4 flex-1 min-h-0 overflow-y-auto scroll-slim rounded-xl border border-mist bg-card shadow-lift">
        {rows.length === 0 ? (
          <Empty icon={<IHistory size={22} />} title="No receipts match" hint="Try a different payment filter or search term." />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-pine-900 text-pine-100 text-left text-[10px] uppercase tracking-[0.14em]">
                <th className="px-4 py-2.5 font-bold">Receipt</th>
                <th className="px-3 py-2.5 font-bold">When</th>
                <th className="px-3 py-2.5 font-bold">Items</th>
                <th className="px-3 py-2.5 font-bold">Method</th>
                <th className="px-3 py-2.5 font-bold text-right">Total</th>
                <th className="px-4 py-2.5 font-bold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={t.id} onClick={() => dispatch({ type: "OPEN_RECEIPT", tx: t })}
                  className={cx("border-t border-mist/70 cursor-pointer transition-colors hover:bg-pine-50/70", i % 2 === 1 && "bg-paper/50")}>
                  <td className="px-4 py-2.5">
                    <p className="num font-bold text-ink">{t.id}</p>
                    <p className="text-[10px] text-inksoft">{t.cashier}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="num text-xs font-semibold text-ink">{clockTime(t.at)}</p>
                    <p className="text-[10px] text-inksoft">{t.at >= dayStart.getTime() ? "today" : relTime(t.at)}</p>
                  </td>
                  <td className="px-3 py-2.5 max-w-[340px]">
                    <p className="text-xs text-ink truncate">
                      {t.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                    </p>
                    {t.lines.some((l) => l.rx) && <Badge tone="brick">℞ dispensed</Badge>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={t.method === "cash" ? "pine" : t.method === "card" ? "mist" : "ink"}>
                      {t.method === "cash" ? <ICash size={11} /> : t.method === "card" ? <ICard size={11} /> : <IShield size={11} />}
                      {t.method}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right num font-bold text-pine-800">{money(t.total)}</td>
                  <td className="px-4 py-2.5 text-right text-[11px] font-bold text-pine-700 opacity-0 hover-cell">view ↗</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-[11px] text-inksoft flex items-center gap-1.5">
        <IPill size={12} /> Click any row to reprint its receipt · {state.transactions.length} receipts retained in the local ledger
      </p>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cx("rounded-xl border px-3.5 py-2.5", accent ? "bg-pine-800 border-pine-800 text-pine-50" : "bg-card border-mist")}>
      <p className={cx("text-[10px] font-bold uppercase tracking-[0.14em]", accent ? "text-pine-200" : "text-inksoft")}>{label}</p>
      <p className={cx("num text-lg font-bold leading-tight", accent ? "text-pine-50" : "text-ink")}>{value}</p>
    </div>
  );
}
