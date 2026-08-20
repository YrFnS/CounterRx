import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners,
  useDraggable, useDroppable,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { usePos, relTime } from "../store";
import { stockOf, can, daysUntil } from "../data";
import type { RxStatus, Prescription } from "../data";
import { cx, Badge, Modal } from "../ui";
import { IRx, ICheck, IClock, IRegister, IShield, IGrab, IRefresh, ISend, IRecall, IX } from "../icons";

const FLOW: RxStatus[] = ["new", "verifying", "ready", "waiting", "dispensed"];
const LABEL: Record<RxStatus, string> = {
  new: "Dropped off", verifying: "Pharmacist review", ready: "Filled", waiting: "Waiting bin", dispensed: "Dispensed",
};
const ACCENT: Record<RxStatus, { bar: string; chip: string }> = {
  new: { bar: "#5c6b66", chip: "bg-mist/70 text-ink" },
  verifying: { bar: "#e0a63c", chip: "bg-honey-100 text-honey-700" },
  ready: { bar: "#3b8668", chip: "bg-pine-100 text-pine-700" },
  waiting: { bar: "#c98d5f", chip: "bg-honey-100 text-honey-800" },
  dispensed: { bar: "#0f4437", chip: "bg-ink text-paper" },
};
const NEXT: Partial<Record<RxStatus, { to: RxStatus; label: string }>> = {
  new: { to: "verifying", label: "Start review" },
  verifying: { to: "ready", label: "Mark filled" },
  ready: { to: "waiting", label: "To waiting bin" },
  waiting: { to: "dispensed", label: "Hand over" },
};

export default function Prescriptions() {
  const { state, dispatch, product, prescriber } = usePos();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<RxStatus | null>(null);

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
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft flex items-center gap-1.5">
            <IGrab size={12} /> Drag cards between stages — or use the action buttons
          </p>
        </div>
        <div className="flex-1" />
        <p className="flex items-center gap-1.5 text-xs text-inksoft">
          <IShield size={14} className="text-pine-600" /> Pharmacist on duty: <span className="font-semibold text-ink">R. Mensah, RPh</span>
        </p>
      </div>

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
    </div>
  );
}

function Column({ status, items, highlight, dimmed, ghostId }: {
  status: RxStatus; items: Prescription[]; highlight: boolean; dimmed: boolean; ghostId: string | null;
}) {
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

function RxCard({ rx, ghost, overlay }: { rx: Prescription; ghost?: boolean; overlay?: boolean }) {
  const { state, dispatch, product, prescriber } = usePos();
  const { attributes, listeners, setNodeRef } = useDraggable({ id: rx.id });
  const p = product(rx.productId);
  const shelf = p ? stockOf(p) : 0;
  const [showPrescriber, setShowPrescriber] = useState(false);
  const stepIdx = FLOW.indexOf(rx.status);
  const next = NEXT[rx.status];
  const canAttach = rx.status !== "dispensed" && p && shelf > 0;

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
      </div>

      {/* mini pipeline */}
      <div className="mt-2.5 flex items-center gap-1">
        {FLOW.map((s, idx) => (
          <span key={s} title={LABEL[s]}
            className={cx("h-1.5 rounded-full transition-all duration-300", idx === FLOW.length - 1 ? "flex-1" : "flex-1",
              idx <= stepIdx ? "bg-pine-600" : "bg-mist")} />
        ))}
      </div>

      <div className="mt-2.5 flex gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        {next && (
          <button onClick={() => dispatch({ type: "RX_STATUS", id: rx.id, status: next.to })}
            className="flex-1 py-1.5 rounded-lg bg-pine-700 text-pine-50 text-[11px] font-bold hover:bg-pine-600 transition active:scale-[0.97] flex items-center justify-center gap-1">
            <IClock size={11} /> {next.label}
          </button>
        )}
        {canAttach && (
          <button onClick={() => dispatch({ type: "RX_TO_CART", id: rx.id })}
            className="flex-1 py-1.5 rounded-lg border border-pine-200 bg-pine-50 text-pine-800 text-[11px] font-bold hover:bg-pine-100 transition active:scale-[0.97] flex items-center justify-center gap-1">
            <IRegister size={11} /> {rx.status === "waiting" ? "Charge at pickup" : "Attach to sale"}
          </button>
        )}
        {rx.status === "dispensed" && (
          <span className="flex-1 py-1.5 rounded-lg bg-pine-100 text-pine-800 text-[11px] font-bold text-center flex items-center justify-center gap-1">
            <ICheck size={11} /> Completed & logged
          </span>
        )}
      </div>

      {showPrescriber && (
        <PrescriberModal prescriberId={rx.prescriberId} onClose={() => setShowPrescriber(false)} />
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
                <tr className="bg-pine-900 text-pine-100 text-left text-[9px] uppercase tracking-[0.14em]">
                  <th className="px-3 py-2 font-bold">Rx</th>
                  <th className="px-2 py-2 font-bold">Patient</th>
                  <th className="px-2 py-2 font-bold">Product</th>
                  <th className="px-3 py-2 font-bold text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {theirs.map((rx, i) => (
                  <tr key={rx.id} className={cx("border-t border-mist/70", i % 2 === 1 && "bg-paper/60")}>
                    <td className="px-3 py-2 num font-bold text-ink">{rx.id}</td>
                    <td className="px-2 py-2 text-ink">{rx.patient}</td>
                    <td className="px-2 py-2 text-inksoft truncate max-w-[140px]">{rx.productId}</td>
                    <td className="px-3 py-2 text-right"><StatusPill status={rx.status} /></td>
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
