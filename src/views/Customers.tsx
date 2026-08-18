import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { usePos, money, relTime, clockTime } from "../store";
import type { Customer } from "../data";
import { cx, Badge, Modal, Empty } from "../ui";
import { IUsers, ISearch, IPlus, IX, IChevD, IStar, IRegister, IHistory, IPill, ICheck } from "../icons";

const day = 86_400_000;

export default function Customers() {
  const { state, dispatch } = usePos();
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => {
    return state.customers
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.phone.replace(/\D/g, "").includes(needle.replace(/\D/g, "")) || needle.replace(/\D/g, "") === "")
      .map((c) => {
        const txs = state.transactions.filter((t) => t.customerId === c.id && !t.refundOf);
        const refunds = state.transactions.filter((t) => t.customerId === c.id && t.refundOf);
        const spend = txs.reduce((s, t) => s + t.total, 0) - refunds.reduce((s, t) => s + Math.abs(t.total), 0);
        return { c, visits: txs.length, spend, last: txs[0]?.at ?? null, txs };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [state.customers, state.transactions, needle]);

  const now = Date.now();
  const newThisWeek = state.customers.filter((c) => now - c.createdAt < 7 * day).length;
  const totalPoints = state.customers.reduce((s, c) => s + c.points, 0);
  const loyal = rows.filter((r) => r.visits >= 3).length;

  return (
    <div className="h-full flex flex-col px-6 py-5 min-h-0">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 min-w-[420px]">
          <Kpi label="Customers on book" value={String(state.customers.length)} />
          <Kpi label="New this week" value={String(newThisWeek)} accent={newThisWeek > 0} />
          <Kpi label="Regulars · 3+ visits" value={String(loyal)} />
          <Kpi label="Loyalty pts in play" value={totalPoints.toLocaleString()} star />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-60">
            <ISearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-inksoft" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-mist text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition" />
          </div>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95 shadow-lift">
            <IPlus size={14} /> New customer
          </button>
        </div>
      </div>

      <div className="mt-4 flex-1 min-h-0 overflow-y-auto scroll-slim rounded-xl border border-mist bg-card shadow-lift">
        {rows.length === 0 ? (
          <Empty icon={<IUsers size={22} />} title="No customers match" hint="Try another name or phone number." />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-pine-900 text-pine-100 text-left text-[10px] uppercase tracking-[0.14em]">
                <th className="px-4 py-2.5 font-bold">Customer</th>
                <th className="px-3 py-2.5 font-bold">Contact</th>
                <th className="px-3 py-2.5 font-bold text-center">Visits</th>
                <th className="px-3 py-2.5 font-bold text-right">Lifetime spend</th>
                <th className="px-3 py-2.5 font-bold text-center">Points</th>
                <th className="px-3 py-2.5 font-bold">Last visit</th>
                <th className="px-4 py-2.5 font-bold" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, visits, spend, last, txs }) => (
                <CustomerRow key={c.id} c={c} visits={visits} spend={spend} last={last} txs={txs}
                  expanded={expanded === c.id}
                  onToggle={() => setExpanded(expanded === c.id ? null : c.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-2 text-[11px] text-inksoft flex items-center gap-1.5">
        <IPill size={12} /> Earn 1 pt per $1 · redeem 100 pts = $5 at the till · expand a row for full purchase history
      </p>

      {adding && <AddCustomerModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function CustomerRow({ c, visits, spend, last, txs, expanded, onToggle }: {
  c: Customer; visits: number; spend: number; last: number | null;
  txs: { id: string; at: number; total: number; lines: { name: string; qty: number }[]; refundOf?: string }[];
  expanded: boolean; onToggle: () => void;
}) {
  const { dispatch } = usePos();
  const tier = c.points >= 300 ? "Gold" : c.points >= 100 ? "Silver" : "Bronze";
  const tierTone = c.points >= 300 ? "bg-honey-100 text-honey-700 border-honey-300/60" : c.points >= 100 ? "bg-mist/60 text-ink border-mist" : "bg-brick-100/60 text-brick-700 border-brick-200/60";
  return (
    <>
      <tr onClick={onToggle}
        className={cx("border-t border-mist/70 cursor-pointer transition-colors hover:bg-pine-50/70", expanded && "bg-pine-50/60")}>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-pine-800 text-pine-100 font-display font-bold text-xs shrink-0">
              {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <div className="min-w-0">
              <p className="font-bold text-ink truncate">{c.name}</p>
              <p className="text-[10px] text-inksoft flex items-center gap-1">
                <span className={cx("px-1.5 py-px rounded border text-[9px] font-bold", tierTone)}>{tier}</span>
                {c.notes && <span className="truncate">· {c.notes}</span>}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <p className="num text-xs text-ink">{c.phone}</p>
          <p className="text-[10px] text-inksoft">{c.email ?? "no email on file"}</p>
        </td>
        <td className="px-3 py-2.5 text-center num font-bold text-ink">{visits}</td>
        <td className="px-3 py-2.5 text-right num font-bold text-pine-800">{money(spend)}</td>
        <td className="px-3 py-2.5 text-center">
          <span className="inline-flex items-center gap-1 num text-xs font-bold text-honey-700">
            <IStar size={11} className="text-honey-500" />{c.points}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs text-inksoft">{last ? relTime(last) : "—"}</td>
        <td className="px-4 py-2.5 text-right">
          <span className="inline-flex items-center gap-2">
            <IChevD size={13} className={cx("text-inksoft transition-transform duration-200", expanded && "rotate-180")} />
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-pine-100 bg-paper/70">
          <td colSpan={7} className="px-6 py-3">
            <div className="flex items-center gap-2 flex-wrap mb-2.5">
              <Badge tone="mist"><IHistory size={10} /> {visits} receipt{visits === 1 ? "" : "s"}</Badge>
              <Badge tone="pine">member since {relTime(c.createdAt)}</Badge>
              <button onClick={(e) => { e.stopPropagation(); dispatch({ type: "SET_SALE_CUSTOMER", id: c.id }); dispatch({ type: "GO", view: "register" }); dispatch({ type: "TOAST", kind: "info", msg: `${c.name} attached to the open sale` }); }}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-pine-700 text-pine-50 text-[11px] font-bold hover:bg-pine-600 transition active:scale-95">
                <IRegister size={11} /> Start sale for {c.name.split(" ")[0]}
              </button>
            </div>
            {txs.length === 0 ? (
              <p className="text-xs text-inksoft">No purchases yet — attach them at the register to begin earning points.</p>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {txs.slice(0, 9).map((t) => (
                  <div key={t.id} className="rounded-lg border border-mist bg-card px-3 py-2 text-xs">
                    <div className="flex justify-between items-baseline">
                      <span className="num font-bold text-ink">{t.id}</span>
                      <span className="num font-bold text-pine-800">{money(t.total)}</span>
                    </div>
                    <p className="text-[10px] text-inksoft num">{new Date(t.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {clockTime(t.at)}</p>
                    <p className="text-[10px] text-inksoft truncate mt-0.5">{t.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</p>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function AddCustomerModal({ onClose }: { onClose: () => void }) {
  const { dispatch } = usePos();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const ok = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 7;
  return (
    <Modal onClose={onClose} width={440} labelledBy="cust-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="cust-title" className="font-display font-bold text-ink flex items-center gap-2">
            <IUsers size={17} className="text-pine-700" /> New customer
          </h2>
          <p className="text-xs text-inksoft mt-0.5">Joins the loyalty book — earns points immediately</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3">
        <Field label="Full name *"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amara Diallo" className={inputCls} /></Field>
        <Field label="Phone *"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" className={cx(inputCls, "num")} /></Field>
        <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" className={inputCls} /></Field>
        <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="allergies, pickup preferences…" className={inputCls} /></Field>
        <button disabled={!ok}
          onClick={() => { dispatch({ type: "ADD_CUSTOMER", name, phone, email, notes }); onClose(); }}
          className={cx("w-full py-2.5 rounded-lg font-display font-bold text-sm transition-all flex items-center justify-center gap-2",
            ok ? "bg-pine-700 text-pine-50 hover:bg-pine-600 active:scale-[0.98] shadow-lift" : "bg-mist text-inksoft cursor-not-allowed")}>
          <ICheck size={15} /> Add to customer book
        </button>
      </div>
    </Modal>
  );
}

const inputCls = "w-full px-3 py-2.5 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Kpi({ label, value, accent, star }: { label: string; value: string; accent?: boolean; star?: boolean }) {
  return (
    <div className={cx("rounded-xl border px-3.5 py-2.5", accent ? "bg-pine-800 border-pine-800 text-pine-50" : "bg-card border-mist")}>
      <p className={cx("text-[10px] font-bold uppercase tracking-[0.14em] flex items-center gap-1", accent ? "text-pine-200" : "text-inksoft")}>
        {star && <IStar size={10} className="text-honey-500" />}{label}
      </p>
      <p className={cx("num text-lg font-bold leading-tight", accent ? "text-pine-50" : "text-ink")}>{value}</p>
    </div>
  );
}
