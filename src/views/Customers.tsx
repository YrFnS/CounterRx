import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { usePos, money, relTime, clockTime } from "../store";
import { patientProfilePayload } from "../store";
import { ALLERGENS, can, outstandingBalance, normalizeAllergies, medHistory } from "../data";
import type { Customer, AllergyEntry, ConditionEntry } from "../data";
import { cx, Badge, Modal, Empty, CustomFieldsBlock } from "../ui";
import { IUsers, ISearch, IPlus, IX, IChevD, IStar, IRegister, IHistory, IPill, ICheck, IAlert, IPrint } from "../icons";

const day = 86_400_000;

export default function Customers() {
  const { t } = useTranslation();
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

  /* W3.1 — customers whose linked store-credit balance fell below the org threshold */
  const threshold = state.settings.notifications.creditLowThreshold;
  const creditLow = state.storeCredits
    .filter((sc) => sc.customerId && sc.balance > 0 && sc.balance <= threshold)
    .map((sc) => ({ c: state.customers.find((x) => x.id === sc.customerId)!, balance: sc.balance }))
    .filter((x) => x.c);
  const [notified, setNotified] = useState<Set<string>>(new Set());

  return (
    <div className="h-full flex flex-col px-3 sm:px-6 py-4 sm:py-5 min-h-0">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 flex-1 w-full md:w-auto md:min-w-[420px]">
          <Kpi label={t("customers.onBook")} value={String(state.customers.length)} />
          <Kpi label={t("customers.newThisWeek")} value={String(newThisWeek)} accent={newThisWeek > 0} />
          <Kpi label={t("customers.regulars")} value={String(loyal)} />
          <Kpi label={t("customers.loyaltyInPlay")} value={totalPoints.toLocaleString()} star />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-60">
            <ISearch size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-inksoft" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("customers.search")}
              className="w-full ps-9 pe-3 py-2 rounded-lg bg-card border border-mist text-sm focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition" />
          </div>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95 shadow-lift">
            <IPlus size={14} /> New customer
          </button>
        </div>
      </div>

      <div className="mt-4 flex-1 min-h-0 overflow-auto scroll-slim rounded-xl border border-mist bg-card shadow-lift">
        {/* W3.1 — store-credit-low banner: customers below the org threshold get a one-click notify */}
        {creditLow.length > 0 && (
          <div className="m-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-brick-300/60 bg-brick-50 px-4 py-3 anim-fade-up">
            <IAlert size={14} className="text-brick-700 shrink-0" />
            <span className="text-xs font-bold text-brick-700">{t("customers.creditLow", { count: creditLow.length, threshold: money(threshold) })}</span>
            <div className="flex flex-wrap gap-1.5 ms-auto">
              {creditLow.map(({ c, balance }) => {
                const sent = notified.has(c.id);
                return (
                  <button key={c.id}
                    onClick={() => { dispatch({ type: "NOTIFY_SEND", kind: "creditLow", to: c.phone || c.email || c.name, vars: { customer: c.name, balance: money(balance) } }); setNotified((s) => new Set(s).add(c.id)); }}
                    className={cx("px-2.5 py-1 rounded-md text-[11px] font-bold border transition active:scale-95",
                      sent ? "border-pine-200 bg-pine-50 text-pine-700" : "border-brick-300 bg-card text-brick-700 hover:bg-brick-100")}>
                    {sent ? <ICheck size={11} className="inline" /> : "✉"} {c.name} · {money(balance)}
                  </button>);
              })}
            </div>
          </div>
        )}
        {rows.length === 0 ? (
          <Empty icon={<IUsers size={22} />} title={t("customers.noMatch")} hint={t("customers.noMatchHint")} />
        ) : (
          <table className="w-full text-sm border-collapse min-w-[880px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-pine-900 text-pine-100 text-start text-[10px] uppercase tracking-[0.14em]">
                <th className="px-4 py-2.5 font-bold">Customer</th>
                <th className="px-3 py-2.5 font-bold">Contact</th>
                <th className="px-3 py-2.5 font-bold text-center">Visits</th>
                <th className="px-3 py-2.5 font-bold text-end">Lifetime spend</th>
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
  const { t } = useTranslation();
  const { dispatch, state } = usePos();
  const { money } = usePos();
  const [profileOpen, setProfileOpen] = useState(false);
  const tier = c.points >= 300 ? "Gold" : c.points >= 100 ? "Silver" : "Bronze";
  const tierTone = c.points >= 300 ? "bg-honey-100 text-honey-700 border-honey-300/60" : c.points >= 100 ? "bg-mist/60 text-ink border-mist" : "bg-brick-100/60 text-brick-700 border-brick-200/60";
  const balance = outstandingBalance(c.id, state.transactions);
  const hasBalance = balance > 0;
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
                {hasBalance && (
                  <span className={cx("px-1.5 py-px rounded border text-[9px] font-bold", "bg-brick-100 text-brick-700 border-brick-300/60")}>
                    {t("pos.payLaterBalance")}: {money(balance)}
                  </span>
                )}
              </p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <p className="num text-xs text-ink">{c.phone}</p>
          <p className="text-[10px] text-inksoft">{c.email ?? "no email on file"}</p>
        </td>
        <td className="px-3 py-2.5 text-center num font-bold text-ink">{visits}</td>
        <td className="px-3 py-2.5 text-end num font-bold text-pine-800">{money(spend)}</td>
        <td className="px-3 py-2.5 text-center">
          <span className="inline-flex items-center gap-1 num text-xs font-bold text-honey-700">
            <IStar size={11} className="text-honey-500" />{c.points}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs text-inksoft">{last ? relTime(last) : "—"}</td>
        <td className="px-4 py-2.5 text-end">
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
            <div className="mb-2.5">
              <ConditionsEditor conditions={c.conditions ?? []} onSave={(conditions) => dispatch({ type: "PATIENT_CONDITIONS", id: c.id, conditions })} />
            </div>
            <NotesTimeline notes={c.patientNotes ?? []} onAdd={(text) => dispatch({ type: "ADD_PATIENT_NOTE", id: c.id, text })} />
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

/* Structured allergen profile — screened against every Rx and OTC sale (§3).
 * W3.6: per-entry severity + reaction; archived entries kept on file, never screen. */
function AllergyEditor({ customerId, allergies }: { customerId: string; allergies: Customer["allergies"] }) {
  const { t } = useTranslation();
  const { dispatch } = usePos();
  const [custom, setCustom] = useState("");
  const [sev, setSev] = useState<AllergyEntry["severity"]>("moderate");
  const [reaction, setReaction] = useState("");
  const raw = allergies ?? [];
  /* legacy plain strings stay as-is; new entries are structured */
  const entries: AllergyEntry[] = normalizeAllergies(allergies);
  const activeRaw = raw.filter((a) => !(typeof a !== "string" && a.archived));
  const archived = raw.filter((a): a is AllergyEntry => typeof a !== "string" && !!a.archived);
  const save = (list: (string | AllergyEntry)[]) =>
    dispatch({ type: "CUSTOMER_ALLERGIES", id: customerId, allergies: list });
  const toggle = (name: string) => {
    if (!entries.some((x) => x.allergen.toLowerCase() === name.toLowerCase())) {
      save([...activeRaw, { allergen: name, severity: sev, ...(reaction.trim() ? { reaction: reaction.trim() } : {}) }]);
    } else {
      save(activeRaw.filter((a) => (typeof a === "string" ? a : a.allergen).toLowerCase() !== name.toLowerCase()));
    }
    setReaction("");
  };
  const addCustom = () => {
    const v = custom.trim();
    if (!v || entries.some((x) => x.allergen.toLowerCase() === v.toLowerCase())) return;
    toggle(v);
    setCustom("");
  };
  return (
    <div className="rounded-lg border border-brick-200/70 bg-brick-100/30 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brick-700 flex items-center gap-1.5">
        <IAlert size={11} /> {t("patients.allergyFile")} · {entries.length || t("patients.none")}
      </p>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {ALLERGENS.map((a) => {
          const hit = entries.find((x) => x.allergen.toLowerCase() === a.toLowerCase());
          return (
            <button key={a} onClick={() => toggle(a)} title={hit?.reaction || t(`patients.sev.${hit?.severity ?? "moderate"}`)}
              className={cx("px-2 py-1 rounded-md border text-[10px] font-bold transition-all active:scale-95",
                hit ? "bg-brick-600 border-brick-600 text-paper shadow-lift" : "bg-card border-mist text-inksoft hover:border-brick-400 hover:text-brick-700")}>
              {hit && <ICheck size={9} className="inline me-1 -mt-px" />}{a}
              {hit && <span className="ms-1 uppercase opacity-80">{t(`patients.sev.${hit.severity}`)[0]}</span>}
            </button>
          );
        })}
        {entries.filter((x) => !ALLERGENS.some((a) => a.toLowerCase() === x.allergen.toLowerCase())).map((x) => (
          <span key={x.allergen} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brick-600 border border-brick-600 text-paper text-[10px] font-bold shadow-lift">
            {x.reaction && <span title={x.reaction}>⚠</span>}{x.allergen}
            <span className="uppercase opacity-80">{t(`patients.sev.${x.severity}`)[0]}</span>
            <button onClick={() => toggle(x.allergen)} aria-label={t("common.delete")} className="hover:bg-paper/20 rounded"><IX size={9} /></button>
          </span>
        ))}
        <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()}
          placeholder={t("patients.otherAllergen")}
          className="px-2 py-1 rounded-md border border-dashed border-brick-300 bg-card text-[10px] font-semibold w-28 focus:outline-none focus:border-brick-500 transition" />
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-brick-700">
          {t("patients.severity")}
          <select value={sev} onChange={(e) => setSev(e.target.value as AllergyEntry["severity"])}
            className="px-1.5 py-1 rounded-md border border-mist bg-card text-[10px] focus:outline-none">
            {(SEVERITIES).map((s) => <option key={s} value={s}>{t(`patients.sev.${s}`)}</option>)}
          </select>
        </label>
        <input value={reaction} onChange={(e) => setReaction(e.target.value)} placeholder={t("patients.reactionPh")}
          className="px-2 py-1 rounded-md border border-dashed border-mist bg-card text-[10px] w-40 focus:outline-none focus:border-brick-500 transition" />
        {archived.length > 0 && (
          <span className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-inksoft">{t("patients.archived")}:</span>
            {archived.map((x) => (
              <button key={x.allergen} onClick={() => save(raw.map((a) => (typeof a !== "string" && a.allergen === x.allergen ? { ...a, archived: false } : a)))}
                className="px-2 py-0.5 rounded-md border border-mist bg-mist/40 text-inksoft text-[10px] font-bold line-through hover:text-ink transition">{x.allergen}</button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

/* Diagnosed conditions — free-text name + optional ICD-style code (W3.6) */
function ConditionsEditor({ conditions, onSave }: { conditions: ConditionEntry[]; onSave: (c: ConditionEntry[]) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const add = () => {
    const n = name.trim();
    if (!n || conditions.some((c) => c.name.toLowerCase() === n.toLowerCase())) return;
    onSave([...conditions, { name: n, ...(code.trim() && { code: code.trim() }) }]);
    setName(""); setCode("");
  };
  return (
    <div className="rounded-lg border border-pine-200/70 bg-pine-50/50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-pine-700 flex items-center gap-1.5">
        <IPill size={11} /> {t("patients.conditions")} · {conditions.length || t("patients.none")}
      </p>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {conditions.length === 0 && <span className="text-[11px] text-inksoft">{t("patients.noConditions")}</span>}
        {conditions.map((c, i) => (
          <span key={`${c.name}-${i}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-card border border-pine-300 text-[10px] font-bold text-ink shadow-lift">
            {c.code && <span className="num text-pine-700">{c.code}</span>} {c.name}
            <button onClick={() => onSave(conditions.filter((_, j) => j !== i))} aria-label={t("common.delete")} className="text-inksoft hover:text-brick-700"><IX size={9} /></button>
          </span>
        ))}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("patients.conditionName")} onKeyDown={(e) => e.key === "Enter" && add()}
          className="px-2 py-1 rounded-md border border-dashed border-pine-300 bg-card text-[10px] font-semibold w-36 focus:outline-none focus:border-pine-500 transition" />
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("patients.icdCode")} onKeyDown={(e) => e.key === "Enter" && add()}
          className="px-2 py-1 rounded-md border border-dashed border-mist bg-card text-[10px] num w-20 focus:outline-none focus:border-pine-500 transition" />
      </div>
    </div>
  );
}

/* Chronological clinical notes timeline (W3.6) — newest first, staff-attributed */
function NotesTimeline({ notes, onAdd }: { notes: Customer["patientNotes"]; onAdd: (text: string) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const submit = () => { if (!draft.trim()) return; onAdd(draft); setDraft(""); };
  return (
    <div className="rounded-lg border border-mist bg-card px-3 py-2.5 mb-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft flex items-center gap-1.5">
        <IHistory size={11} /> {t("patients.notesTimeline")} · {notes?.length || 0}
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("patients.notePh")} onKeyDown={(e) => e.key === "Enter" && submit()}
          className="flex-1 px-2.5 py-1.5 rounded-md border border-dashed border-mist bg-paper/60 text-[11px] focus:outline-none focus:border-pine-500 transition" />
        <button onClick={submit} disabled={!draft.trim()}
          className={cx("px-2.5 py-1.5 rounded-md text-[10px] font-bold transition active:scale-95",
            draft.trim() ? "bg-pine-700 text-pine-50 hover:bg-pine-600" : "bg-mist text-inksoft cursor-not-allowed")}>{t("patients.addNote")}</button>
      </div>
      {notes && notes.length > 0 && (
        <ol className="mt-2.5 space-y-1.5 max-h-44 overflow-auto scroll-slim">
          {notes.map((n, i) => (
            <li key={`${n.at}-${i}`} className="flex gap-2 text-[11px]">
              <span aria-hidden className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-pine-500" />
              <span className="min-w-0">
                <span className="font-bold text-ink">{n.author || "—"}</span>
                <span className="text-inksoft num ms-1.5">{relTime(n.at)} · {clockTime(n.at)}</span>
                <span className="block text-ink leading-snug">{n.text}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
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

const SEVERITIES = ["mild", "moderate", "severe"] as const;

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
  const { t } = useTranslation();
  const clinical = can(state.user?.role, "verify_rx"); /* pharmacist-scoped (§3 HIPAA) */
  const [f, setF] = useState({
    dob: c.dob ?? "", gender: c.gender ?? "", address: c.address ?? "",
    bloodType: c.bloodType ?? "", primaryPrescriberId: c.primaryPrescriberId ?? "",
    insurancePlan: c.insurancePlan ?? "", clinicalNotes: c.clinicalNotes ?? "",
  });
  const dirty = f.dob !== (c.dob ?? "") || f.gender !== (c.gender ?? "") || f.address !== (c.address ?? "")
    || f.bloodType !== (c.bloodType ?? "") || f.primaryPrescriberId !== (c.primaryPrescriberId ?? "")
    || f.insurancePlan !== (c.insurancePlan ?? "") || f.clinicalNotes !== (c.clinicalNotes ?? "");

  /* medication history — Rx scripts + dispensed purchases for this patient (W3.6 shared derivation) */
  const meds = useMemo(
    () => medHistory(c.name, c.id, state.prescriptions, state.transactions, state.products).slice(0, 8),
    [state.prescriptions, state.transactions, state.products, c]);

  const age = f.dob ? Math.max(0, Math.floor((Date.now() - new Date(f.dob + "T00:00:00").getTime()) / (365.25 * 86_400_000))) : null;

  /* print patient profile (W3.6): payload from the shared builder, rendered into
   * #print-root (the only visible region under @media print), then window.print() */
  const [printing, setPrinting] = useState(false);
  const printProfile = () => {
    if (!patientProfilePayload(state, c.id)) return;
    setPrinting(true);
  };
  useEffect(() => {
    if (!printing) return;
    window.print();
    setPrinting(false);
  }, [printing]);

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
            {state.prescribers.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.specialty}</option>)}
          </select>
        </label>

        <div className="sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft flex items-center gap-1.5">
            <IAlert size={10} className="text-brick-600" /> {t("patients.allergyFile")} · {normalizeAllergies(c.allergies).length || t("patients.none")}
          </span>
          <div className="mt-1 flex gap-1.5 flex-wrap">
            {normalizeAllergies(c.allergies).length === 0 && <span className="text-[11px] text-inksoft">{t("patients.noAllergies")}</span>}
            {normalizeAllergies(c.allergies).map((a) => (
              <span key={a.allergen} className="px-2 py-0.5 rounded-md bg-brick-100 border border-brick-300/60 text-brick-700 text-[10px] font-bold">
                {a.allergen} · {t(`patients.sev.${a.severity}`)}{a.reaction ? ` · ${a.reaction}` : ""}
              </span>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft flex items-center gap-1.5">
            <IPill size={10} className="text-pine-700" /> {t("patients.conditions")} · {(c.conditions ?? []).length || t("patients.none")}
          </span>
          <div className="mt-1 flex gap-1.5 flex-wrap">
            {(c.conditions ?? []).length === 0 && <span className="text-[11px] text-inksoft">{t("patients.noConditions")}</span>}
            {(c.conditions ?? []).map((cond, i) => (
              <span key={`${cond.name}-${i}`} className="px-2 py-0.5 rounded-md bg-pine-50 border border-pine-200/70 text-pine-700 text-[10px] font-bold">
                {cond.code && <span className="num">{cond.code}</span>} {cond.name}
              </span>
            ))}
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
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-1.5">{t("patients.medHistory")}</p>
          {meds.length === 0 ? <p className="text-[11px] text-inksoft">{t("patients.noMeds")}</p> : (
            <div className="space-y-1">
              {meds.map((m, i) => (
                <div key={`${m.rxRef}-${i}`} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-ink truncate">{m.product}<span className="text-inksoft font-normal num ms-1.5">×{m.qty}</span></span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="px-1.5 py-px rounded bg-pine-100 text-pine-700 text-[9px] font-bold uppercase">{m.source === "rx" ? t("patients.rxRef") : t("patients.saleTag")} · {m.rxRef}</span>
                    <span className="num text-inksoft">{relTime(m.at)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3.5 border-t border-mist flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-mist text-xs font-semibold text-inksoft hover:text-ink transition">Close</button>
        <button onClick={printProfile}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-pine-300 bg-pine-50 text-pine-700 text-xs font-bold hover:bg-pine-100 transition active:scale-95">
          <IPrint size={13} /> {t("patients.printProfile")}
        </button>
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
      {printing && createPortal(<PrintProfile state={state} customerId={c.id} />, document.body)}
    </Modal>
  );
}

/* Hidden print sheet — #print-root is the sole visible region under @media print.
 * Demographics + med history + allergies + conditions + notes timeline. */
function PrintProfile({ state, customerId }: { state: Parameters<typeof patientProfilePayload>[0]; customerId: string }) {
  const { t } = useTranslation();
  const p = patientProfilePayload(state, customerId);
  if (!p) return null;
  const c = p.customer;
  const age = c.dob ? Math.max(0, Math.floor((Date.now() - new Date(c.dob + "T00:00:00").getTime()) / (365.25 * 86_400_000))) : null;
  return (
    <div id="print-root">
      <div id="receipt-print" style={{ fontFamily: "ui-sans-serif, system-ui", fontSize: 11, color: "#111" }}>
        <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 2px" }}>{p.orgName} — {t("patients.printTitle")}</p>
        <p style={{ margin: "0 0 6px", color: "#555" }}>{new Date().toLocaleString()}</p>
        <p style={{ fontWeight: 700, fontSize: 12, margin: "0 0 2px" }}>{c.name}{age !== null ? ` (${age})` : ""}</p>
        <p style={{ margin: "0 0 8px" }}>{c.phone}{c.email ? ` · ${c.email}` : ""}{c.dob ? ` · DOB ${c.dob}` : ""}{c.gender ? ` · ${c.gender}` : ""}{c.bloodType ? ` · ${c.bloodType}` : ""}{c.address ? ` · ${c.address}` : ""}{c.insurancePlan ? ` · ${c.insurancePlan}` : ""}</p>
        <p style={{ fontWeight: 700, borderTop: "1px solid #ccc", paddingTop: 4 }}>{t("patients.allergyFile")}</p>
        {p.allergies.length === 0 ? <p style={{ margin: "1px 0 6px", color: "#555" }}>{t("patients.noAllergies")}</p> : (
          <ul style={{ margin: "1px 0 6px", paddingLeft: 14 }}>{p.allergies.map((a) => (
            <li key={a.allergen}>{a.allergen} — {t(`patients.sev.${a.severity}`)}{a.reaction ? ` — ${a.reaction}` : ""}</li>))}
          </ul>
        )}
        <p style={{ fontWeight: 700, borderTop: "1px solid #ccc", paddingTop: 4 }}>{t("patients.conditions")}</p>
        {p.conditions.length === 0 ? <p style={{ margin: "1px 0 6px", color: "#555" }}>{t("patients.noConditions")}</p> : (
          <ul style={{ margin: "1px 0 6px", paddingLeft: 14 }}>{p.conditions.map((x, i) => (
            <li key={`${x.name}-${i}`}>{x.code ? `${x.code} ` : ""}{x.name}</li>))}
          </ul>
        )}
        <p style={{ fontWeight: 700, borderTop: "1px solid #ccc", paddingTop: 4 }}>{t("patients.medHistory")}</p>
        {p.meds.length === 0 ? <p style={{ margin: "1px 0 6px", color: "#555" }}>{t("patients.noMeds")}</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "1px 0 6px" }}>
            <thead><tr><th align="left">{t("patients.productTh")}</th><th align="right">{t("patients.qtyTh")}</th><th align="left" style={{ paddingLeft: 6 }}>{t("patients.rxRef")}</th><th align="right">{t("common.date")}</th></tr></thead>
            <tbody>{p.meds.map((m, i) => (
              <tr key={`${m.rxRef}-${i}`}>
                <td>{m.product}</td><td align="right">{m.qty}</td>
                <td style={{ paddingLeft: 6 }}>{m.source === "rx" ? "Rx" : "TX"} {m.rxRef}</td>
                <td align="right">{new Date(m.at).toLocaleDateString()}</td>
              </tr>))}
            </tbody>
          </table>
        )}
        <p style={{ fontWeight: 700, borderTop: "1px solid #ccc", paddingTop: 4 }}>{t("patients.notesTimeline")}</p>
        {p.notes.length === 0 ? <p style={{ margin: "1px 0", color: "#555" }}>—</p> : (
          <ul style={{ margin: "1px 0", paddingLeft: 14 }}>{p.notes.map((n, i) => (
            <li key={`${n.at}-${i}`}>{new Date(n.at).toLocaleString()} — {n.author || "—"}: {n.text}</li>))}
          </ul>
        )}
      </div>
    </div>
  );
}
