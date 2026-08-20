import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { usePos, money, relTime, clockTime } from "../store";
import { ALLERGENS, can } from "../data";
import type { Customer } from "../data";
import { cx, Badge, Modal, Empty, CustomFieldsBlock } from "../ui";
import { IUsers, ISearch, IPlus, IX, IChevD, IStar, IRegister, IHistory, IPill, ICheck, IAlert } from "../icons";

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
    <div className="h-full flex flex-col px-3 sm:px-6 py-4 sm:py-5 min-h-0">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 flex-1 w-full md:w-auto md:min-w-[420px]">
          <Kpi label="Customers on book" value={String(state.customers.length)} />
          <Kpi label="New this week" value={String(newThisWeek)} accent={newThisWeek > 0} />
          <Kpi label="Regulars · 3+ visits" value={String(loyal)} />
          <Kpi label="Loyalty pts in play" value={totalPoints.toLocaleString()} star />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-60">
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

      <div className="mt-4 flex-1 min-h-0 overflow-auto scroll-slim rounded-xl border border-mist bg-card shadow-lift">
        {rows.length === 0 ? (
          <Empty icon={<IUsers size={22} />} title="No customers match" hint="Try another name or phone number." />
        ) : (
          <table className="w-full text-sm border-collapse min-w-[880px]">
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
  const [profileOpen, setProfileOpen] = useState(false);
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
              <button onClick={(e) => { e.stopPropagation(); setProfileOpen(true); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-pine-300 bg-pine-50 text-pine-700 text-[11px] font-bold hover:bg-pine-100 transition active:scale-95">
                <IUsers size={11} /> Full profile
              </button>
              <button onClick={(e) => { e.stopPropagation(); dispatch({ type: "SET_SALE_CUSTOMER", id: c.id }); dispatch({ type: "GO", view: "register" }); dispatch({ type: "TOAST", kind: "info", msg: `${c.name} attached to the open sale` }); }}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-pine-700 text-pine-50 text-[11px] font-bold hover:bg-pine-600 transition active:scale-95">
                <IRegister size={11} /> Start sale for {c.name.split(" ")[0]}
              </button>
            </div>
            {profileOpen && <ProfileModal c={c} onClose={() => setProfileOpen(false)} />}
            <div className="mb-2.5">
              <CustomFieldsBlock fields={c.fields ?? []} suggestions={["Preferred pickup", "Insurance plan", "Delivery zone", "VIP note"]} listId={`cf-${c.id}`}
                onSave={(k, v) => dispatch({ type: "SET_FIELD", target: "customer", id: c.id, field: { key: k, value: v } })}
                onRemove={(k) => dispatch({ type: "CLEAR_FIELD", target: "customer", id: c.id, key: k })} />
            </div>
            <div className="mb-2.5">
              <AllergyEditor customerId={c.id} allergies={c.allergies ?? []} />
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

/* Structured allergen profile — screened against every Rx and OTC sale (§3) */
function AllergyEditor({ customerId, allergies }: { customerId: string; allergies: string[] }) {
  const { dispatch } = usePos();
  const [custom, setCustom] = useState("");
  const toggle = (a: string) =>
    dispatch({ type: "CUSTOMER_ALLERGIES", id: customerId, allergies: allergies.includes(a) ? allergies.filter((x) => x !== a) : [...allergies, a] });
  const addCustom = () => {
    const v = custom.trim();
    if (!v || allergies.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    dispatch({ type: "CUSTOMER_ALLERGIES", id: customerId, allergies: [...allergies, v] });
    setCustom("");
  };
  return (
    <div className="rounded-lg border border-brick-200/70 bg-brick-100/30 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brick-700 flex items-center gap-1.5">
        <IAlert size={11} /> Allergies on file · {allergies.length || "none"}
      </p>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {ALLERGENS.map((a) => {
          const on = allergies.includes(a);
          return (
            <button key={a} onClick={() => toggle(a)}
              className={cx("px-2 py-1 rounded-md border text-[10px] font-bold transition-all active:scale-95",
                on ? "bg-brick-600 border-brick-600 text-paper shadow-lift" : "bg-card border-mist text-inksoft hover:border-brick-400 hover:text-brick-700")}>
              {on && <ICheck size={9} className="inline mr-1 -mt-px" />}{a}
            </button>
          );
        })}
        {allergies.filter((x) => !ALLERGENS.includes(x)).map((x) => (
          <button key={x} onClick={() => toggle(x)}
            className="px-2 py-1 rounded-md bg-brick-600 border border-brick-600 text-paper text-[10px] font-bold transition-all active:scale-95 shadow-lift">
            <ICheck size={9} className="inline mr-1 -mt-px" />{x}
          </button>
        ))}
        <input value={custom} onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustom()}
          placeholder="+ other allergen"
          className="px-2 py-1 rounded-md border border-dashed border-brick-300 bg-card text-[10px] font-semibold w-28 focus:outline-none focus:border-brick-500 transition" />
      </div>
    </div>
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

/* ---------------- full patient profile (§7) ---------------- */
const pIn = "w-full px-2.5 py-2 rounded-lg border border-mist bg-card text-xs focus:border-pine-500 focus:outline-none transition";

function ProfileModal({ c, onClose }: { c: Customer; onClose: () => void }) {
  const { state, dispatch, prescriber } = usePos();
  const clinical = can(state.user?.role, "verify_rx"); /* pharmacist-scoped (§3 HIPAA) */
  const [f, setF] = useState({
    dob: c.dob ?? "", gender: c.gender ?? "", address: c.address ?? "",
    bloodType: c.bloodType ?? "", primaryPrescriberId: c.primaryPrescriberId ?? "",
    insurancePlan: c.insurancePlan ?? "", clinicalNotes: c.clinicalNotes ?? "",
  });
  const dirty = f.dob !== (c.dob ?? "") || f.gender !== (c.gender ?? "") || f.address !== (c.address ?? "")
    || f.bloodType !== (c.bloodType ?? "") || f.primaryPrescriberId !== (c.primaryPrescriberId ?? "")
    || f.insurancePlan !== (c.insurancePlan ?? "") || f.clinicalNotes !== (c.clinicalNotes ?? "");

  /* medication history — Rx scripts + dispensed purchases for this patient */
  const meds = useMemo(() => {
    const fromRx = state.prescriptions
      .filter((r) => r.patient.toLowerCase() === c.name.toLowerCase())
      .map((r) => ({ id: r.id, name: state.products.find((p) => p.id === r.productId)?.name ?? r.productId, when: r.createdAt, tag: r.status }));
    const fromSales = state.transactions
      .filter((t) => t.customerId === c.id && !t.refundOf)
      .flatMap((t) => t.lines.filter((l) => l.rx).map((l) => ({ id: t.id, name: l.name, when: t.at, tag: "filled" })));
    return [...fromRx, ...fromSales].sort((a, b) => b.when - a.when).slice(0, 8);
  }, [state.prescriptions, state.transactions, state.products, c]);

  const age = f.dob ? Math.max(0, Math.floor((Date.now() - new Date(f.dob + "T00:00:00").getTime()) / (365.25 * 86_400_000))) : null;

  return (
    <Modal onClose={onClose} width={620} labelledBy="prof-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-pine-800 text-pine-100 font-display font-bold text-sm">
            {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </span>
          <div>
            <h2 id="prof-title" className="font-display font-bold text-ink">{c.name}</h2>
            <p className="text-[11px] text-inksoft num">{c.phone} · {c.id}{age !== null && <> · <span className="font-bold text-ink">{age}y</span></>}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>

      <div className="p-5 grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Date of birth</span>
          <input type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} className={cx(pIn, "num mt-1")} />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Gender</span>
          <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} className={cx(pIn, "mt-1")}>
            <option value="">—</option><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Address</span>
          <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Street, city" className={cx(pIn, "mt-1")} />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Blood type</span>
          <select value={f.bloodType} onChange={(e) => setF({ ...f, bloodType: e.target.value })} className={cx(pIn, "mt-1")}>
            <option value="">—</option>{["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"].map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Insurance plan</span>
          <input value={f.insurancePlan} onChange={(e) => setF({ ...f, insurancePlan: e.target.value })} placeholder="e.g. BlueCross PBM" className={cx(pIn, "mt-1")} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Primary prescriber</span>
          <select value={f.primaryPrescriberId} onChange={(e) => setF({ ...f, primaryPrescriberId: e.target.value })} className={cx(pIn, "mt-1")}>
            <option value="">—</option>
            {state.prescribers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.specialty}</option>)}
          </select>
        </label>

        <div className="sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft flex items-center gap-1.5">
            <IAlert size={10} className="text-brick-600" /> Allergens on file · {(c.allergies ?? []).length || "none"}
          </span>
          <div className="mt-1 flex gap-1.5 flex-wrap">
            {(c.allergies ?? []).length === 0 && <span className="text-[11px] text-inksoft">No known allergies recorded.</span>}
            {(c.allergies ?? []).map((a) => <span key={a} className="px-2 py-0.5 rounded-md bg-brick-100 border border-brick-300/60 text-brick-700 text-[10px] font-bold">{a}</span>)}
          </div>
        </div>

        <label className="block sm:col-span-2">
          <span className={cx("text-[10px] font-bold uppercase tracking-[0.14em] flex items-center gap-1.5", clinical ? "text-pine-700" : "text-inksoft")}>
            <IPill size={10} /> Clinical notes {clinical ? "· pharmacist view" : "· 🔒 pharmacist only"}
          </span>
          <textarea value={clinical ? f.clinicalNotes : "••••••••••"} disabled={!clinical} rows={2}
            onChange={(e) => setF({ ...f, clinicalNotes: e.target.value })}
            className={cx(pIn, "mt-1 resize-none", !clinical && "text-inksoft select-none")} />
        </label>

        <div className="sm:col-span-2 rounded-lg border border-mist bg-paper/70 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-1.5">Medication history</p>
          {meds.length === 0 ? <p className="text-[11px] text-inksoft">No prescriptions or ℞ purchases on record.</p> : (
            <div className="space-y-1">
              {meds.map((m, i) => (
                <div key={`${m.id}-${i}`} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-ink truncate">{m.name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="px-1.5 py-px rounded bg-pine-100 text-pine-700 text-[9px] font-bold uppercase">{m.tag}</span>
                    <span className="num text-inksoft">{relTime(m.when)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3.5 border-t border-mist flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-mist text-xs font-semibold text-inksoft hover:text-ink transition">Close</button>
        <button disabled={!dirty}
          onClick={() => {
            dispatch({
              type: "CUSTOMER_PROFILE", id: c.id,
              patch: {
                dob: f.dob || undefined, gender: (f.gender || undefined) as Customer["gender"],
                address: f.address || undefined, bloodType: f.bloodType || undefined,
                primaryPrescriberId: f.primaryPrescriberId || undefined,
                insurancePlan: f.insurancePlan || undefined, clinicalNotes: f.clinicalNotes || undefined,
              },
            });
            onClose();
          }}
          className={cx("flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition active:scale-95",
            dirty ? "bg-pine-700 text-pine-50 hover:bg-pine-600 shadow-lift" : "bg-mist text-inksoft cursor-not-allowed")}>
          <ICheck size={13} /> Save profile
        </button>
      </div>
    </Modal>
  );
}
