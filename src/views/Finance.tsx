import { useMemo, useState } from "react";
import { usePos, money } from "../store";
import { can, invoiceBalance, invoicePaid, EXPENSE_CATEGORIES } from "../data";
import type { PurchaseOrder, ApInvoice, ApPayMethod } from "../data";
import { cx, Badge, Modal } from "../ui";
import { IPlus, IX, ICheck, IDownload, IAlert, ICash, ICard, ITrash, ILedger, IBox, ICalendar, ITag, IRecall } from "../icons";

const day = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const toISODate = (ts: number) => new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString().slice(0, 10);

type Tab = "po" | "ap" | "exp" | "pnl";

export default function Finance() {
  const { state } = usePos();
  const [tab, setTab] = useState<Tab>("po");

  const openAp = state.apInvoices.filter((i) => invoiceBalance(i) > 0);
  const now = Date.now();
  const apOutstanding = openAp.reduce((s, i) => s + invoiceBalance(i), 0);
  const apOverdue = openAp.filter((i) => i.date + i.dueDays * day < now).reduce((s, i) => s + invoiceBalance(i), 0);
  const openPos = state.purchaseOrders.filter((p) => p.status === "ordered" || p.status === "partial").length;

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const mtd = state.transactions.filter((t) => t.at >= monthStart.getTime());
  const netRevenue = mtd.reduce((s, t) => s + t.total, 0);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "po", label: "Purchase orders", badge: openPos },
    { id: "ap", label: "Accounts payable", badge: openAp.length },
    { id: "exp", label: "Expenses" },
    { id: "pnl", label: "P&L" },
  ];

  return (
    <div className="h-full flex flex-col px-3 sm:px-6 py-4 sm:py-5 min-h-0">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-card border border-mist rounded-lg p-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cx("px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5",
                tab === t.id ? "bg-pine-700 text-pine-50 shadow-lift" : "text-inksoft hover:bg-mist/60")}>
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className={cx("num text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                  tab === t.id ? "bg-pine-500 text-pine-50" : "bg-brick-500 text-paper")}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[11px]">
          <span className="num px-2.5 py-1.5 rounded-lg bg-card border border-mist font-bold text-ink">AP open <span className="text-brick-700">{money(apOutstanding)}</span></span>
          <span className="num hidden sm:inline px-2.5 py-1.5 rounded-lg bg-card border border-mist font-bold text-ink">Overdue <span className="text-brick-700">{money(apOverdue)}</span></span>
          <span className="num hidden md:inline px-2.5 py-1.5 rounded-lg bg-card border border-mist font-bold text-ink">MTD net <span className="text-pine-700">{money(netRevenue)}</span></span>
        </div>
      </div>

      <div className="mt-4 flex-1 min-h-0 overflow-y-auto scroll-slim pb-6">
        {tab === "po" && <PoTab />}
        {tab === "ap" && <ApTab />}
        {tab === "exp" && <ExpTab />}
        {tab === "pnl" && <PnlTab />}
      </div>
    </div>
  );
}

/* ---------------------------- Purchase Orders ---------------------------- */
function PoTab() {
  const { state, dispatch, product, supplier } = usePos();
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const mayCreate = can(state.user?.role, "create_po");
  const mayReceive = can(state.user?.role, "receive_po");
  const now = Date.now();

  const poTotal = (po: PurchaseOrder) => r2(po.lines.reduce((s, l) => s + l.qty * l.unitCost, 0));
  const statusTone = (s: PurchaseOrder["status"]) =>
    s === "received" ? "bg-pine-100 text-pine-700" : s === "partial" ? "bg-honey-100 text-honey-700"
      : s === "cancelled" ? "bg-mist text-inksoft" : "bg-brick-100 text-brick-700";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-ink text-[15px]">Purchase orders</h2>
        <button onClick={() => setCreating(true)} disabled={!mayCreate}
          title={mayCreate ? "Create a purchase order" : "Requires manager or admin"}
          className={cx("flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition active:scale-95",
            mayCreate ? "bg-pine-700 text-pine-50 hover:bg-pine-600 shadow-lift" : "bg-mist text-inksoft/50 cursor-not-allowed")}>
          <IPlus size={14} /> New PO
        </button>
      </div>

      <div className="overflow-auto scroll-slim rounded-xl border border-mist bg-card shadow-lift">
        <table className="w-full text-sm border-collapse min-w-[820px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-pine-900 text-pine-100 text-left text-[10px] uppercase tracking-[0.14em]">
              <th className="px-4 py-2.5 font-bold">PO</th>
              <th className="px-3 py-2.5 font-bold">Supplier</th>
              <th className="px-3 py-2.5 font-bold">Status</th>
              <th className="px-3 py-2.5 font-bold text-right">Value</th>
              <th className="px-3 py-2.5 font-bold">Ordered</th>
              <th className="px-3 py-2.5 font-bold">Expected</th>
              <th className="px-4 py-2.5 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {state.purchaseOrders.map((po) => {
              const overdue = (po.status === "ordered" || po.status === "partial") && po.expectedAt < now;
              return (
                <tr key={po.id} className="border-t border-mist/70 hover:bg-pine-50/50 transition-colors">
                  <td className="px-4 py-2.5 num font-bold text-ink">{po.id}</td>
                  <td className="px-3 py-2.5 text-ink">{supplier(po.supplierId)?.name ?? po.supplierId}</td>
                  <td className="px-3 py-2.5"><span className={cx("px-2 py-0.5 rounded text-[10px] font-bold uppercase", statusTone(po.status))}>{po.status}</span></td>
                  <td className="px-3 py-2.5 text-right num font-semibold text-ink">{money(poTotal(po))}</td>
                  <td className="px-3 py-2.5 text-inksoft num">{fmtDate(po.createdAt)}</td>
                  <td className="px-3 py-2.5 num">
                    <span className={cx(overdue && "text-brick-700 font-bold")}>{fmtDate(po.expectedAt)}</span>
                    {overdue && <span className="ml-1.5 text-[9px] font-bold text-brick-700 uppercase">late</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-1.5">
                      {(po.status === "ordered" || po.status === "partial") && mayReceive && (
                        <button onClick={() => setReceiving(po)}
                          className="px-2.5 py-1 rounded-md bg-pine-700 text-pine-50 text-[10px] font-bold hover:bg-pine-600 transition active:scale-95">Receive</button>
                      )}
                      {po.status === "ordered" && mayCreate && (
                        <button onClick={() => dispatch({ type: "PO_CANCEL", poId: po.id })}
                          className="px-2.5 py-1 rounded-md border border-mist text-inksoft text-[10px] font-bold hover:border-brick-400 hover:text-brick-700 transition active:scale-95">Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {state.purchaseOrders.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-inksoft">No purchase orders yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {receiving && <ReceiveModal po={receiving} onClose={() => setReceiving(null)} />}
      {creating && <NewPoModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function ReceiveModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const { state, dispatch, product, supplier } = usePos();
  const sup = supplier(po.supplierId);
  const [rows, setRows] = useState(() =>
    Object.fromEntries(po.lines.map((l) => [l.productId, {
      qty: String(Math.max(0, l.qty - l.received)),
      expiry: toISODate(Date.now() + 365 * day),
    }])));
  const set = (pid: string, k: "qty" | "expiry", v: string) =>
    setRows((s) => ({ ...s, [pid]: { ...s[pid], [k]: v } }));

  const receipts = po.lines
    .map((l) => ({ productId: l.productId, qty: Math.max(0, parseInt(rows[l.productId]?.qty ?? "0") || 0), expiry: rows[l.productId]?.expiry ?? toISODate(Date.now() + 365 * day) }))
    .filter((r) => r.qty > 0);

  return (
    <Modal onClose={onClose} width={520} labelledBy="recv-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="recv-title" className="font-display font-bold text-ink">Receive {po.id}</h2>
          <p className="text-xs text-inksoft mt-0.5">{sup?.name} · each line becomes a new stock lot with its own expiry</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3">
        {po.lines.map((l) => {
          const remaining = Math.max(0, l.qty - l.received);
          return (
            <div key={l.productId} className="rounded-lg border border-mist bg-paper p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-ink truncate">{product(l.productId)?.name ?? l.productId}</p>
                <span className="num text-[10px] text-inksoft shrink-0">{l.received}/{l.qty} in · {remaining} open</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-inksoft">Qty received</label>
                  <input value={rows[l.productId]?.qty ?? ""} onChange={(e) => set(l.productId, "qty", e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric" className="num w-full mt-0.5 px-2.5 py-1.5 rounded-md border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-inksoft">Lot expiry</label>
                  <input type="date" value={rows[l.productId]?.expiry ?? ""} onChange={(e) => set(l.productId, "expiry", e.target.value)}
                    className="num w-full mt-0.5 px-2.5 py-1.5 rounded-md border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none" />
                </div>
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-inksoft flex items-center gap-1.5"><IAlert size={11} className="text-honey-600" /> Receiving books a supplier invoice at your {sup?.terms ?? 30}-day terms — no payment needed now.</p>
        <button disabled={receipts.length === 0}
          onClick={() => { dispatch({ type: "PO_RECEIVE", poId: po.id, receipts }); onClose(); }}
          className={cx("w-full py-2.5 rounded-lg font-display font-bold text-sm transition-all flex items-center justify-center gap-2",
            receipts.length > 0 ? "bg-pine-700 text-pine-50 hover:bg-pine-600 active:scale-[0.98] shadow-lift" : "bg-mist text-inksoft/60 cursor-not-allowed")}>
          <ICheck size={15} /> Receive {receipts.reduce((s, r) => s + r.qty, 0)} unit(s) into stock
        </button>
      </div>
    </Modal>
  );
}

function NewPoModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch, product } = usePos();
  const [supplierId, setSupplierId] = useState(state.suppliers[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ productId: string; qty: string; unitCost: string }[]>([]);
  const sup = state.suppliers.find((s) => s.id === supplierId);

  const addLine = () => {
    const first = state.products[0];
    if (first) setLines((l) => [...l, { productId: first.id, qty: "10", unitCost: String(first.cost) }]);
  };
  const setLine = (i: number, k: "productId" | "qty" | "unitCost", v: string) =>
    setLines((l) => l.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
  const onPick = (i: number, pid: string) => {
    const p = product(pid);
    setLines((l) => l.map((row, j) => (j === i ? { ...row, productId: pid, unitCost: p ? String(p.cost) : row.unitCost } : row)));
  };

  const valid = lines.length > 0 && lines.every((l) => (parseInt(l.qty) || 0) > 0 && (parseFloat(l.unitCost) || 0) >= 0);
  const total = r2(lines.reduce((s, l) => s + (parseInt(l.qty) || 0) * (parseFloat(l.unitCost) || 0), 0));

  return (
    <Modal onClose={onClose} width={560} labelledBy="npo-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="npo-title" className="font-display font-bold text-ink">New purchase order</h2>
          <p className="text-xs text-inksoft mt-0.5">{sup ? `${sup.name} · net-${sup.terms} · ~${sup.leadDays}d lead` : "Choose a supplier"}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Supplier</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
            className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none">
            {state.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Lines</label>
            <button onClick={addLine} className="flex items-center gap-1 text-[11px] font-bold text-pine-700 hover:text-pine-600"><IPlus size={11} /> Add line</button>
          </div>
          <div className="mt-1.5 space-y-2 max-h-52 overflow-y-auto scroll-slim">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_90px_28px] gap-2 items-center">
                <select value={l.productId} onChange={(e) => onPick(i, e.target.value)}
                  className="px-2 py-1.5 rounded-md border border-mist bg-card text-xs focus:border-pine-500 focus:outline-none">
                  {state.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value.replace(/\D/g, ""))} placeholder="Qty"
                  inputMode="numeric" className="num px-2 py-1.5 rounded-md border border-mist bg-card text-xs focus:border-pine-500 focus:outline-none" />
                <input value={l.unitCost} onChange={(e) => setLine(i, "unitCost", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Unit cost"
                  inputMode="decimal" className="num px-2 py-1.5 rounded-md border border-mist bg-card text-xs focus:border-pine-500 focus:outline-none" />
                <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="p-1 rounded text-inksoft hover:text-brick-700 transition" aria-label="Remove line"><ITrash size={12} /></button>
              </div>
            ))}
            {lines.length === 0 && <p className="text-xs text-inksoft">No lines yet — add at least one.</p>}
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Note</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional"
            className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none" />
        </div>
        <button disabled={!valid}
          onClick={() => {
            dispatch({ type: "PO_CREATE", supplierId, note, lines: lines.map((l) => ({ productId: l.productId, qty: parseInt(l.qty) || 0, unitCost: parseFloat(l.unitCost) || 0 })) });
            onClose();
          }}
          className={cx("w-full py-2.5 rounded-lg font-display font-bold text-sm transition-all flex items-center justify-center gap-2",
            valid ? "bg-pine-700 text-pine-50 hover:bg-pine-600 active:scale-[0.98] shadow-lift" : "bg-mist text-inksoft/60 cursor-not-allowed")}>
          <ICheck size={15} /> Place order · {money(total)}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------- Accounts Payable ---------------------------- */
function ApTab() {
  const { state, dispatch, supplier } = usePos();
  const [paying, setPaying] = useState<ApInvoice | null>(null);
  const [crediting, setCrediting] = useState<ApInvoice | null>(null);
  const mayPay = can(state.user?.role, "pay_invoice");
  const now = Date.now();

  const open = state.apInvoices.filter((i) => invoiceBalance(i) > 0);
  const dueTs = (i: ApInvoice) => i.date + i.dueDays * day;
  const daysOver = (i: ApInvoice) => Math.floor((now - dueTs(i)) / day);

  /* aging buckets over open balances */
  const buckets = [
    { label: "Current", test: (i: ApInvoice) => daysOver(i) <= 0 },
    { label: "1–30", test: (i: ApInvoice) => daysOver(i) >= 1 && daysOver(i) <= 30 },
    { label: "31–60", test: (i: ApInvoice) => daysOver(i) >= 31 && daysOver(i) <= 60 },
    { label: "61–90", test: (i: ApInvoice) => daysOver(i) >= 61 && daysOver(i) <= 90 },
    { label: "90+", test: (i: ApInvoice) => daysOver(i) > 90 },
  ].map((b) => ({ ...b, sum: r2(open.filter(b.test).reduce((s, i) => s + invoiceBalance(i), 0)) }));
  const maxBucket = Math.max(...buckets.map((b) => b.sum), 1);

  const exportCsv = () => {
    const head = ["invoice", "supplier", "po", "date", "due", "total", "paid", "balance", "status"];
    const rows = state.apInvoices.map((i) => {
      const bal = invoiceBalance(i);
      const status = bal <= 0 ? "paid" : daysOver(i) > 0 ? "overdue" : "open";
      return [i.number, `"${supplier(i.supplierId)?.name ?? ""}"`, i.poId ?? "", toISODate(i.date), toISODate(dueTs(i)),
        i.total.toFixed(2), invoicePaid(i).toFixed(2), bal.toFixed(2), status].join(",");
    });
    const blob = new Blob([[head.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ap-${toISODate(now)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-ink text-[15px]">Accounts payable</h2>
        <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-pine-400 hover:bg-pine-50 transition active:scale-95">
          <IDownload size={13} /> Export
        </button>
      </div>

      {/* aging strip */}
      <div className="rounded-xl border border-mist bg-card p-4 mb-4 shadow-lift">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft mb-2.5">Aging of open payables</p>
        <div className="flex items-end gap-3">
          {buckets.map((b, i) => (
            <div key={b.label} className="flex-1">
              <div className="h-16 flex items-end">
                <div className={cx("w-full rounded-t-md transition-all duration-500", i === 0 ? "bg-pine-500" : i === 1 ? "bg-honey-400" : "bg-brick-500")}
                  style={{ height: `${Math.max(6, (b.sum / maxBucket) * 100)}%`, opacity: b.sum === 0 ? 0.25 : 1 }} />
              </div>
              <p className="num text-[11px] font-bold text-ink mt-1">{money(b.sum)}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-inksoft">{b.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-auto scroll-slim rounded-xl border border-mist bg-card shadow-lift">
        <table className="w-full text-sm border-collapse min-w-[860px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-pine-900 text-pine-100 text-left text-[10px] uppercase tracking-[0.14em]">
              <th className="px-4 py-2.5 font-bold">Invoice</th>
              <th className="px-3 py-2.5 font-bold">Supplier</th>
              <th className="px-3 py-2.5 font-bold">Due</th>
              <th className="px-3 py-2.5 font-bold text-right">Total</th>
              <th className="px-3 py-2.5 font-bold text-right">Paid</th>
              <th className="px-3 py-2.5 font-bold text-right">Balance</th>
              <th className="px-4 py-2.5 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {state.apInvoices.map((inv) => {
              const bal = invoiceBalance(inv);
              const over = bal > 0 && daysOver(inv) > 0;
              return (
                <tr key={inv.id} className="border-t border-mist/70 hover:bg-pine-50/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="num font-bold text-ink">{inv.number}</p>
                    <p className="text-[10px] text-inksoft">{inv.poId ? `vs ${inv.poId} · ` : ""}net-{inv.dueDays}</p>
                  </td>
                  <td className="px-3 py-2.5 text-ink">{supplier(inv.supplierId)?.name ?? inv.supplierId}</td>
                  <td className="px-3 py-2.5 num">
                    <span className={cx(over && "text-brick-700 font-bold")}>{fmtDate(dueTs(inv))}</span>
                    {bal > 0 && (
                      <span className={cx("ml-1.5 text-[9px] font-bold uppercase", over ? "text-brick-700" : "text-inksoft")}>
                        {over ? `${daysOver(inv)}d late` : `in ${-daysOver(inv)}d`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right num text-ink">{money(inv.total)}</td>
                  <td className="px-3 py-2.5 text-right num text-pine-700">{money(invoicePaid(inv))}</td>
                  <td className={cx("px-3 py-2.5 text-right num font-bold", bal > 0 ? "text-brick-700" : "text-inksoft")}>{money(bal)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {bal > 0 && (
                      <div className="inline-flex gap-1.5">
                        {mayPay && <button onClick={() => setPaying(inv)} className="px-2.5 py-1 rounded-md bg-pine-700 text-pine-50 text-[10px] font-bold hover:bg-pine-600 transition active:scale-95">Pay</button>}
                        {mayPay && <button onClick={() => setCrediting(inv)} className="px-2.5 py-1 rounded-md border border-mist text-inksoft text-[10px] font-bold hover:border-honey-400 hover:text-honey-700 transition active:scale-95">Credit</button>}
                      </div>
                    )}
                    {bal <= 0 && <Badge tone="pine"><ICheck size={10} /> Paid</Badge>}
                  </td>
                </tr>
              );
            })}
            {state.apInvoices.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-inksoft">No supplier invoices yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {paying && <PayModal inv={paying} onClose={() => setPaying(null)} />}
      {crediting && <CreditModal inv={crediting} onClose={() => setCrediting(null)} />}
    </div>
  );
}

function PayModal({ inv, onClose }: { inv: ApInvoice; onClose: () => void }) {
  const { dispatch, supplier } = usePos();
  const bal = invoiceBalance(inv);
  const [amount, setAmount] = useState(bal.toFixed(2));
  const [method, setMethod] = useState<ApPayMethod>("bank");
  const [ref, setRef] = useState("");
  const amt = parseFloat(amount) || 0;
  const valid = amt > 0 && amt <= bal + 0.005;
  const methods: { id: ApPayMethod; label: string; icon: React.ReactNode }[] = [
    { id: "bank", label: "Bank transfer", icon: <ILedger size={14} /> },
    { id: "cash", label: "Cash", icon: <ICash size={14} /> },
    { id: "card", label: "Card", icon: <ICard size={14} /> },
  ];
  return (
    <Modal onClose={onClose} width={420} labelledBy="pay-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="pay-title" className="font-display font-bold text-ink">Pay {inv.number}</h2>
          <p className="text-xs text-inksoft mt-0.5">{supplier(inv.supplierId)?.name} · balance due <span className="num font-bold text-brick-700">{money(bal)}</span></p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Amount (partial payments allowed)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" autoFocus
            className="num w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-base font-semibold focus:border-pine-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Method</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button key={m.id} onClick={() => setMethod(m.id)}
                className={cx("flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-bold transition",
                  method === m.id ? "border-pine-600 bg-pine-700 text-pine-50" : "border-mist bg-card text-inksoft hover:border-pine-300")}>
                {m.icon}{m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Reference</label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. TRF-10233"
            className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none" />
        </div>
        <button disabled={!valid}
          onClick={() => { dispatch({ type: "AP_PAY", invoiceId: inv.id, amount: amt, method, ref }); onClose(); }}
          className={cx("w-full py-2.5 rounded-lg font-display font-bold text-sm transition-all flex items-center justify-center gap-2",
            valid ? "bg-pine-700 text-pine-50 hover:bg-pine-600 active:scale-[0.98] shadow-lift" : "bg-mist text-inksoft/60 cursor-not-allowed")}>
          <ICheck size={15} /> Record payment · {money(Math.min(amt, bal))}
        </button>
      </div>
    </Modal>
  );
}

function CreditModal({ inv, onClose }: { inv: ApInvoice; onClose: () => void }) {
  const { dispatch } = usePos();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const amt = parseFloat(amount) || 0;
  return (
    <Modal onClose={onClose} width={400} labelledBy="cr-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="cr-title" className="font-display font-bold text-ink">Credit note · {inv.number}</h2>
          <p className="text-xs text-inksoft mt-0.5">Reduces the balance owed (returns, price corrections)</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Credit amount</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" autoFocus
            className="num w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-base font-semibold focus:border-pine-500 focus:outline-none" />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Reason</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. damaged goods returned"
            className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none" />
        </div>
        <button disabled={amt <= 0}
          onClick={() => { dispatch({ type: "AP_CREDIT", invoiceId: inv.id, amount: amt, note }); onClose(); }}
          className={cx("w-full py-2.5 rounded-lg font-display font-bold text-sm transition-all flex items-center justify-center gap-2",
            amt > 0 ? "bg-honey-500 text-pine-950 hover:brightness-105 active:scale-[0.98]" : "bg-mist text-inksoft/60 cursor-not-allowed")}>
          <IRecall size={14} /> Apply credit · {money(amt)}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------------------- Expenses ---------------------------- */
function ExpTab() {
  const { state, dispatch } = usePos();
  const mayAdd = can(state.user?.role, "add_expense");
  const [f, setF] = useState({ category: EXPENSE_CATEGORIES[0], amount: "", date: toISODate(Date.now()), payee: "", note: "", recurring: false });
  const amt = parseFloat(f.amount) || 0;

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    state.expenses.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [state.expenses]);
  const total = r2(state.expenses.reduce((s, e) => s + e.amount, 0));

  const exportCsv = () => {
    const head = ["date", "category", "payee", "note", "recurring", "amount"];
    const rows = state.expenses.map((e) => [toISODate(e.date), e.category, `"${e.payee}"`, `"${e.note ?? ""}"`, e.recurring ? "yes" : "no", e.amount.toFixed(2)].join(","));
    const blob = new Blob([[head.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `expenses-${toISODate(Date.now())}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      <div className="space-y-3">
        <div className="rounded-xl border border-mist bg-card p-4 shadow-lift">
          <h2 className="font-display font-bold text-ink text-[14px] mb-3">Record an expense</h2>
          {!mayAdd && <p className="text-[10px] font-bold text-inksoft bg-mist/60 rounded px-2 py-1.5 mb-2">Requires manager or admin</p>}
          <div className="space-y-2.5">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-inksoft">Category</label>
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} disabled={!mayAdd}
                className="w-full mt-0.5 px-2.5 py-1.5 rounded-md border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none disabled:opacity-50">
                {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-inksoft">Amount</label>
                <input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} disabled={!mayAdd}
                  inputMode="decimal" placeholder="0.00" className="num w-full mt-0.5 px-2.5 py-1.5 rounded-md border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none disabled:opacity-50" />
              </div>
              <div>
                <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-inksoft">Date</label>
                <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} disabled={!mayAdd}
                  className="num w-full mt-0.5 px-2.5 py-1.5 rounded-md border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none disabled:opacity-50" />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-inksoft">Payee</label>
              <input value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} disabled={!mayAdd}
                placeholder="Who was paid" className="w-full mt-0.5 px-2.5 py-1.5 rounded-md border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none disabled:opacity-50" />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-[0.12em] text-inksoft">Note</label>
              <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} disabled={!mayAdd}
                placeholder="optional" className="w-full mt-0.5 px-2.5 py-1.5 rounded-md border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none disabled:opacity-50" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={f.recurring} onChange={(e) => setF({ ...f, recurring: e.target.checked })} disabled={!mayAdd} className="w-4 h-4 accent-pine-700" />
              <span className="text-xs font-semibold text-ink">Recurring (monthly)</span>
            </label>
            <button disabled={!mayAdd || amt <= 0}
              onClick={() => {
                dispatch({ type: "EXPENSE_ADD", category: f.category, amount: amt, date: new Date(f.date + "T12:00:00").getTime(), payee: f.payee, note: f.note, recurring: f.recurring });
                setF({ ...f, amount: "", payee: "", note: "" });
              }}
              className={cx("w-full py-2 rounded-lg font-display font-bold text-sm transition-all flex items-center justify-center gap-2",
                mayAdd && amt > 0 ? "bg-pine-700 text-pine-50 hover:bg-pine-600 active:scale-[0.98]" : "bg-mist text-inksoft/60 cursor-not-allowed")}>
              <IPlus size={14} /> Add expense
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-mist bg-card p-4 shadow-lift">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft mb-2">By category · total {money(total)}</p>
          <div className="space-y-1.5">
            {byCat.map(([cat, sum]) => (
              <div key={cat} className="flex items-center justify-between text-xs">
                <span className="text-ink font-semibold">{cat}</span>
                <span className="num font-bold text-ink">{money(sum)}</span>
              </div>
            ))}
            {byCat.length === 0 && <p className="text-xs text-inksoft">No expenses yet.</p>}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-ink text-[15px]">Expense ledger</h2>
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-pine-400 hover:bg-pine-50 transition active:scale-95">
            <IDownload size={13} /> Export
          </button>
        </div>
        <div className="overflow-auto scroll-slim rounded-xl border border-mist bg-card shadow-lift">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-pine-900 text-pine-100 text-left text-[10px] uppercase tracking-[0.14em]">
                <th className="px-4 py-2.5 font-bold">Date</th>
                <th className="px-3 py-2.5 font-bold">Category</th>
                <th className="px-3 py-2.5 font-bold">Payee</th>
                <th className="px-3 py-2.5 font-bold text-right">Amount</th>
                <th className="px-4 py-2.5 font-bold" />
              </tr>
            </thead>
            <tbody>
              {[...state.expenses].sort((a, b) => b.date - a.date).map((e) => (
                <tr key={e.id} className="border-t border-mist/70 hover:bg-pine-50/50 transition-colors">
                  <td className="px-4 py-2.5 num text-inksoft">{fmtDate(e.date)}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-mist/70 text-[10px] font-bold text-ink">{e.category}</span>
                      {e.recurring && <span className="text-[9px] font-bold uppercase text-pine-700">recurring</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-ink">{e.payee}{e.note && <span className="text-inksoft text-xs"> · {e.note}</span>}</td>
                  <td className="px-3 py-2.5 text-right num font-bold text-brick-700">{money(e.amount)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {mayAdd && (
                      <button onClick={() => dispatch({ type: "EXPENSE_DELETE", id: e.id })}
                        className="p-1.5 rounded text-inksoft hover:text-brick-700 hover:bg-brick-100 transition" aria-label={`Delete ${e.id}`}>
                        <ITrash size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {state.expenses.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-inksoft">No expenses recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- P&L ---------------------------- */
function PnlTab() {
  const { state, product } = usePos();
  const [period, setPeriod] = useState<"month" | "30d" | "year">("month");
  const now = Date.now();

  const range = useMemo(() => {
    if (period === "30d") return { start: now - 30 * day, label: "Last 30 days" };
    if (period === "year") { const y = new Date(); y.setMonth(0, 1); y.setHours(0, 0, 0, 0); return { start: y.getTime(), label: "Year to date" }; }
    const m = new Date(); m.setDate(1); m.setHours(0, 0, 0, 0); return { start: m.getTime(), label: "This month" };
  }, [period, now]);

  const calc = useMemo(() => {
    const txs = state.transactions.filter((t) => t.at >= range.start && t.at <= now);
    const revenue = r2(txs.reduce((s, t) => s + t.total, 0)); /* refunds already negative */
    let cogs = 0;
    for (const t of txs) {
      const sign = t.refundOf ? -1 : 1;
      for (const l of t.lines) cogs += sign * l.qty * (product(l.productId)?.cost ?? 0);
    }
    cogs = r2(cogs);
    const expenses = r2(state.expenses.filter((e) => e.date >= range.start && e.date <= now).reduce((s, e) => s + e.amount, 0));
    const gross = r2(revenue - cogs);
    const net = r2(gross - expenses);
    return { revenue, cogs, expenses, gross, net, count: txs.filter((t) => !t.refundOf).length };
  }, [state.transactions, state.expenses, range, now, product]);

  const exportCsv = () => {
    const rows = [
      ["Period", range.label], ["Revenue (net of refunds)", calc.revenue.toFixed(2)],
      ["COGS", calc.cogs.toFixed(2)], ["Gross profit", calc.gross.toFixed(2)],
      ["Operating expenses", calc.expenses.toFixed(2)], ["Net income", calc.net.toFixed(2)],
    ].map((r) => r.join(",")).join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `pnl-${period}-${toISODate(now)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const Row = ({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: "pos" | "neg" }) => (
    <div className={cx("flex items-center justify-between px-4 py-2.5 border-b border-mist/60 last:border-0", strong && "bg-pine-50")}>
      <span className={cx("text-sm", strong ? "font-bold text-ink" : "text-inksoft font-medium")}>{label}</span>
      <span className={cx("num font-bold", strong ? "text-[15px]" : "text-sm",
        tone === "neg" ? "text-brick-700" : tone === "pos" ? "text-pine-700" : "text-ink")}>{money(value)}</span>
    </div>
  );

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-4">
      <div className="rounded-xl border border-mist bg-card shadow-lift overflow-hidden self-start">
        <div className="px-4 py-3 border-b border-mist flex items-center justify-between">
          <h2 className="font-display font-bold text-ink text-[14px]">Profit & loss</h2>
          <div className="flex items-center gap-1 bg-paper border border-mist rounded-md p-0.5">
            {(["month", "30d", "year"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cx("px-2 py-1 rounded text-[10px] font-bold transition", period === p ? "bg-pine-700 text-pine-50" : "text-inksoft hover:bg-mist/60")}>
                {p === "month" ? "Month" : p === "30d" ? "30d" : "YTD"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Row label={`Net revenue · ${calc.count} sales`} value={calc.revenue} tone="pos" />
          <Row label="Cost of goods sold" value={calc.cogs} tone="neg" />
          <Row label="Gross profit" value={calc.gross} strong />
          <Row label="Operating expenses" value={calc.expenses} tone="neg" />
          <Row label="Net income" value={calc.net} strong tone={calc.net >= 0 ? "pos" : "neg"} />
        </div>
        <div className="px-4 py-3 bg-paper/70 flex items-center justify-between">
          <span className="text-[11px] text-inksoft">Gross margin</span>
          <span className="num text-[13px] font-bold text-pine-700">
            {calc.revenue !== 0 ? `${((calc.gross / calc.revenue) * 100).toFixed(1)}%` : "—"}
          </span>
        </div>
        <div className="px-4 py-3 border-t border-mist">
          <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs font-bold text-pine-700 hover:text-pine-600 transition">
            <IDownload size={13} /> Export P&L
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-mist bg-card p-4 shadow-lift">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft mb-3">Where the money went · {range.label}</p>
          <div className="space-y-2.5">
            {[{ label: "COGS (stock)", v: calc.cogs, tone: "bg-honey-400" }, { label: "Operating expenses", v: calc.expenses, tone: "bg-brick-500" }].map((r) => {
              const max = Math.max(calc.cogs, calc.expenses, 1);
              return (
                <div key={r.label}>
                  <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-ink">{r.label}</span><span className="num font-bold text-ink">{money(r.v)}</span></div>
                  <div className="h-2.5 rounded-full bg-mist/60 overflow-hidden">
                    <div className={cx("h-full rounded-full transition-all duration-500", r.tone)} style={{ width: `${(r.v / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-mist bg-card p-4 shadow-lift">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft mb-2 flex items-center gap-1.5"><IAlert size={11} className="text-honey-600" /> How this is computed</p>
          <p className="text-xs text-inksoft leading-relaxed">
            Revenue nets refunds. COGS is valued at each product's cost for the units sold in the period (refunds credited back).
            Expenses are the operating costs you've recorded. This is a management view — it excludes tax detail by design.
          </p>
        </div>
      </div>
    </div>
  );
}
