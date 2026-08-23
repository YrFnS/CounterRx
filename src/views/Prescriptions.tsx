import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import type { ChangeEvent } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners,
  useDraggable, useDroppable,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { usePos, relTime } from "../store";
import { stockOf, can, daysUntil, allergyConflicts } from "../data";
import { findInteractions, detectDuplicateTherapy, dispenseBlockers } from "../lib/clinical";
import type { RxStatus, Prescription, BackOrderStatus, Product, Prescriber } from "../data";
import { aiOcr, type OcrResult } from "../lib/ai";
import { suggestProducts } from "../lib/ai-ui";
import { cx, Badge, Modal } from "../ui";
import { resizeToDataUrl } from "../lib/rxdocs";
import { IRx, ICheck, IClock, IRegister, IShield, IGrab, IRefresh, ISend, IRecall, IX, IBox, ISwap, IArrowIn, IArrowOut, IDownload, IPlus, IScan, IAlert, IPrint, ISpark, IUsers, ISearch, IEdit, IArchive, ITrash, IClipboard, IInfo } from "../icons";

const FLOW: RxStatus[] = ["new", "verifying", "ready", "waiting", "dispensed"];
const LABEL: Record<RxStatus, string> = {
  new: i18n.t("prescriptions.droppedOff"), verifying: i18n.t("prescriptions.review"), ready: i18n.t("prescriptions.filled"), waiting: i18n.t("prescriptions.waitingBin"), dispensed: i18n.t("prescriptions.dispensed"),
};
const ACCENT: Record<RxStatus, { bar: string; chip: string }> = {
  new: { bar: "#5c6b66", chip: "bg-mist/70 text-ink" },
  verifying: { bar: "#e0a63c", chip: "bg-honey-100 text-honey-700" },
  ready: { bar: "#3b8668", chip: "bg-pine-100 text-pine-700" },
  waiting: { bar: "#c98d5f", chip: "bg-honey-100 text-honey-800" },
  dispensed: { bar: "#0f4437", chip: "bg-ink text-paper" },
};
const NEXT: Partial<Record<RxStatus, { to: RxStatus; label: string }>> = {
  new: { to: "verifying", label: i18n.t("prescriptions.startReview") },
  verifying: { to: "ready", label: i18n.t("prescriptions.markFilled") },
  ready: { to: "waiting", label: i18n.t("prescriptions.toWaitingBin") },
  waiting: { to: "dispensed", label: "Hand over" },
};

export default function Prescriptions() {
  const { t } = useTranslation();
  const { state, dispatch, product, prescriber } = usePos();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<RxStatus | null>(null);
  const [xferLog, setXferLog] = useState(false);
  const [xferIn, setXferIn] = useState(false);
  const [intake, setIntake] = useState(false);
  const [ocrIntake, setOcrIntake] = useState(false);
  const [tab, setTab] = useState<"workflow" | "prescribers" | "claims">("workflow");
  const mayTransfer = can(state.user?.role, "transfer_rx");

  /* Refill radar: maintenance fills whose days-supply runs out within 7 days */
  const dueRefills = useMemo(() => {
    const now = Date.now();
    return state.prescriptions
      .filter((r) => r.status === "dispensed" && r.daysSupply && r.dispensedAt)
      .map((r) => ({ r, daysLeft: Math.ceil((r.dispensedAt! + r.daysSupply! * 86_400_000 - now) / 86_400_000) }))
      .filter((x) => x.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [state.prescriptions]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const activeRx = state.prescriptions.find((r) => r.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragOver = (e: DragOverEvent) => setOverCol(e.over ? (e.over.id as RxStatus) : null);
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    setOverCol(null);
    const rx = state.prescriptions.find((r) => r.id === e.active.id);
    const to = e.over?.id as RxStatus | undefined;
    if (!rx || !to || to === rx.status || !FLOW.includes(to)) return;
    dispatch({ type: "RX_STATUS", id: rx.id, status: to });
  };

  return (
    <div className="h-full flex flex-col px-3 sm:px-6 py-4 sm:py-5 min-h-0">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button onClick={() => setTab("workflow")}
          className={cx("px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95",
            tab === "workflow" ? "bg-pine-700 text-pine-50 shadow-lift" : "border border-mist bg-card text-ink hover:border-pine-400")}>
          Rx workflow
        </button>
        <button onClick={() => setTab("prescribers")}
          className={cx("px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95",
            tab === "prescribers" ? "bg-pine-700 text-pine-50 shadow-lift" : "border border-mist bg-card text-ink hover:border-pine-400")}>
          <IUsers size={13} className="inline me-1" /> {t("prescribers.title")}
        </button>
        <button onClick={() => setTab("claims")}
          className={cx("px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95",
            tab === "claims" ? "bg-pine-700 text-pine-50 shadow-lift" : "border border-mist bg-card text-ink hover:border-pine-400")}>
          <IClipboard size={13} className="inline me-1" /> {t("claims.title")} · {state.rxClaims.length}
        </button>
      </div>
      {tab === "prescribers" ? (
        <PrescribersTab onClose={() => setTab("workflow")} />
      ) : tab === "claims" ? (
        <ClaimsTab />
      ) : (
      <>
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft flex items-center gap-1.5">
            <IGrab size={12} /> Drag cards between stages — or use the action buttons
          </p>
        </div>
        <div className="flex-1" />
        <button onClick={() => setIntake(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95 shadow-lift">
          <IPlus size={14} /> New prescription
        </button>
        <button onClick={() => setOcrIntake(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-pine-300 bg-pine-50 text-pine-800 text-xs font-bold hover:bg-pine-100 transition active:scale-95"
          title={t("ai.ocrHint")}>
          <ISpark size={14} /> {t("ai.ocrButton")}
        </button>
        <button onClick={() => setXferLog(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-mist bg-card text-xs font-bold text-ink hover:border-pine-400 hover:bg-pine-50 transition active:scale-95">
          <ISwap size={14} /> Transfer log · {state.rxTransfers.length}
        </button>
        <button onClick={() => setXferIn(true)} disabled={!mayTransfer}
          title={mayTransfer ? "Accept a prescription transferred in from another pharmacy" : "Requires pharmacist or admin"}
          className={cx("flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition active:scale-95",
            mayTransfer ? "bg-pine-700 text-pine-50 hover:bg-pine-600 shadow-lift" : "bg-mist text-inksoft/50 cursor-not-allowed")}>
          <IArrowIn size={14} /> Transfer in
        </button>
        <p className="flex items-center gap-1.5 text-xs text-inksoft">
          <IShield size={14} className="text-pine-600" /> Pharmacist on duty: <span className="font-semibold text-ink">R. Mensah, RPh</span>
        </p>
      </div>

      <BackorderStrip />

      {dueRefills.length > 0 && (
        <div className="mt-3.5 rounded-xl border border-honey-300/60 bg-honey-100/40 p-3 anim-fade-up">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-honey-700 flex items-center gap-1.5">
            <IRefresh size={12} /> Refill radar · therapy runs out ≤ 7 days · {dueRefills.length} patient{dueRefills.length === 1 ? "" : "s"}
          </p>
          <div className="mt-2 flex gap-2.5 overflow-x-auto scroll-slim pb-1">
            {dueRefills.map(({ r, daysLeft }, i) => {
              const p = product(r.productId);
              const overdue = daysLeft < 0;
              return (
                <div key={r.id} style={{ animationDelay: `${i * 60}ms` }}
                  className={cx("anim-fade-up shrink-0 w-64 rounded-lg border bg-card p-3 shadow-lift transition-transform hover:-translate-y-0.5",
                    overdue ? "border-brick-400" : "border-honey-300/70")}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-ink truncate">{r.patient} <span className="font-medium text-inksoft">· {r.age}y</span></p>
                    <span className={cx("num shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded",
                      overdue ? "bg-brick-500 text-brick-100 anim-pulse-dot" : "bg-honey-500 text-pine-950")}>
                      {overdue ? `${Math.abs(daysLeft)}d overdue` : `due in ${daysLeft}d`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-inksoft truncate">
                    <span className="font-semibold text-ink">{p?.name ?? r.productId}</span> × {r.qty}
                    {r.daysSupply && <span className="num"> · {r.daysSupply}-day supply</span>}
                  </p>
                  <p className="text-[10px] text-inksoft num">
                    filled {r.dispensedAt ? relTime(r.dispensedAt) : "—"} · {prescriber(r.prescriberId)?.name ?? r.prescriberId}
                    {r.remindedAt && <span className="text-pine-700 font-bold"> · reminded {relTime(r.remindedAt)}</span>}
                  </p>
                  {r.refillsRemaining !== undefined && (
                    <p className={cx("mt-0.5 text-[10px] font-bold", r.refillsRemaining === 0 ? "text-brick-700" : "text-pine-700")}>
                      {r.refillsRemaining === 0
                        ? "⚠ 0 refills left — needs prescriber re-authorization"
                        : `${r.refillsRemaining} of ${r.refillsAuthorized ?? "–"} refills remaining`}
                    </p>
                  )}
                  <div className="mt-2 flex gap-1.5">
                    <button onClick={() => dispatch({ type: "NEW_REFILL", rxId: r.id })}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md bg-pine-700 text-pine-50 text-[11px] font-bold hover:bg-pine-600 transition active:scale-95">
                      <IRefresh size={11} /> Start refill
                    </button>
                    <button onClick={() => dispatch({ type: "REMIND_RX", id: r.id })}
                      className={cx("flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md border text-[11px] font-bold transition active:scale-95",
                        r.remindedAt ? "border-pine-200 bg-pine-50 text-pine-700" : "border-honey-400 bg-honey-100/60 text-honey-700 hover:bg-honey-100")}>
                      <ISend size={11} /> {r.remindedAt ? "Reminded" : "Remind"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); setOverCol(null); }}>
        <div className="mt-4 flex-1 min-h-0 flex gap-3.5 overflow-x-auto scroll-slim pb-4">
          {FLOW.map((status) => (
            <div key={status} className="min-w-[232px] flex-1 min-h-0">
              <Column status={status} ghostId={activeId}
                items={state.prescriptions.filter((r) => r.status === status).sort((a, b) => a.createdAt - b.createdAt)}
                highlight={overCol === status && activeId !== null}
                dimmed={activeId !== null && overCol !== status} />
            </div>
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22,1,0.36,1)" }}>
          {activeRx ? <RxCard rx={activeRx} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {xferLog && <XferLogModal onClose={() => setXferLog(false)} />}
      {xferIn && <XferInModal onClose={() => setXferIn(false)} />}
      {intake && <IntakeModal onClose={() => setIntake(false)} />}
      {ocrIntake && <OcrIntakeModal onClose={() => setOcrIntake(false)} />}
      </>
      )}
    </div>
  );
}

/* ================================================================== */
/*  W1.3 — Prescriber directory                                      */
/* ================================================================== */

const maskDea = (dea: string) => dea.length <= 4 ? dea : "●".repeat(dea.length - 4) + dea.slice(-4);

function PrescribersTab({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { state, dispatch, product, prescriber } = usePos();
  const editable = can(state.user?.role, "manage_settings") || state.user?.role === "pharmacist";

  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Prescriber | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [credentials, setCredentials] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [npi, setNpi] = useState("");
  const [dea, setDea] = useState("");
  const [phone, setPhone] = useState("");
  const [fax, setFax] = useState("");
  const [active, setActive] = useState(true);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return state.prescribers.filter((p) => !p.archived && (!term
      || `${p.name} ${p.credentials} ${p.specialty} ${p.npi} ${maskDea(p.dea)} ${p.phone} ${p.fax}`.toLowerCase().includes(term)));
  }, [state.prescribers, q]);
  const archived = useMemo(() => state.prescribers.filter((p) => p.archived), [state.prescribers]);

  const openEdit = (p?: Prescriber) => {
    setEditing(p ?? null);
    setName(p?.name ?? ""); setCredentials(p?.credentials ?? ""); setSpecialty(p?.specialty ?? "");
    setNpi(p?.npi ?? ""); setDea(p?.dea ?? ""); setPhone(p?.phone ?? ""); setFax(p?.fax ?? "");
    setActive(p?.active ?? true);
  };
  const reset = () => { setEditing(null); setName(""); setCredentials(""); setSpecialty(""); setNpi(""); setDea(""); setPhone(""); setFax(""); setActive(true); };

  const save = () => {
    if (!editable || !name.trim()) return;
    dispatch({ type: "PRESCRIBER_SAVE", prescriber: { id: editing?.id ?? "", name: name.trim(), credentials: credentials.trim(), specialty: specialty.trim(), npi: npi.trim(), dea: dea.trim(), phone: phone.trim(), fax: fax.trim(), active, archived: editing?.archived ?? false } });
    reset();
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <ISearch size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-inksoft" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("prescribers.searchPh")}
            className="w-full ps-9 pe-3 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none" />
        </div>
        <button onClick={() => openEdit()} disabled={!editable}
          className={cx("flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition active:scale-95",
            editable ? "bg-pine-700 text-pine-50 hover:bg-pine-600 shadow-lift" : "bg-mist text-inksoft/50 cursor-not-allowed")}>
          <IPlus size={14} /> {t("prescribers.create")}
        </button>
        <p className="flex items-center gap-1.5 text-xs text-inksoft">
          <IShield size={14} className="text-pine-600" /> {editable ? t("prescribers.canManage") : t("prescribers.readOnly")}
        </p>
      </div>

      <div className="mt-3.5 flex-1 min-h-0 overflow-y-auto scroll-slim grid sm:grid-cols-2 xl:grid-cols-3 gap-3 pb-4">
        {filtered.map((p) => {
          const theirs = state.prescriptions.filter((rx) => rx.prescriberId === p.id);
          return (
            <div key={p.id} className="rounded-xl border border-mist bg-card p-3.5 shadow-lift flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-ink text-[14px] leading-tight truncate">{p.name}, {p.credentials}</h3>
                  <p className="text-[11px] text-inksoft">{p.specialty}</p>
                </div>
                {!p.active && <Badge tone="brick">Inactive</Badge>}
              </div>
              <dl className="mt-2.5 space-y-1 text-[11px]">
                <div className="flex justify-between gap-2"><dt className="text-inksoft">NPI</dt><dd className="num font-semibold text-ink">{p.npi || "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-inksoft">DEA</dt><dd className="num font-semibold text-ink">{maskDea(p.dea) || "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-inksoft">Phone</dt><dd className="num font-semibold text-ink">{p.phone || "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-inksoft">Fax</dt><dd className="num font-semibold text-ink">{p.fax || "—"}</dd></div>
              </dl>
              <div className="mt-2 flex items-center gap-2 text-[11px]">
                <Badge tone="pine">{theirs.length} Rx</Badge>
              </div>
              <div className="mt-auto pt-3 flex gap-1.5">
                <button onClick={() => setHistoryFor(p.id)} disabled={theirs.length === 0}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md border border-mist bg-card text-inksoft text-[11px] font-bold hover:border-pine-400 hover:text-pine-700 transition active:scale-95 disabled:opacity-40">
                  <IX size={11} className="hidden" /> {t("prescribers.history")}
                </button>
                <button onClick={() => openEdit(p)} disabled={!editable}
                  className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft disabled:opacity-40" aria-label="Edit"><IEdit size={13} /></button>
                <button onClick={() => dispatch({ type: "PRESCRIBER_SAVE", prescriber: { ...p, archived: true } })} disabled={!editable}
                  className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft disabled:opacity-40" aria-label="Archive"><IArchive size={13} /></button>
                <button onClick={() => dispatch({ type: "PRESCRIBER_DELETE", id: p.id })} disabled={!editable}
                  className="p-1.5 rounded-md hover:bg-brick-100 text-brick-700 disabled:opacity-40" aria-label="Delete"><ITrash size={13} /></button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-xs text-inksoft px-1">{t("prescribers.empty")}</p>}
      </div>

      {archived.length > 0 && (
        <details className="mt-2 rounded-xl border border-mist bg-card/60">
          <summary className="cursor-pointer px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-inksoft">
            {t("prescribers.archived")} · {archived.length}
          </summary>
          <div className="px-4 pb-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {archived.map((p) => (
              <div key={p.id} className="opacity-55 rounded-lg border border-mist bg-paper px-3 py-2 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink truncate">{p.name}, {p.credentials}</p>
                  <p className="text-[10px] text-inksoft">{p.specialty}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(p)} disabled={!editable} className="p-1 rounded hover:bg-mist/60 text-inksoft disabled:opacity-40" aria-label="Edit"><IEdit size={12} /></button>
                  <button onClick={() => dispatch({ type: "PRESCRIBER_SAVE", prescriber: { ...p, archived: false } })} disabled={!editable} className="p-1 rounded hover:bg-mist/60 text-inksoft disabled:opacity-40" aria-label="Restore" title={t("prescribers.restore")}><IArrowIn size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {editing !== null && (
        <Modal onClose={reset} width={560} labelledBy="pr-edit-title">
          <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
            <h2 id="pr-edit-title" className="font-display font-bold text-ink flex items-center gap-2">
              <IUsers size={17} className="text-pine-700" /> {editing ? t("prescribers.edit") : t("prescribers.create")}
            </h2>
            <button onClick={reset} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
          </div>
          <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto scroll-slim">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block text-[11px] font-bold text-inksoft">{t("prescribers.name")} *
                <input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} autoFocus className={xfIn} /></label>
              <label className="block text-[11px] font-bold text-inksoft">{t("prescribers.credentials")}
                <input value={credentials} onChange={(e) => setCredentials(e.target.value)} disabled={!editable} className={xfIn} /></label>
              <label className="block text-[11px] font-bold text-inksoft">{t("prescribers.specialty")}
                <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} disabled={!editable} className={xfIn} /></label>
              <label className="block text-[11px] font-bold text-inksoft">{t("prescribers.npi")}
                <input value={npi} onChange={(e) => setNpi(e.target.value)} disabled={!editable} className={cx(xfIn, "num")} /></label>
              <label className="block text-[11px] font-bold text-inksoft">{t("prescribers.dea")}
                <input value={dea} onChange={(e) => setDea(e.target.value)} disabled={!editable} className={cx(xfIn, "num")} /></label>
              <label className="block text-[11px] font-bold text-inksoft">{t("prescribers.phone")}
                <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!editable} className={cx(xfIn, "num")} /></label>
              <label className="block text-[11px] font-bold text-inksoft">{t("prescribers.fax")}
                <input value={fax} onChange={(e) => setFax(e.target.value)} disabled={!editable} className={cx(xfIn, "num")} /></label>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-inksoft">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={!editable} /> {t("prescribers.active")}
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={reset} className="px-4 py-1.5 rounded-lg border border-mist text-inksoft text-xs font-bold hover:bg-mist/50 transition">{t("prescribers.cancel")}</button>
              <button onClick={save} disabled={!editable || !name.trim()} className="px-4 py-1.5 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition disabled:opacity-50">
                {editing ? t("prescribers.save") : t("prescribers.create")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {historyFor && (
        <RxHistoryDrawer prescriberId={historyFor} onClose={() => setHistoryFor(null)} product={product} prescriber={prescriber} />
      )}
    </div>
  );
}

/* Per-prescriber Rx history — reuse the prescriptions table rendering (§3). */
function RxHistoryDrawer({ prescriberId, onClose, product, prescriber }: {
  prescriberId: string; onClose: () => void;
  product: (id: string) => Product | undefined; prescriber: (id: string) => Prescriber | undefined;
}) {
  const { t } = useTranslation();
  const { state } = usePos();
  const pr = prescriber(prescriberId);
  const rows = state.prescriptions
    .filter((rx) => rx.prescriberId === prescriberId)
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Modal onClose={onClose} width={640} labelledBy="pr-hist-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="pr-hist-title" className="font-display font-bold text-ink flex items-center gap-2">
            <IUsers size={17} className="text-pine-700" /> {pr?.name ?? prescriberId}
          </h2>
          <p className="text-xs text-inksoft mt-0.5">{rows.length} {t("prescribers.historyCount")}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5">
        <div className="max-h-[380px] overflow-auto scroll-slim rounded-lg border border-mist">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0">
              <tr className="bg-pine-900 text-pine-100 text-start text-[9px] uppercase tracking-[0.14em]">
                <th className="px-3 py-2 font-bold">Rx</th>
                <th className="px-2 py-2 font-bold">Patient</th>
                <th className="px-2 py-2 font-bold">Product</th>
                <th className="px-3 py-2 font-bold text-end">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rx, i) => (
                <tr key={rx.id} className={cx("border-t border-mist/70", i % 2 === 1 && "bg-paper/60")}>
                  <td className="px-3 py-2 num font-bold text-ink">{rx.id}</td>
                  <td className="px-2 py-2 text-ink">{rx.patient}</td>
                  <td className="px-2 py-2 text-inksoft truncate max-w-[160px]">{product(rx.productId)?.name ?? rx.productId}</td>
                  <td className="px-3 py-2 text-end"><StatusPill status={rx.status} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-inksoft">No prescriptions on file.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function Column({ status, items, highlight, dimmed, ghostId }: {
  status: RxStatus; items: Prescription[]; highlight: boolean; dimmed: boolean; ghostId: string | null;
}) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: status });
  const acc = ACCENT[status];
  return (
    <section ref={setNodeRef}
      className={cx("min-h-0 flex flex-col rounded-xl border bg-paper/70 transition-all duration-200",
        highlight ? "border-pine-500 ring-2 ring-pine-200 bg-pine-50/70 scale-[1.01]" : "border-mist",
        dimmed && !highlight && "opacity-70")}>
      <header className="px-3.5 pt-3 pb-2.5 border-b border-mist/70">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: acc.bar }} />
          <h2 className="font-display font-bold text-[13px] text-ink leading-none">{LABEL[status]}</h2>
          <span className={cx("num ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded", acc.chip)}>{items.length}</span>
          {status === "new" && items.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-brick-500 anim-pulse-dot" />}
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-slim p-2.5 space-y-2.5">
        {items.length === 0 && (
          <div className={cx("h-24 grid place-items-center rounded-lg border-2 border-dashed transition-colors",
            highlight ? "border-pine-400 text-pine-700" : "border-mist/80 text-inksoft/60")}>
            <p className="text-[11px] font-semibold flex items-center gap-1.5">
              <IRx size={13} /> {highlight ? "Release to move here" : "Empty stage"}
            </p>
          </div>
        )}
        {items.map((rx) => <RxCard key={rx.id} rx={rx} ghost={ghostId === rx.id} />)}
      </div>
    </section>
  );
}

/* Patient back-order queue — order out-of-stock Rx for a patient, notify on arrival (§3) */
const BO_TONE: Record<BackOrderStatus, { chip: string; dot: string }> = {
  ordered: { chip: "bg-honey-100 text-honey-700", dot: "bg-honey-500" },
  arrived: { chip: "bg-pine-100 text-pine-700", dot: "bg-pine-500" },
  notified: { chip: "bg-mist/70 text-ink", dot: "bg-inksoft" },
  fulfilled: { chip: "bg-pine-700 text-pine-50", dot: "bg-pine-300" },
  cancelled: { chip: "bg-brick-100 text-brick-700", dot: "bg-brick-500" },
};

function BackorderStrip() {
  const { state, dispatch, product } = usePos();
  const open = state.backorders.filter((b) => ["ordered", "arrived", "notified"].includes(b.status));
  const done = state.backorders.filter((b) => b.status === "fulfilled").length;

  if (state.backorders.length === 0) return null;

  const etaLeft = (b: { createdAt: number; etaDays: number }) =>
    b.etaDays - Math.floor((Date.now() - b.createdAt) / 86_400_000);

  return (
    <div className="mt-3.5 rounded-xl border border-mist bg-card/60 p-3 anim-fade-up">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft flex items-center gap-1.5">
          <IBox size={12} className="text-pine-600" /> Back-order queue · {open.length} open
          {done > 0 && <span className="normal-case tracking-normal text-pine-700">· {done} fulfilled</span>}
        </p>
      </div>

      {open.length === 0 ? (
        <p className="mt-2 text-[11px] text-inksoft">No open back-orders — every patient order has been handed over.</p>
      ) : (
        <div className="mt-2 flex gap-2.5 overflow-x-auto scroll-slim pb-1">
          {open.map((b, i) => {
            const p = product(b.productId);
            const left = etaLeft(b);
            return (
              <div key={b.id} style={{ animationDelay: `${i * 60}ms` }}
                className="anim-fade-up shrink-0 w-64 rounded-lg border border-mist bg-card p-3 shadow-lift transition-transform hover:-translate-y-0.5 flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-ink truncate">{b.patient}</p>
                  <span className={cx("num shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase", BO_TONE[b.status].chip)}>{b.status}</span>
                </div>
                <p className="mt-1 text-[11px] text-inksoft truncate">
                  <span className="font-semibold text-ink">{p?.name ?? b.productId}</span> × {b.qty}
                </p>
                <p className="text-[10px] text-inksoft num">
                  {b.supplier}
                  {b.status === "ordered" && (
                    <span className={cx("ms-1.5 font-bold", left < 0 ? "text-brick-700" : "text-honey-700")}>
                      · ETA {left < 0 ? `${Math.abs(left)}d overdue` : `${left}d`}
                    </span>
                  )}
                  {b.arrivedAt && b.status !== "ordered" && <span className="ms-1.5 text-pine-700 font-bold">· in {relTime(b.arrivedAt)}</span>}
                </p>
                {b.phone && <p className="text-[10px] text-inksoft num">{b.phone}</p>}

                <div className="mt-auto pt-2 flex gap-1.5">
                  {b.status === "ordered" && (
                    <button onClick={() => dispatch({ type: "BACKORDER_STATUS", id: b.id, to: "arrived" })}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md bg-pine-700 text-pine-50 text-[11px] font-bold hover:bg-pine-600 transition active:scale-95">
                      <IBox size={11} /> Mark arrived
                    </button>
                  )}
                  {b.status === "arrived" && (
                    <button onClick={() => dispatch({ type: "BACKORDER_STATUS", id: b.id, to: "notified" })}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md bg-honey-500 text-pine-950 text-[11px] font-bold hover:brightness-105 transition active:scale-95">
                      <ISend size={11} /> Notify patient
                    </button>
                  )}
                  {b.status === "notified" && (
                    <button onClick={() => { dispatch({ type: "ADD_CART", productId: b.productId }); dispatch({ type: "BACKORDER_STATUS", id: b.id, to: "fulfilled" }); }}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md bg-pine-700 text-pine-50 text-[11px] font-bold hover:bg-pine-600 transition active:scale-95">
                      <IRegister size={11} /> Attach to sale
                    </button>
                  )}
                  <button onClick={() => dispatch({ type: "BACKORDER_STATUS", id: b.id, to: "cancelled" })}
                    className="px-2 rounded-md border border-mist text-inksoft hover:text-brick-700 hover:border-brick-400 transition active:scale-95"
                    aria-label={`Cancel ${b.id}`}>
                    <IX size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RxCard({ rx, ghost, overlay }: { rx: Prescription; ghost?: boolean; overlay?: boolean }) {
  const { t } = useTranslation();
  const { state, dispatch, product, prescriber } = usePos();
  const { attributes, listeners, setNodeRef } = useDraggable({ id: rx.id });
  const p = product(rx.productId);
  const shelf = p ? stockOf(p) : 0;
  const [showPrescriber, setShowPrescriber] = useState(false);
  const [showXferOut, setShowXferOut] = useState(false);
  const [viewScan, setViewScan] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [allergyAck, setAllergyAck] = useState(false);
  const [allergyReason, setAllergyReason] = useState("");
  const stepIdx = FLOW.indexOf(rx.status);
  const next = NEXT[rx.status];
  const canAttach = rx.status !== "dispensed" && p && shelf > 0 && !rx.transferredOut;
  const canPa = can(state.user?.role, "verify_rx");
  const canBackorder = rx.status !== "dispensed" && p && shelf === 0 && !rx.transferredOut;
  const canTransferOut = rx.status !== "dispensed" && !rx.transferredOut && can(state.user?.role, "transfer_rx");

  /* drug–allergy screen: match patient to the customer book, screen the drug (§3) */
  const patient = state.customers.find((c) => c.name.toLowerCase() === rx.patient.toLowerCase());
  const conflicts = allergyConflicts(patient?.allergies, p);
  const dispensing = next?.to === "dispensed";

  /* drug–drug interaction screen: check basket (other dispensed Rx) against this Rx */
  const interactionIds = [...state.prescriptions.filter((r) => r.status === "dispensed" && r.id !== rx.id).map((r) => r.productId), rx.productId];
  const interactions = findInteractions(interactionIds);
  const interactionBlocked = dispensing && interactions.filter((i) => i.severity === "major").length > 0;

  /* duplicate therapy: same therapeutic class prescribed concurrently */
  const duplicates = rx.productId ? detectDuplicateTherapy([rx.productId], state.products) : [];
  const dupBlocked = dispensing && duplicates.length > 0;

  /* refill / expiry enforcement (§5) — blocks dispense until resolved */
  const blockers = dispenseBlockers(rx);

  const allergyBlocked = dispensing && conflicts.length > 0 && !allergyAck;
  const dispense = () => {
    if (conflicts.length > 0) {
      dispatch({ type: "AUDIT_LOG", kind: "rx", detail: `⚠ Allergy override — ${rx.id} · ${rx.patient} (${conflicts.map((c) => c.allergen).join(", ")}) dispensed by ${state.user?.name ?? "?"} · reason: ${allergyReason || "not documented"}` });
    }
    dispatch({ type: "RX_STATUS", id: rx.id, status: "dispensed" });
  };

  /* hard-copy scan: pick a photo of the paper Rx, resize client-side, attach (§3) */
  const onScanFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    resizeToDataUrl(file, 480).then((url) => dispatch({ type: "SCAN_ATTACH", id: rx.id, dataUrl: url }))
      .catch(() => dispatch({ type: "TOAST", kind: "error", msg: "Couldn't read that image — try a JPG or PNG" }));
  };

  return (
    <article ref={setNodeRef} {...listeners} {...attributes}
      className={cx("bg-card border rounded-xl p-3.5 select-none touch-none transition-all duration-200",
        rx.status === "ready" ? "border-pine-300" : rx.status === "verifying" ? "border-honey-300/80" : "border-mist",
        !overlay && "hover:-translate-y-0.5 hover:shadow-lift cursor-grab active:cursor-grabbing",
        overlay && "shadow-pop rotate-2 scale-[1.03] cursor-grabbing",
        ghost && "opacity-35")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="num text-[10px] font-bold text-inksoft tracking-wide">{rx.id} · {relTime(rx.createdAt)}</p>
          <h3 className="font-display font-bold text-ink text-[14px] leading-tight mt-0.5 truncate">
            {rx.patient} <span className="text-inksoft font-medium text-xs">· {rx.age}y</span>
          </h3>
        </div>
        <IGrab size={13} className="text-inksoft/40 shrink-0 mt-0.5" />
      </div>

      {/* hidden picker for hard-copy scan */}
      <input type="file" accept="image/*" className="hidden" id={`scan-${rx.id}`} onChange={onScanFile}
        onClick={(e) => e.stopPropagation()} />

      {rx.scan && (
        <button onClick={() => setViewScan(true)}
          className="mt-2 group/scan relative w-full h-16 rounded-lg overflow-hidden border border-mist focus:outline-none focus:ring-2 focus:ring-pine-300"
          title="View attached hard-copy scan">
          <img src={rx.scan} alt="Hard-copy prescription scan" className="w-full h-full object-cover transition-transform duration-200 group-hover/scan:scale-105" />
          <span className="absolute inset-x-0 bottom-0 bg-pine-950/70 text-pine-100 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 text-start">
            📄 Hard-copy on file · {relTime(rx.scanAt ?? rx.createdAt)}
          </span>
        </button>
      )}

      {rx.transferredOut && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md border border-mist bg-mist/50 px-2 py-1.5">
          <IArrowOut size={12} className="text-inksoft shrink-0" />
          <p className="text-[10px] font-semibold text-inksoft">
            Transferred out to <span className="text-ink">{rx.transferredOut.to}</span> · {relTime(rx.transferredOut.at)} — fill authority released
          </p>
        </div>
      )}

      {conflicts.length > 0 && rx.status !== "dispensed" && (
        <div className="mt-2 anim-fade-up flex items-start gap-1.5 rounded-md border-2 border-brick-500 bg-brick-100/70 px-2 py-1.5">
          <IAlert size={12} className="text-brick-700 shrink-0 mt-px anim-pulse-dot" />
          <p className="text-[10px] font-bold text-brick-700 leading-snug">
            Allergy on file — {patient?.name} is allergic to {conflicts.map((c) => c.allergen).join(", ")}; this drug contains {conflicts.map((c) => c.reason).join(", ")}.
          </p>
        </div>
      )}

      {interactionBlocked && (
        <div className="mt-2 anim-fade-up flex items-start gap-1.5 rounded-md border-2 border-brick-500 bg-brick-100/70 px-2 py-1.5">
          <IAlert size={12} className="text-brick-700 shrink-0 mt-px anim-pulse-dot" />
          <p className="text-[10px] font-bold text-brick-700 leading-snug">
            Major drug interaction — {interactions.filter((i) => i.severity === "major").map((i) => `${i.effect} ${i.action}`).join(" ")}
          </p>
        </div>
      )}

      {dupBlocked && (
        <div className="mt-2 anim-fade-up flex items-start gap-1.5 rounded-md border-2 border-honey-500 bg-honey-100/70 px-2 py-1.5">
          <IAlert size={12} className="text-honey-700 shrink-0 mt-px" />
          <p className="text-[10px] font-bold text-honey-700 leading-snug">
            Duplicate therapy — {duplicates.map((d) => d.reason).join("; ")}
          </p>
        </div>
      )}
      <div className="mt-2.5 bg-paper border border-mist rounded-lg px-2.5 py-2">
        <p className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
          <span className="text-brick-700 font-display">℞</span>
          <span className="truncate">{p?.name ?? rx.productId}</span>
          {p?.controlled && <span className="px-1.5 py-0.5 rounded bg-ink text-paper text-[9px] font-bold tracking-wide shrink-0">{p.controlled}</span>}
          <span className="num text-xs font-bold text-inksoft shrink-0">× {rx.qty}</span>
        </p>
        <p className={cx("text-[10px] mt-0.5 font-semibold", canAttach ? "text-inksoft" : "text-brick-700")}>
          {p ? `${p.form} · ${shelf} on shelf` : "unknown product"}
          {!canAttach && p && shelf <= 0 && " — out of stock"}
        </p>
        <button onClick={() => setShowPrescriber(true)}
          className="mt-0.5 flex items-center gap-1 text-[10px] text-inksoft hover:text-pine-700 transition-colors group">
          by <span className="font-semibold text-ink group-hover:text-pine-700 underline decoration-dotted underline-offset-2 transition-colors">
            {prescriber(rx.prescriberId)?.name ?? rx.prescriberId}
          </span>
        </button>

        {rx.refillsRemaining !== undefined && (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span className={cx("num inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold",
              rx.refillsRemaining === 0 ? "bg-brick-100 text-brick-700" : "bg-pine-100 text-pine-700")}>
              <IRecall size={9} /> Refills {rx.refillsRemaining}/{rx.refillsAuthorized ?? "–"}
            </span>
            {rx.rxExpiry && (
              <span className={cx("num px-1.5 py-0.5 rounded text-[9px] font-bold",
                daysUntil(rx.rxExpiry) <= 30 ? "bg-honey-100 text-honey-700" : "bg-mist/60 text-inksoft")}>
                Rx exp {new Date(rx.rxExpiry + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        )}

        {rx.note && (
          <p className="mt-1.5 text-[10px] leading-snug text-honey-700 bg-honey-100/70 border border-honey-300/50 rounded-md px-2 py-1">
            ⚑ {rx.note}
          </p>
        )}

        {rx.status === "waiting" && (
          <div className="mt-1.5 rounded-md border border-honey-300/60 bg-honey-100/50 px-2 py-1.5 anim-fade-up" onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-honey-800 flex items-center gap-1">
                <IClock size={10} /> Will-call bin
              </p>
              {rx.phone && <p className="num text-[9px] text-honey-700">{rx.phone}</p>}
            </div>
            {rx.notifiedAt ? (
              <p className="text-[9px] font-semibold text-pine-700 mt-1 flex items-center gap-1">
                <ICheck size={9} /> Patient notified {relTime(rx.notifiedAt)}
              </p>
            ) : (
              <button onClick={() => dispatch({ type: "NOTIFY_RX", id: rx.id })}
                className="mt-1 w-full py-1 rounded bg-honey-500 text-pine-950 text-[9px] font-bold hover:bg-honey-400 transition active:scale-95 flex items-center justify-center gap-1">
                <ISend size={9} /> Send "ready for pickup"
              </button>
            )}
          </div>
        )}
        {rx.insurance && (
          <div className={cx("mt-1.5 rounded-md border px-2 py-1.5",
            rx.insurance.status === "verified" ? "bg-pine-100/70 border-pine-300/60" :
            rx.insurance.status === "rejected" ? "bg-brick-100/70 border-brick-300/60" :
            "bg-mist/50 border-mist")}>
            <div className="flex items-center justify-between gap-2">
              <span className={cx("flex items-center gap-1 text-[10px] font-bold",
                rx.insurance.status === "verified" ? "text-pine-700" :
                rx.insurance.status === "rejected" ? "text-brick-700" : "text-inksoft")}>
                <IShield size={10} />
                {rx.insurance.plan}
                {rx.insurance.status === "verified" && <ICheck size={10} />}
              </span>
              <span className={cx("num text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded",
                rx.insurance.status === "verified" ? "bg-pine-700 text-pine-50" :
                rx.insurance.status === "rejected" ? "bg-brick-600 text-brick-100 anim-pulse-dot" :
                "bg-ink text-paper")}>
                {rx.insurance.status}
              </span>
            </div>
            <p className="num text-[9px] text-inksoft mt-0.5">member {rx.insurance.memberId}</p>
            {rx.insurance.status === "pending" && (!can(state.user?.role, "verify_rx") ? (
              <p className="mt-1 py-1 text-center rounded bg-mist/70 text-[10px] font-bold text-inksoft">🔒 Pharmacist sign-in required to verify</p>
            ) : (
              <button onClick={() => dispatch({ type: "VERIFY_RX", id: rx.id })}
                className="mt-1 w-full py-1 rounded bg-ink text-paper text-[10px] font-bold hover:bg-pine-900 transition active:scale-95">
                Run eligibility check
              </button>
            ))}
            {rx.insurance.status === "rejected" && (
              <p className="text-[9px] font-semibold text-brick-700 mt-0.5">Eligibility failed — collect cash or re-verify member id</p>
            )}
          </div>
        )}

        {/* prior authorization lifecycle (§3) */}
        {rx.pa && (
          <div className={cx("mt-1.5 rounded-md border px-2 py-1.5",
            rx.pa.status === "approved" ? "bg-pine-100/70 border-pine-300/60" :
            rx.pa.status === "rejected" ? "bg-brick-100/70 border-brick-300/60" :
            "bg-honey-100/60 border-honey-300/60")}>
            <div className="flex items-center justify-between gap-2">
              <span className={cx("flex items-center gap-1 text-[10px] font-bold",
                rx.pa.status === "approved" ? "text-pine-700" :
                rx.pa.status === "rejected" ? "text-brick-700" : "text-honey-700")}>
                <IClock size={10} /> Prior auth
              </span>
              <span className={cx("text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded",
                rx.pa.status === "approved" ? "bg-pine-700 text-pine-50" :
                rx.pa.status === "rejected" ? "bg-brick-600 text-brick-100" :
                "bg-honey-500 text-pine-950 anim-pulse-dot")}>
                {rx.pa.status}
              </span>
            </div>
            {rx.pa.note && <p className="text-[9px] text-inksoft mt-0.5 leading-snug">{rx.pa.note}</p>}
            <p className="num text-[9px] text-inksoft mt-0.5">
              requested {relTime(rx.pa.requestedAt)}{rx.pa.decidedAt && ` · decided ${relTime(rx.pa.decidedAt)}`}
            </p>
            {!canPa ? (
              <p className="mt-1 py-1 text-center rounded bg-mist/70 text-[10px] font-bold text-inksoft">🔒 Pharmacist sign-in required for PA</p>
            ) : rx.pa.status === "pending" ? (
              <button onClick={() => dispatch({ type: "PA_CHECK", id: rx.id })}
                className="mt-1 w-full py-1 rounded bg-honey-500 text-pine-950 text-[10px] font-bold hover:brightness-105 transition active:scale-95">
                Check payer decision
              </button>
            ) : rx.pa.status === "rejected" ? (
              <button onClick={() => dispatch({ type: "PA_RESUBMIT", id: rx.id })}
                className="mt-1 w-full py-1 rounded bg-brick-600 text-brick-100 text-[10px] font-bold hover:bg-brick-500 transition active:scale-95">
                Resubmit with chart notes
              </button>
            ) : (
              <p className="mt-1 py-0.5 text-center text-[10px] font-bold text-pine-700">✓ Cleared to dispense</p>
            )}
          </div>
        )}
        {/* offer to initiate PA once coverage is verified but no PA is on file */}
        {!rx.pa && rx.insurance?.status === "verified" && rx.status !== "dispensed" && (
          canPa ? (
            <button onClick={() => dispatch({ type: "PA_SUBMIT", id: rx.id })}
              className="mt-1.5 w-full py-1.5 rounded-md border border-dashed border-honey-400 text-[10px] font-bold text-honey-700 hover:bg-honey-100/60 transition active:scale-95">
              + Request prior authorization
            </button>
          ) : null
        )}
      </div>

      {/* mini pipeline */}
      <div className="mt-2.5 flex items-center gap-1">
        {FLOW.map((s, idx) => (
          <span key={s} title={LABEL[s]}
            className={cx("h-1.5 rounded-full transition-all duration-300", idx === FLOW.length - 1 ? "flex-1" : "flex-1",
              idx <= stepIdx ? "bg-pine-600" : "bg-mist")} />
        ))}
      </div>

      {allergyBlocked && (
        <div className="mt-2.5 anim-fade-up rounded-lg border-2 border-brick-500 bg-brick-100/60 p-2.5" onPointerDown={(e) => e.stopPropagation()}>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brick-700 flex items-center gap-1.5">
            <IAlert size={11} /> Pharmacist override required
          </p>
          {!canPa ? (
            <p className="mt-1 py-1 text-center rounded bg-mist/70 text-[10px] font-bold text-inksoft">🔒 Pharmacist sign-in required to override</p>
          ) : (
            <>
              <input value={allergyReason} onChange={(e) => setAllergyReason(e.target.value)}
                placeholder="Clinical reason for dispensing despite allergy…"
                className="mt-1.5 w-full px-2 py-1.5 rounded-md border border-brick-300 bg-card text-[11px] focus:border-brick-600 focus:outline-none transition" />
              <button onClick={() => setAllergyAck(true)}
                className="mt-1.5 w-full py-1.5 rounded-md bg-brick-600 text-paper text-[11px] font-bold hover:bg-brick-500 transition active:scale-[0.97]">
                Acknowledge risk & enable dispense
              </button>
            </>
          )}
        </div>
      )}

      <div className="mt-2.5 flex gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        {next && (
          <button
            onClick={() => (dispensing ? dispense() : dispatch({ type: "RX_STATUS", id: rx.id, status: next.to }))}
            disabled={dispensing && (allergyBlocked || interactionBlocked || dupBlocked || blockers.length > 0)}
            className={cx("flex-1 py-1.5 rounded-lg text-[11px] font-bold transition active:scale-[0.97] flex items-center justify-center gap-1",
              dispensing && (allergyBlocked || interactionBlocked || dupBlocked || blockers.length > 0)
                ? "bg-brick-600 text-paper hover:bg-brick-500 cursor-not-allowed"
                : "bg-pine-700 text-pine-50 hover:bg-pine-600")}
            title={dispensing && (allergyBlocked ? "Allergy conflict — pharmacist override required" : interactionBlocked ? "Major drug interaction — pharmacist review required" : dupBlocked ? "Duplicate therapy detected — review before dispensing" : blockers.length > 0 ? blockers.join("; ") : "") || undefined}>
            <IClock size={11} />
            {allergyBlocked ? "Allergy — review required"
              : interactionBlocked ? "⚠ Interaction — review required"
              : dupBlocked ? "⚠ Duplicate therapy"
              : blockers.length > 0 ? `Blocked: ${blockers[0]}`
              : next.label}
          </button>
        )}
        {canAttach && (
          /* waiting bin → charge-on-pickup (links the Rx so payment dispenses it, W1.4);
             any other stage just parks the drug on the ticket. */
          <button onClick={() => dispatch(rx.status === "waiting"
            ? { type: "CHARGE_RX_PICKUP", rxId: rx.id }
            : { type: "RX_TO_CART", id: rx.id })}
            className="flex-1 py-1.5 rounded-lg border border-pine-200 bg-pine-50 text-pine-800 text-[11px] font-bold hover:bg-pine-100 transition active:scale-[0.97] flex items-center justify-center gap-1">
            <IRegister size={11} /> {rx.status === "waiting" ? t("prescriptions.chargeOnPickup") : t("prescriptions.attachToSale")}
          </button>
        )}
        {canBackorder && (
          <button onClick={() => dispatch({ type: "CREATE_BACKORDER", patient: rx.patient, phone: rx.phone, productId: rx.productId, qty: rx.qty })}
            className="flex-1 py-1.5 rounded-lg border border-dashed border-honey-400 bg-honey-100/50 text-honey-800 text-[11px] font-bold hover:bg-honey-100 transition active:scale-[0.97] flex items-center justify-center gap-1"
            title="Out of stock — order it for this patient and notify on arrival">
            <IBox size={11} /> Back-order · out of stock
          </button>
        )}
        {canTransferOut && (
          <button onClick={() => setShowXferOut(true)}
            className="py-1.5 px-2.5 rounded-lg border border-mist bg-card text-inksoft text-[11px] font-bold hover:border-pine-400 hover:text-pine-700 transition active:scale-[0.97] flex items-center justify-center gap-1"
            title="Transfer this prescription to another pharmacy">
            <IArrowOut size={11} /> Transfer
          </button>
        )}
        {/* attach / re-attach a photo of the paper Rx */}
        <label htmlFor={`scan-${rx.id}`}
          className="py-1.5 px-2.5 rounded-lg border border-mist bg-card text-inksoft text-[11px] font-bold hover:border-pine-400 hover:text-pine-700 transition active:scale-[0.97] flex items-center justify-center gap-1 cursor-pointer"
          title={rx.scan ? "Replace the attached scan" : "Attach a photo of the paper prescription"}>
          <IScan size={11} /> {rx.scan ? "Re-scan" : "Scan Rx"}
        </label>
        {rx.status === "dispensed" && (
          <span className="flex-1 py-1.5 rounded-lg bg-pine-100 text-pine-800 text-[11px] font-bold text-center flex items-center justify-center gap-1">
            <ICheck size={11} /> Completed & logged
          </span>
        )}
        {rx.status === "dispensed" && (
          <button onClick={() => setLabelOpen(true)}
            className="py-1.5 px-2.5 rounded-lg border border-mist bg-card text-inksoft text-[11px] font-bold hover:border-pine-400 hover:text-pine-700 transition active:scale-[0.97] flex items-center justify-center gap-1"
            title="Print a 2x1 Rx label for this dispense">
            <IPrint size={11} /> Label
          </button>
        )}
      </div>

      {showPrescriber && (
        <PrescriberModal prescriberId={rx.prescriberId} onClose={() => setShowPrescriber(false)} />
      )}
      {showXferOut && (
        <XferOutModal rx={rx} onClose={() => setShowXferOut(false)} />
      )}
      {viewScan && rx.scan && (
        <ScanViewer rx={rx} onClose={() => setViewScan(false)} />
      )}
      {labelOpen && (
        <RxLabel rx={rx} p={p} patient={patient ? { name: patient.name } : undefined} onClose={() => setLabelOpen(false)} />
      )}
    </article>
  );
}

/* Prescriber directory detail — NPI/DEA on file + every Rx this prescriber wrote (§3) */
function PrescriberModal({ prescriberId, onClose }: { prescriberId: string; onClose: () => void }) {
  const { state, prescriber } = usePos();
  const pr = prescriber(prescriberId);
  if (!pr) return null;
  const theirs = state.prescriptions
    .filter((rx) => rx.prescriberId === prescriberId)
    .sort((a, b) => b.createdAt - a.createdAt);
  const dispensed = theirs.filter((r) => r.status === "dispensed").length;

  return (
    <Modal onClose={onClose} width={560} labelledBy="pr-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="pr-title" className="font-display font-bold text-ink flex items-center gap-2">
            <span className="grid place-items-center w-8 h-8 rounded-lg bg-pine-800 text-pine-100 font-display font-bold text-sm shrink-0">
              {pr.name.replace(/^Dr\.\s*/, "").split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <span>
              {pr.name}, {pr.credentials}
              <span className="block text-[11px] font-medium text-inksoft">{pr.specialty}</span>
            </span>
          </h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <InfoTile label="NPI" value={pr.npi} mono />
          <InfoTile label="DEA" value={pr.dea} mono />
          <InfoTile label="Phone" value={pr.phone} />
          <InfoTile label="Fax" value={pr.fax} />
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <Badge tone="pine">{theirs.length} Rx on file</Badge>
          <Badge tone="mist">{dispensed} dispensed</Badge>
          {!pr.active && <Badge tone="brick">Inactive</Badge>}
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-2">Prescription history</p>
          <div className="max-h-56 overflow-y-auto scroll-slim rounded-lg border border-mist">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0">
                <tr className="bg-pine-900 text-pine-100 text-start text-[9px] uppercase tracking-[0.14em]">
                  <th className="px-3 py-2 font-bold">Rx</th>
                  <th className="px-2 py-2 font-bold">Patient</th>
                  <th className="px-2 py-2 font-bold">Product</th>
                  <th className="px-3 py-2 font-bold text-end">Status</th>
                </tr>
              </thead>
              <tbody>
                {theirs.map((rx, i) => (
                  <tr key={rx.id} className={cx("border-t border-mist/70", i % 2 === 1 && "bg-paper/60")}>
                    <td className="px-3 py-2 num font-bold text-ink">{rx.id}</td>
                    <td className="px-2 py-2 text-ink">{rx.patient}</td>
                    <td className="px-2 py-2 text-inksoft truncate max-w-[140px]">{rx.productId}</td>
                    <td className="px-3 py-2 text-end"><StatusPill status={rx.status} /></td>
                  </tr>
                ))}
                {theirs.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-inksoft">No prescriptions on file.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function InfoTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-mist bg-paper px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-inksoft">{label}</p>
      <p className={cx("text-[13px] font-semibold text-ink mt-0.5", mono && "num tracking-wide")}>{value}</p>
    </div>
  );
}

const STATUS_TONE: Record<RxStatus, string> = {
  new: "bg-mist text-ink",
  verifying: "bg-honey-100 text-honey-700",
  ready: "bg-pine-100 text-pine-700",
  waiting: "bg-honey-100 text-honey-800",
  dispensed: "bg-pine-700 text-pine-50",
};
function StatusPill({ status }: { status: RxStatus }) {
  return <span className={cx("inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide", STATUS_TONE[status])}>{status}</span>;
}

/* Rx transfer ledger — every documented in/out transfer, exportable (§3) */
function XferLogModal({ onClose }: { onClose: () => void }) {
  const { state, product } = usePos();
  const rows = [...state.rxTransfers].sort((a, b) => b.at - a.at);
  const exportCsv = () => {
    const head = ["transfer_no", "direction", "patient", "drug", "qty", "other_pharmacy", "prescriber", "refills", "pharmacist", "date"];
    const body = rows.map((r) => [
      r.transferNo, r.direction, `"${r.patient}"`, `"${r.drug}"`, r.qty,
      `"${r.otherPharmacy}"`, `"${r.prescriber}"`, r.refillsRemaining, `"${r.pharmacist}"`,
      new Date(r.at).toISOString().slice(0, 10),
    ].join(","));
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `rx-transfers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Modal onClose={onClose} width={680} labelledBy="xlog-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="xlog-title" className="font-display font-bold text-ink flex items-center gap-2">
            <ISwap size={17} className="text-pine-700" /> Prescription transfer log
          </h2>
          <p className="text-xs text-inksoft mt-0.5">Documented Rx transfers between pharmacies · {rows.length} on record</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5">
        <div className="max-h-[380px] overflow-auto scroll-slim rounded-lg border border-mist">
          <table className="w-full text-xs border-collapse min-w-[600px]">
            <thead className="sticky top-0">
              <tr className="bg-pine-900 text-pine-100 text-start text-[9px] uppercase tracking-[0.14em]">
                <th className="px-3 py-2 font-bold">Dir</th>
                <th className="px-2 py-2 font-bold">Transfer #</th>
                <th className="px-2 py-2 font-bold">Patient · drug</th>
                <th className="px-2 py-2 font-bold">Other pharmacy</th>
                <th className="px-2 py-2 font-bold text-center">Refills</th>
                <th className="px-3 py-2 font-bold">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={cx("border-t border-mist/70", i % 2 === 1 && "bg-paper/60")}>
                  <td className="px-3 py-2">
                    <span className={cx("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                      r.direction === "out" ? "bg-brick-100 text-brick-700" : "bg-pine-100 text-pine-700")}>
                      {r.direction === "out" ? <IArrowOut size={9} /> : <IArrowIn size={9} />}{r.direction}
                    </span>
                  </td>
                  <td className="px-2 py-2 num font-bold text-ink">{r.transferNo}</td>
                  <td className="px-2 py-2">
                    <p className="font-semibold text-ink">{r.patient}</p>
                    <p className="text-[10px] text-inksoft truncate max-w-[180px]">{r.drug}</p>
                  </td>
                  <td className="px-2 py-2 text-inksoft">{r.otherPharmacy}</td>
                  <td className="px-2 py-2 text-center num font-bold text-ink">{r.refillsRemaining}</td>
                  <td className="px-3 py-2 num text-inksoft">{new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-inksoft">No transfers on record.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95">
            <IDownload size={13} /> Export CSV
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* Transfer a script out — releases fill authority to another pharmacy (§3) */
function XferOutModal({ rx, onClose }: { rx: Prescription; onClose: () => void }) {
  const { dispatch, product } = usePos();
  const [pharmacy, setPharmacy] = useState("");
  const [phone, setPhone] = useState("");
  const [refills, setRefills] = useState(String(rx.refillsRemaining ?? 0));
  const [note, setNote] = useState("");
  const ok = pharmacy.trim().length >= 2 && phone.replace(/\D/g, "").length >= 7;
  return (
    <Modal onClose={onClose} width={420} labelledBy="xout-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="xout-title" className="font-display font-bold text-ink flex items-center gap-2">
            <IArrowOut size={16} className="text-brick-700" /> Transfer {rx.id} out
          </h2>
          <p className="text-xs text-inksoft mt-0.5">{rx.patient} · {product(rx.productId)?.name} × {rx.qty}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Receiving pharmacy *</label>
          <input autoFocus value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} placeholder="e.g. Lakeview Pharmacy" className={xfIn} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Their phone *</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" className={cx(xfIn, "num")} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Refills remaining</label>
            <input value={refills} onChange={(e) => setRefills(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={cx(xfIn, "num")} />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Transfer note</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" className={xfIn} />
        </div>
        <p className="text-[10px] text-inksoft">Fill authority moves to the receiving pharmacy. This is recorded in the transfer log and cannot be dispensed here afterwards.</p>
        <button disabled={!ok}
          onClick={() => {
            dispatch({ type: "TRANSFER_RX_OUT", prescriptionId: rx.id, otherPharmacy: pharmacy.trim(), otherPhone: phone.trim(), refillsRemaining: parseInt(refills) || 0, note });
            onClose();
          }}
          className={cx("w-full py-2.5 rounded-lg font-display font-bold text-sm transition-all flex items-center justify-center gap-2",
            ok ? "bg-brick-600 text-paper hover:bg-brick-700 active:scale-[0.98] shadow-lift" : "bg-mist text-inksoft cursor-not-allowed")}>
          <IArrowOut size={14} /> Release transfer
        </button>
      </div>
    </Modal>
  );
}

/* Accept an incoming transfer — creates a new script queued for review (§3) */
function XferInModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePos();
  const [patient, setPatient] = useState("");
  const [phone, setPhone] = useState("");
  const [productId, setProductId] = useState(state.products.find((p) => p.rx)?.id ?? state.products[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [pharmacy, setPharmacy] = useState("");
  const [phPhone, setPhPhone] = useState("");
  const [prescriberId, setPrescriberId] = useState(state.prescribers[0]?.id ?? "");
  const [refills, setRefills] = useState("0");
  const ok = patient.trim().length >= 2 && pharmacy.trim().length >= 2 && productId && prescriberId;
  return (
    <Modal onClose={onClose} width={480} labelledBy="xin-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="xin-title" className="font-display font-bold text-ink flex items-center gap-2">
            <IArrowIn size={16} className="text-pine-700" /> Accept a transfer in
          </h2>
          <p className="text-xs text-inksoft mt-0.5">Creates a new script from another pharmacy, queued for pharmacist review</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Patient name *</label>
            <input autoFocus value={patient} onChange={(e) => setPatient(e.target.value)} placeholder="Full name" className={xfIn} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Patient phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" className={cx(xfIn, "num")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Drug (match to catalog) *</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className={xfIn}>
              {state.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Qty</label>
            <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={cx(xfIn, "num")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Originating pharmacy *</label>
            <input value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} placeholder="e.g. Cedar Grove Rx" className={xfIn} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Their phone</label>
            <input value={phPhone} onChange={(e) => setPhPhone(e.target.value)} placeholder="(555) 000-0000" className={cx(xfIn, "num")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Prescriber *</label>
            <select value={prescriberId} onChange={(e) => setPrescriberId(e.target.value)} className={xfIn}>
              {state.prescribers.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Refills remaining</label>
            <input value={refills} onChange={(e) => setRefills(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={cx(xfIn, "num")} />
          </div>
        </div>
        <button disabled={!ok}
          onClick={() => {
            dispatch({ type: "TRANSFER_RX_IN", patient: patient.trim(), phone, productId, qty: parseInt(qty) || 1, otherPharmacy: pharmacy.trim(), otherPhone: phPhone.trim(), prescriberId, refillsRemaining: parseInt(refills) || 0 });
            onClose();
          }}
          className={cx("w-full py-2.5 rounded-lg font-display font-bold text-sm transition-all flex items-center justify-center gap-2",
            ok ? "bg-pine-700 text-pine-50 hover:bg-pine-600 active:scale-[0.98] shadow-lift" : "bg-mist text-inksoft cursor-not-allowed")}>
          <IArrowIn size={14} /> Accept & queue for review
        </button>
      </div>
    </Modal>
  );
}

const xfIn = "w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition";

/* View an attached hard-copy scan, with re-scan and remove (§3) */
function ScanViewer({ rx, onClose }: { rx: Prescription; onClose: () => void }) {
  const { dispatch } = usePos();
  return (
    <Modal onClose={onClose} width={520} labelledBy="scan-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="scan-title" className="font-display font-bold text-ink flex items-center gap-2">
            <IScan size={17} className="text-pine-700" /> Hard-copy scan · {rx.id}
          </h2>
          <p className="text-xs text-inksoft mt-0.5">{rx.patient} · attached {relTime(rx.scanAt ?? rx.createdAt)}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5">
        <div className="rounded-xl border border-mist overflow-hidden bg-paper">
          <img src={rx.scan} alt={`Scanned prescription for ${rx.patient}`} className="w-full h-auto max-h-[420px] object-contain" />
        </div>
        <div className="mt-4 flex justify-between gap-2">
          <label htmlFor={`scan-${rx.id}`}
            className="px-4 py-2 rounded-lg border border-pine-300 bg-pine-50 text-pine-800 text-xs font-bold hover:bg-pine-100 transition active:scale-95 cursor-pointer flex items-center gap-1.5"
            onClick={onClose}>
            <IScan size={13} /> Replace scan
          </label>
          <button onClick={() => { dispatch({ type: "SCAN_REMOVE", id: rx.id }); onClose(); }}
            className="px-4 py-2 rounded-lg border border-brick-300 bg-brick-100/50 text-brick-700 text-xs font-bold hover:bg-brick-100 transition active:scale-95 flex items-center gap-1.5">
            <IX size={13} /> Remove
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* New-prescription intake — the manual entry path before e-prescribing lands (§3) */
function IntakeModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePos();
  const [patient, setPatient] = useState("");
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [productId, setProductId] = useState(state.products.find((p) => p.rx)?.id ?? state.products[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [prescriberId, setPrescriberId] = useState(state.prescribers[0]?.id ?? "");
  const [daysSupply, setDaysSupply] = useState("30");
  const [refills, setRefills] = useState("0");
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState("");
  const [memberId, setMemberId] = useState("");
  const ok = patient.trim().length >= 2 && parseInt(age) > 0 && productId && prescriberId && parseInt(qty) > 0;
  const expiryIso = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  return (
    <Modal onClose={onClose} width={520} labelledBy="intake-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="intake-title" className="font-display font-bold text-ink flex items-center gap-2">
            <IRx size={17} className="text-brick-700" /> New prescription intake
          </h2>
          <p className="text-xs text-inksoft mt-0.5">Drops a script into the queue for pharmacist review</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3 max-h-[62vh] overflow-y-auto scroll-slim">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Patient name *</label>
            <input autoFocus value={patient} onChange={(e) => setPatient(e.target.value)} placeholder="Full name" className={xfIn} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Age *</label>
            <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="45" className={cx(xfIn, "num")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Patient phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" className={cx(xfIn, "num")} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Prescriber *</label>
            <select value={prescriberId} onChange={(e) => setPrescriberId(e.target.value)} className={xfIn}>
              {state.prescribers.filter((p) => p.active && !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <div className="col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Drug (catalog) *</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className={xfIn}>
              {state.products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.rx ? " ℞" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Qty *</label>
            <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={cx(xfIn, "num")} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Days supply</label>
            <input value={daysSupply} onChange={(e) => setDaysSupply(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={cx(xfIn, "num")} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Refills auth.</label>
            <input value={refills} onChange={(e) => setRefills(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={cx(xfIn, "num")} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Sig / note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="1 tab daily" className={xfIn} />
          </div>
        </div>
        <div className="rounded-lg border border-mist bg-paper/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-2">Insurance (optional)</p>
          <div className="grid grid-cols-2 gap-2.5">
            <input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Plan · e.g. BlueCross PBM" className={xfIn} />
            <input value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="Member ID" className={cx(xfIn, "num")} />
          </div>
        </div>
        <button disabled={!ok}
          onClick={() => {
            dispatch({
              type: "NEW_PRESCRIPTION",
              intake: {
                patient, age: parseInt(age), phone, productId, qty: parseInt(qty),
                prescriberId, daysSupply: parseInt(daysSupply) || undefined,
                refillsAuthorized: parseInt(refills) || undefined, rxExpiry: expiryIso,
                note, insurancePlan: plan, memberId,
              },
            });
            onClose();
          }}
          className={cx("w-full py-2.5 rounded-lg font-display font-bold text-sm transition-all flex items-center justify-center gap-2",
            ok ? "bg-pine-700 text-pine-50 hover:bg-pine-600 active:scale-[0.98] shadow-lift" : "bg-mist text-inksoft cursor-not-allowed")}>
          <IPlus size={15} /> Drop off for review
        </button>
      </div>
    </Modal>
  );
}

/* ================================================================== */
/*  Phase G — AI OCR prescription intake                              */
/* ================================================================== */

/** Reuse the existing hard-copy scan resize helper (client-side JPEG data URL). */
const ocrResize = resizeToDataUrl;

/** Phase G (P1): photo/paste → aiOcr → pharmacist review → NEW_PRESCRIPTION.
 *  AI output never auto-applies: every field lands in an editable review form,
 *  and failures degrade to a toast + no crash (function may be undeployed). */
function OcrIntakeModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { state, dispatch } = usePos();
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [rx, setRx] = useState<OcrResult | null>(null);

  /* editable extracted fields — the pharmacist reviews/edits before creating */
  const [medication, setMedication] = useState("");
  const [dose, setDose] = useState("");
  const [sig, setSig] = useState("");
  const [qty, setQty] = useState("");
  const [refills, setRefills] = useState("");
  const [prescriberText, setPrescriberText] = useState("");
  const [patient, setPatient] = useState("");

  /* fuzzy catalog match over the (edited) medication text */
  const suggestions = useMemo(() => suggestProducts(medication, state.products), [medication, state.products]);
  const [productId, setProductId] = useState("");

  const applyResult = (res: OcrResult) => {
    setRx(res);
    setMedication(res.medication ?? "");
    setDose(res.dose ?? "");
    setSig(res.sig ?? "");
    setQty(res.qty ?? "");
    setRefills(res.refills ?? "");
    setPrescriberText(res.prescriber ?? "");
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const url = await ocrResize(file, 1024);
      setImage(url);
      await runOcr(url);
    } catch {
      dispatch({ type: "TOAST", kind: "error", msg: t("ai.ocrFailed") });
    }
  };

  const runOcr = async (dataUrl: string) => {
    setBusy(true);
    setError(false);
    try {
      const res = await aiOcr(dataUrl);
      if (!res || (!res.medication && !res.sig)) {
        dispatch({ type: "TOAST", kind: "warn", msg: t("ai.ocrEmptyFields") });
      }
      applyResult(res);
    } catch {
      setError(true);
      dispatch({ type: "TOAST", kind: "error", msg: t("ai.ocrFailed") });
    } finally {
      setBusy(false);
    }
  };

  const onPaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((ty) => ty.startsWith("image/"));
        if (type) {
          const blob = await item.getType(type);
          const url = await ocrResize(new File([blob], "paste.jpg", { type }), 1024);
          setImage(url);
          await runOcr(url);
          return;
        }
      }
      dispatch({ type: "TOAST", kind: "info", msg: t("ai.ocrPasteFailed") });
    } catch {
      dispatch({ type: "TOAST", kind: "info", msg: t("ai.ocrPasteFailed") });
    }
  };

  const canCreate = patient.trim().length >= 2 && productId && parseInt(qty, 10) > 0;
  const create = () => {
    if (!canCreate) return;
    dispatch({
      type: "NEW_PRESCRIPTION",
      intake: {
        patient: patient.trim(),
        age: 45, // unknown from OCR — pharmacist corrects during review stage
        productId,
        qty: parseInt(qty, 10) || 30,
        prescriberId: state.prescribers[0]?.id ?? "",
        refillsAuthorized: parseInt(refills, 10) || undefined,
        rxExpiry: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
        note: [sig, dose && `dose: ${dose}`, prescriberText && `prescriber: ${prescriberText}`].filter(Boolean).join(" · "),
      },
    });
    dispatch({ type: "AUDIT_LOG", kind: "rx", detail: `AI OCR intake — fields reviewed by ${state.user?.name ?? "pharmacist"} before queueing` });
    dispatch({ type: "TOAST", kind: "success", msg: t("ai.ocrCreated") });
    onClose();
  };

  return (
    <Modal onClose={onClose} width={560} labelledBy="ocr-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="ocr-title" className="font-display font-bold text-ink flex items-center gap-2">
            <ISpark size={17} className="text-pine-700" /> {t("ai.ocrTitle")}
          </h2>
          <p className="text-xs text-inksoft mt-0.5">{t("ai.ocrHint")}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label={t("common.close")}><IX size={14} /></button>
      </div>

      <div className="p-5 space-y-4 max-h-[64vh] overflow-y-auto scroll-slim">
        {!image && (
          <div>
            <input type="file" accept="image/*" capture="environment" className="hidden" id="ai-ocr-file" onChange={onFile} />
            <div className="flex gap-2">
              <label htmlFor="ai-ocr-file"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-pine-300 bg-pine-50/60 text-pine-800 text-sm font-bold hover:bg-pine-100 transition cursor-pointer active:scale-[0.98]">
                <IScan size={16} /> {t("ai.ocrPickImage")}
              </label>
              <button onClick={onPaste}
                className="px-4 py-3 rounded-lg border border-mist bg-card text-xs font-bold text-ink hover:border-pine-400 hover:bg-pine-50 transition active:scale-[0.98]">
                {t("ai.ocrPasteImage")}
              </button>
            </div>
          </div>
        )}

        {image && (
          <div className="rounded-xl border border-mist overflow-hidden bg-paper">
            <img src={image} alt="Prescription to extract" className="w-full max-h-40 object-contain" />
            {busy && (
              <p className="px-3 py-2 text-[11px] font-bold text-honey-700 bg-honey-100/60 anim-fade-up flex items-center gap-1.5">
                <IClock size={11} /> {t("ai.ocrRunning")}
              </p>
            )}
            {error && (
              <button onClick={() => runOcr(image)}
                className="w-full px-3 py-2 text-[11px] font-bold text-brick-700 bg-brick-100/50 hover:bg-brick-100 transition text-start">
                {t("ai.ocrFailed")} — click to retry
              </button>
            )}
          </div>
        )}

        {(rx || error) && !busy && (
          <div className="space-y-3 anim-fade-up">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-honey-700 flex items-center gap-1.5">
              <IAlert size={10} /> {t("ai.ocrReviewTitle")} — {t("ai.ocrReviewHint")}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("ai.ocrPatientName")}</label>
                <input autoFocus value={patient} onChange={(e) => setPatient(e.target.value)} placeholder="Full name"
                  className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("ai.ocrMedication")}</label>
                <input value={medication} onChange={(e) => { setMedication(e.target.value); setProductId(""); }}
                  className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("ai.ocrDose")}</label>
                <input value={dose} onChange={(e) => setDose(e.target.value)}
                  className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("ai.ocrSig")}</label>
                <input value={sig} onChange={(e) => setSig(e.target.value)}
                  className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("ai.ocrQty")}</label>
                <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric"
                  className="num w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("ai.ocrRefills")}</label>
                <input value={refills} onChange={(e) => setRefills(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric"
                  className="num w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition" />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("ai.ocrCatalogMatch")}</label>
                {suggestions.length > 0 ? (
                  <select value={productId} onChange={(e) => setProductId(e.target.value)}
                    className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition">
                    <option value="">—</option>
                    {suggestions.map((s) => (
                      <option key={s.productId} value={s.productId}>{s.name} ({s.generic})</option>
                    ))}
                  </select>
                ) : (
                  <select value={productId} onChange={(e) => setProductId(e.target.value)}
                    className="w-full mt-1 px-2.5 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition">
                    <option value="">{t("ai.ocrNoMatch")}</option>
                    {state.products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.rx ? " ℞" : ""}</option>)}
                  </select>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {(rx || error) && !busy && (
        <div className="px-5 py-4 border-t border-mist flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-mist text-xs font-semibold text-inksoft hover:text-ink hover:border-ink/30 transition">
            {t("ai.ocrCancel")}
          </button>
          <button onClick={create} disabled={!canCreate}
            className={cx("flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition active:scale-95",
              canCreate ? "bg-pine-700 text-pine-50 hover:bg-pine-600 shadow-lift" : "bg-mist text-inksoft cursor-not-allowed")}>
            <IPlus size={13} /> {t("ai.ocrCreateRx")}
          </button>
        </div>
      )}
    </Modal>
  );
}

/* ================================================================== */
/*  Rx label — printable 2×1" label for dispensed prescriptions (§6)  */
/* ================================================================== */

/** Build a 2×1" pharmacy label as an HTML blob that triggers the browser
 *  print dialog on the label iframe. Called from PrescriptionCard when an Rx
 *  is marked dispensed. */
export function RxLabel({ rx, p, patient, onClose }: { rx: Prescription; p?: Product; patient?: { name: string }; onClose: () => void }) {
  const { state } = usePos();
  const s = state.settings;
  const labelId = `rx-label-${rx.id}-${Date.now()}`;
  const print = () => {
    const iframe = document.getElementById(labelId) as HTMLIFrameElement | null;
    const w = iframe?.contentWindow;
    if (w) {
      w.focus();
      w.print();
    }
  };
  return (
    <Modal onClose={onClose} width={320} labelledBy="label-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="label-title" className="font-display font-bold text-ink flex items-center gap-2"><IPrint size={17} className="text-pine-700" /> Rx label — {rx.id}</h2>
          <p className="text-xs text-inksoft mt-0.5">2×1" thermal label preview</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-4">
        <div className="border-2 border-dashed border-mist rounded-lg p-2 text-center mb-4">
          <p className="text-[9px] font-bold uppercase tracking-wide text-inksoft">2" × 1" label</p>
          <p className="text-[10px] text-inksoft mt-1">Prints at 203 DPI thermal</p>
        </div>
        <button onClick={print}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-[0.98]">
          <IPrint size={14} /> Print label
        </button>
        <p className="mt-2 text-[10px] text-inksoft text-center">Opens a print preview — select your 2×1" label roll printer.</p>
      </div>
      <iframe id={labelId} title={`Rx label for ${rx.id}`}
        className="hidden"
        srcDoc={`
          <!doctype html>
          <html><head><style>
            @page { size: 2in 1in; margin: 0; }
            body { margin: 0; padding: 2px 4px; font-family: monospace; font-size: 6px; line-height: 1.1; }
            .h { font-size: 8px; font-weight: bold; letter-spacing: 0.5px; }
            .l { display: block; }
            .row { margin-bottom: 1px; }
          </style></head>
          <body>
            <div class="h">${s.orgName || "Pharmacy"}</div>
            <div class="row"><span class="l">℞ ${rx.id}</span><span class="l" style="float:right">Qty: ${rx.qty}</span></div>
            <div class="row"><span class="l">${p?.name || rx.productId}</span></div>
            <div class="row"><span class="l">Pts: ${patient?.name || rx.patient}</span></div>
            <div class="row"><span class="l">SIG: ${rx.note || "—"}</span></div>
            <div class="row"><span class="l">Refills: ${rx.refillsRemaining ?? 0}/${rx.refillsAuthorized ?? "–"}</span></div>
            <div class="row"><span class="l">Exp: ${rx.rxExpiry || "—"}</span></div>
            <div class="row" style="margin-top:2px;font-weight:bold">${s.terminalId || "REG-1"}</div>
          </body></html>`}
      />
    </Modal>
  );
}

/* ================================================================== */
/*  W4.1 — Claims tab (sandbox payer)                                 */
/* ================================================================== */

function ClaimsTab() {
  const { t } = useTranslation();
  const { state, dispatch, product, money } = usePos();
  const [rxId, setRxId] = useState<string>("");
  const [plan, setPlan] = useState("");

  const dispensed = useMemo(
    () => state.prescriptions.filter((r) => r.status === "dispensed"),
    [state.prescriptions],
  );

  const claims = useMemo(
    () => [...state.rxClaims].sort((a, b) => b.submittedAt - a.submittedAt),
    [state.rxClaims],
  );

  const submitClaim = () => {
    if (!rxId) return;
    dispatch({ type: "CLAIM_SUBMIT", prescriptionId: rxId, plan: plan || undefined });
    setRxId("");
    setPlan("");
  };

  const statusLabel: Record<string, string> = {
    submitted: t("claims.st_submitted"),
    paid: t("claims.st_paid"),
    rejected: t("claims.st_rejected"),
    resubmitted: t("claims.st_resubmitted"),
  };

  const statusChip: Record<string, string> = {
    submitted: "bg-honey-100 text-honey-700",
    paid: "bg-pine-100 text-pine-700",
    rejected: "bg-brick-100 text-brick-700",
    resubmitted: "bg-indigo-100 text-indigo-700",
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft flex items-center gap-1.5">
          <IClipboard size={12} /> {t("claims.subtitle")}
        </p>
        <div className="flex-1" />
        <p className="text-[10px] text-inksoft flex items-center gap-1">
          <IInfo size={12} className="inline" /> {t("claims.sandboxNote")}
        </p>
      </div>

      {/* Submit a claim from a dispensed Rx */}
      <div className="mt-3 rounded-xl border border-mist bg-card p-3.5 flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">{t("claims.submittedAt")}</label>
          <select
            value={rxId}
            onChange={(e) => {
              setRxId(e.target.value);
              const rx = dispensed.find((r) => r.id === e.target.value);
              setPlan(rx?.insurance?.plan ?? "");
            }}
            className="rounded-lg border border-mist bg-paper px-2.5 py-2 text-sm focus:border-pine-500 focus:outline-none"
          >
            <option value="">{t("claims.noDispensed")}</option>
            {dispensed.map((r) => {
              const p = product(r.productId);
              return (
                <option key={r.id} value={r.id}>
                  {r.id} — {r.patient} · {p?.name ?? r.productId} · {r.insurance?.plan ?? "No insurance"}
                </option>
              );
            })}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[120px]">
          <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">{t("claims.payer")}</label>
          <input
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="BlueCross PBM"
            className="rounded-lg border border-mist bg-paper px-2.5 py-2 text-sm focus:border-pine-500 focus:outline-none"
          />
        </div>
        <button
          onClick={submitClaim}
          disabled={!rxId}
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95 shadow-lift disabled:opacity-40"
        >
          <IPlus size={14} /> {t("claims.submit")}
        </button>
      </div>

      {/* Claims list */}
      <div className="mt-3.5 flex-1 min-h-0 overflow-y-auto scroll-slim pb-4">
        {claims.length === 0 ? (
          <p className="text-xs text-inksoft px-1">{t("claims.empty")}</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-inksoft font-bold uppercase tracking-[0.12em] text-[10px] border-b border-mist">
                <th className="text-start py-2 px-1">{t("claims.patient")}</th>
                <th className="text-start py-2 px-1">{t("claims.drug")}</th>
                <th className="text-end py-2 px-1">{t("claims.qty")}</th>
                <th className="text-end py-2 px-1">{t("claims.amount")}</th>
                <th className="text-start py-2 px-1">{t("claims.payer")}</th>
                <th className="text-start py-2 px-1">{t("claims.status")}</th>
                <th className="text-end py-2 px-1">{t("claims.submittedAt")}</th>
                <th className="text-end py-2 px-1" />
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-b border-mist/60 hover:bg-mist/20 transition">
                  <td className="py-2.5 px-1 font-semibold text-ink">{c.patient}</td>
                  <td className="py-2.5 px-1 text-inksoft">{c.drug}</td>
                  <td className="py-2.5 px-1 text-end num text-ink">{c.qty}</td>
                  <td className="py-2.5 px-1 text-end num text-ink">{money(c.amount / 100)}</td>
                  <td className="py-2.5 px-1 text-inksoft">{c.payer}</td>
                  <td className="py-2.5 px-1">
                    <span className={cx("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold", statusChip[c.status] ?? "")}>
                      {statusLabel[c.status] ?? c.status}
                    </span>
                    {Boolean(c.adjudication?.rejectCode) && (
                      <span className="ms-1 text-[10px] text-brick-700">({String(c.adjudication?.rejectCode)})</span>
                    )}
                  </td>
                  <td className="py-2.5 px-1 text-end num text-inksoft">{relTime(c.submittedAt)}</td>
                  <td className="py-2.5 px-1 text-end">
                    {c.status === "submitted" && (
                      <button
                        onClick={() => dispatch({ type: "CLAIM_ADJUDICATE", id: c.id })}
                        className="px-2 py-1 rounded-md bg-pine-700 text-pine-50 text-[10px] font-bold hover:bg-pine-600 transition active:scale-95"
                      >
                        {t("claims.adjudicate")}
                      </button>
                    )}
                    {c.status === "paid" && (
                      <button
                        onClick={() => dispatch({ type: "CLAIM_REVERSE", id: c.id })}
                        className="px-2 py-1 rounded-md border border-honey-400 bg-honey-100/50 text-honey-700 text-[10px] font-bold hover:bg-honey-100 transition active:scale-95"
                      >
                        {t("claims.reverse")}
                      </button>
                    )}
                    {c.status === "rejected" && (
                      <button
                        onClick={() => dispatch({ type: "CLAIM_SUBMIT", prescriptionId: c.prescriptionId, plan: c.payer })}
                        className="px-2 py-1 rounded-md border border-mist bg-card text-ink text-[10px] font-bold hover:border-pine-400 hover:text-pine-700 transition active:scale-95"
                      >
                        {t("claims.resubmit")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
