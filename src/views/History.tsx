import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { usePos, money, clockTime, relTime } from "../store";
import type { PayMethod, Transaction } from "../data";
import { cx, Badge, Empty, Modal } from "../ui";
import { IHistory, ISearch, ICash, ICard, IShield, IPill, IX, IRecall, ICalendar, IDownload, IReport } from "../icons";
import type { AuditKind } from "../data";

const REFUND_REASONS = ["Customer return", "Wrong item dispensed", "Damaged goods", "Pricing error", "Duplicate charge"];

export default function History() {
  const { state, dispatch, todayStats } = usePos();
  const [method, setMethod] = useState<PayMethod | "all">("all");
  const [q, setQ] = useState("");
  const [refunding, setRefunding] = useState<Transaction | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.transactions.filter((t) => {
      if (method !== "all" && t.method !== method) return false;
      if (!needle) return true;
      return t.id.toLowerCase().includes(needle) ||
        (t.refundOf ?? "").toLowerCase().includes(needle) ||
        t.lines.some((l) => l.name.toLowerCase().includes(needle));
    });
  }, [state.transactions, method, q]);

  const shownTotal = rows.reduce((s, t) => s + t.total, 0);
  const refundCount = rows.filter((t) => t.refundOf).length;
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
        <div className="flex items-center gap-2">
          {chips.map((c) => (
            <button key={c.id} onClick={() => setMethod(c.id)}
              className={cx("flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all",
                method === c.id ? "bg-ink text-paper border-ink shadow-lift" : "bg-card border-mist text-inksoft hover:border-pine-300 hover:text-ink")}>
              {c.icon}{c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <ISearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-inksoft" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Receipt # or product…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-mist text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition" />
          </div>
          <button onClick={() => setShiftOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-ink text-paper text-xs font-bold hover:bg-pine-900 transition active:scale-95 shadow-lift">
            <ICalendar size={14} /> Shift summary
          </button>
          <button onClick={() => setAuditOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-mist bg-card text-xs font-bold text-ink hover:border-pine-400 hover:bg-pine-50 transition active:scale-95">
            <IReport size={14} /> Audit trail
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Shown receipts" value={String(rows.length)} />
        <MiniStat label="Net shown" value={money(shownTotal)}
          sub={refundCount > 0 ? `${refundCount} refund${refundCount === 1 ? "" : "s"} netted` : undefined} />
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
                <th className="px-4 py-2.5 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={t.id} onClick={() => dispatch({ type: "OPEN_RECEIPT", tx: t })}
                  className={cx("border-t border-mist/70 cursor-pointer transition-colors hover:bg-pine-50/70",
                    i % 2 === 1 && "bg-paper/50", t.refundOf && "bg-brick-100/30")}>
                  <td className="px-4 py-2.5">
                    <p className="num font-bold text-ink flex items-center gap-1.5">
                      {t.id}
                      {t.refundOf && <span className="text-[10px] font-bold text-brick-700">↩ of {t.refundOf}</span>}
                    </p>
                    <p className="text-[10px] text-inksoft">{t.cashier}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="num text-xs font-semibold text-ink">{clockTime(t.at)}</p>
                    <p className="text-[10px] text-inksoft">{t.at >= dayStart.getTime() ? "today" : relTime(t.at)}</p>
                  </td>
                  <td className="px-3 py-2.5 max-w-[320px]">
                    <p className="text-xs text-ink truncate">
                      {t.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                    </p>
                    <div className="flex gap-1 mt-0.5">
                      {t.lines.some((l) => l.rx) && <Badge tone="brick">℞ dispensed</Badge>}
                      {t.refundedAt && <Badge tone="honey">refunded</Badge>}
                      {t.refundOf && <Badge tone="mist">{t.reason ?? "refund"}</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={t.method === "cash" ? "pine" : t.method === "card" ? "mist" : "ink"}>
                      {t.method === "cash" ? <ICash size={11} /> : t.method === "card" ? <ICard size={11} /> : <IShield size={11} />}
                      {t.method}
                    </Badge>
                  </td>
                  <td className={cx("px-3 py-2.5 text-right num font-bold", t.total < 0 ? "text-brick-700" : "text-pine-800")}>
                    {t.total < 0 && <span className="mr-0.5">−</span>}{money(Math.abs(t.total))}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end items-center gap-1.5">
                      {!t.refundOf && !t.refundedAt && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setRefunding(t); }}
                          className="px-2 py-1 rounded-md border border-mist text-[10px] font-bold text-inksoft hover:border-brick-500 hover:text-brick-700 hover:bg-brick-100/60 transition active:scale-95 opacity-0 hover-cell">
                          Refund
                        </button>
                      )}
                      <span className="text-[11px] font-bold text-pine-700 opacity-0 hover-cell">view ↗</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-[11px] text-inksoft flex items-center gap-1.5">
        <IPill size={12} /> Click a row to reprint · refunds restore stock to the original lots · {state.transactions.length} records retained locally
      </p>

      {refunding && <RefundModal tx={refunding} onClose={() => setRefunding(null)} />}
      {shiftOpen && <ShiftModal onClose={() => setShiftOpen(false)} />}
    </div>
  );
}

function ShiftModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePos();
  const FLOAT = 150;

  const dayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const today = useMemo(() => state.transactions.filter((t) => t.at >= dayStart), [state.transactions, dayStart]);
  const sales = today.filter((t) => !t.refundOf);
  const refunds = today.filter((t) => !!t.refundOf);
  const gross = sales.reduce((s, t) => s + t.total, 0);
  const refunded = refunds.reduce((s, t) => s + Math.abs(t.total), 0);
  const net = gross - refunded;
  const units = sales.reduce((s, t) => s + t.lines.reduce((x, l) => x + l.qty, 0), 0);
  const rxUnits = sales.reduce((s, t) => s + t.lines.filter((l) => l.rx).reduce((x, l) => x + l.qty, 0), 0);

  const byMethod: Record<string, number> = { cash: 0, card: 0, insurance: 0 };
  let cashIn = 0, changeOut = 0;
  for (const t of sales) {
    if (t.payments) {
      t.payments.forEach((p) => { byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount; if (p.method === "cash") cashIn += p.amount; });
    } else {
      byMethod[t.method] += t.total;
      if (t.method === "cash") { cashIn += t.tendered ?? t.total; changeOut += t.change ?? 0; }
    }
  }
  const drawer = FLOAT + cashIn - changeOut;
  const maxMethod = Math.max(...Object.values(byMethod), 1);

  const top = useMemo(() => {
    const agg = new Map<string, { name: string; qty: number; rev: number }>();
    sales.forEach((t) => t.lines.forEach((l) => {
      const cur = agg.get(l.productId) ?? { name: l.name, qty: 0, rev: 0 };
      agg.set(l.productId, { name: l.name, qty: cur.qty + l.qty, rev: cur.rev + l.price * l.qty });
    }));
    return [...agg.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [sales]);

  const exportCsv = () => {
    const rows = [
      ["shift", new Date().toLocaleDateString()],
      ["gross_sales", gross.toFixed(2)], ["refunds", refunded.toFixed(2)], ["net_revenue", net.toFixed(2)],
      ["transactions", String(sales.length)], ["units_sold", String(units)], ["rx_units", String(rxUnits)],
      ["by_cash", byMethod.cash.toFixed(2)], ["by_card", byMethod.card.toFixed(2)], ["by_insurance", byMethod.insurance.toFixed(2)],
      ["expected_drawer", drawer.toFixed(2)],
    ];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `z-read-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    dispatch({ type: "TOAST", kind: "success", msg: "Z-read exported" });
  };

  const MethodBar = ({ id, label, icon }: { id: string; label: string; icon: ReactNode }) => (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="flex items-center gap-1.5 font-semibold text-ink">{icon}{label}</span>
        <span className="num font-bold text-ink">{money(byMethod[id])}</span>
      </div>
      <div className="h-2 rounded-full bg-mist/60 overflow-hidden">
        <div className="anim-grow-w h-full rounded-full"
          style={{ width: `${(byMethod[id] / maxMethod) * 100}%`, background: id === "cash" ? "#256b54" : id === "card" ? "#5da184" : "#4f7d9e" }} />
      </div>
    </div>
  );

  return (
    <Modal onClose={onClose} width={540} labelledBy="shift-title">
      <div className="px-5 py-4 bg-pine-950 text-pine-50 flex items-center justify-between rounded-t-xl">
        <div>
          <h2 id="shift-title" className="font-display font-bold text-lg leading-none flex items-center gap-2">
            <ICalendar size={17} className="text-honey-300" /> Z-read · {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </h2>
          <p className="text-[11px] text-pine-300 mt-1 num">Terminal 01 · cashier A. Okafor · shift open 08:30</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10 text-pine-200" aria-label="Close"><IX size={14} /></button>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-lg bg-pine-100/80 border border-pine-200 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-pine-700">Net revenue</p>
            <p className="num text-xl font-bold text-pine-900">{money(net)}</p>
          </div>
          <div className="rounded-lg bg-card border border-mist px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-inksoft">Gross</p>
            <p className="num text-xl font-bold text-ink">{money(gross)}</p>
          </div>
          <div className="rounded-lg bg-card border border-mist px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-inksoft">Refunded</p>
            <p className="num text-xl font-bold text-brick-700">−{money(refunded)}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[
            [String(sales.length), "sales"], [String(units), "units"],
            [String(rxUnits), "℞ units"], [money(sales.length ? net / sales.length : 0), "avg ticket"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-lg border border-mist py-2">
              <p className="num text-sm font-bold text-ink">{v}</p>
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-inksoft">{l}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Tender breakdown</p>
          <MethodBar id="cash" label="Cash" icon={<ICash size={12} />} />
          <MethodBar id="card" label="Card" icon={<ICard size={12} />} />
          <MethodBar id="insurance" label="Insurance claims" icon={<IShield size={12} />} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-1.5">Top sellers</p>
            <div className="space-y-1">
              {top.map((t, i) => (
                <div key={t.name} className="flex items-center gap-2 text-[11px]">
                  <span className="num w-4 text-inksoft font-bold">{i + 1}</span>
                  <span className="flex-1 truncate font-semibold text-ink">{t.name}</span>
                  <span className="num text-inksoft shrink-0">{t.qty}× · {money(t.rev)}</span>
                </div>
              ))}
              {top.length === 0 && <p className="text-[11px] text-inksoft">No sales yet today.</p>}
            </div>
          </div>
          <div className="rounded-lg bg-honey-100/70 border border-honey-300/60 p-3 self-start">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-honey-700">Expected in drawer</p>
            <p className="num text-2xl font-bold text-ink mt-0.5">{money(drawer)}</p>
            <p className="text-[10px] text-inksoft mt-1 num leading-relaxed">
              float {money(FLOAT)} + cash in {money(cashIn)} − change {money(changeOut)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-mist text-xs font-semibold text-inksoft hover:text-ink transition">Close</button>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95">
            <IDownload size={13} /> Export Z-read
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RefundModal({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { dispatch } = usePos();
  const [reason, setReason] = useState(REFUND_REASONS[0]);
  return (
    <Modal onClose={onClose} width={440} labelledBy="rfnd-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="rfnd-title" className="font-display font-bold text-ink flex items-center gap-2">
            <IRecall size={16} className="text-brick-700" /> Refund {tx.id}
          </h2>
          <p className="text-xs text-inksoft mt-0.5">Reverses payment and returns every unit to its lot</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-4">
        <div className="bg-paper border border-mist rounded-lg p-3 space-y-1">
          {tx.lines.map((l) => (
            <div key={l.productId} className="flex justify-between text-xs">
              <span className="text-ink truncate">{l.qty}× {l.name}</span>
              <span className="num text-inksoft shrink-0 ml-2">{money(l.price * l.qty)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold text-brick-700 pt-1.5 border-t border-dashed border-mist">
            <span>Refund to customer</span>
            <span className="num">−{money(tx.total)}</span>
          </div>
          <p className="text-[10px] text-inksoft">via {tx.method}{tx.tendered ? ` (cash ${money(tx.tendered)} tendered)` : ""}</p>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full mt-1.5 px-3 py-2.5 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none">
            {REFUND_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <button
          onClick={() => { dispatch({ type: "REFUND_TX", txId: tx.id, reason }); onClose(); }}
          className="w-full py-2.5 rounded-lg bg-brick-600 text-brick-50 font-display font-bold text-sm hover:bg-brick-700 transition active:scale-[0.98]">
          Confirm refund · −{money(tx.total)}
        </button>
      </div>
    </Modal>
  );
}

function MiniStat({ label, value, accent, sub }: { label: string; value: string; accent?: boolean; sub?: string }) {
  return (
    <div className={cx("rounded-xl border px-3.5 py-2.5", accent ? "bg-pine-800 border-pine-800 text-pine-50" : "bg-card border-mist")}>
      <p className={cx("text-[10px] font-bold uppercase tracking-[0.14em]", accent ? "text-pine-200" : "text-inksoft")}>{label}</p>
      <p className={cx("num text-lg font-bold leading-tight", accent ? "text-pine-50" : "text-ink")}>{value}</p>
      {sub && <p className={cx("text-[10px] font-semibold", accent ? "text-pine-200" : "text-brick-700")}>{sub}</p>}
    </div>
  );
}
