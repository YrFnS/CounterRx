import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners,
  useDraggable, useDroppable,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { usePos, relTime } from "../store";
import { stockOf } from "../data";
import type { RxStatus, Prescription } from "../data";
import { cx, Badge } from "../ui";
import { IRx, ICheck, IClock, IRegister, IShield, IGrab, IRefresh, ISend } from "../icons";

const FLOW: RxStatus[] = ["new", "verifying", "ready", "dispensed"];
const LABEL: Record<RxStatus, string> = {
  new: "Dropped off", verifying: "Pharmacist review", ready: "Ready for pickup", dispensed: "Dispensed",
};
const ACCENT: Record<RxStatus, { bar: string; chip: string }> = {
  new: { bar: "#5c6b66", chip: "bg-mist/70 text-ink" },
  verifying: { bar: "#e0a63c", chip: "bg-honey-100 text-honey-700" },
  ready: { bar: "#3b8668", chip: "bg-pine-100 text-pine-700" },
  dispensed: { bar: "#0f4437", chip: "bg-ink text-paper" },
};
const NEXT: Partial<Record<RxStatus, { to: RxStatus; label: string }>> = {
  new: { to: "verifying", label: "Start review" },
  verifying: { to: "ready", label: "Mark ready" },
  ready: { to: "dispensed", label: "Dispense" },
};

export default function Prescriptions() {
  const { state, dispatch, product } = usePos();
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
                    filled {r.dispensedAt ? relTime(r.dispensedAt) : "—"} · {r.prescriber}
                    {r.remindedAt && <span className="text-pine-700 font-bold"> · reminded {relTime(r.remindedAt)}</span>}
                  </p>
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
        <div className="mt-4 flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 pb-4">
          {FLOW.map((status) => (
            <Column key={status} status={status} ghostId={activeId}
              items={state.prescriptions.filter((r) => r.status === status).sort((a, b) => a.createdAt - b.createdAt)}
              highlight={overCol === status && activeId !== null}
              dimmed={activeId !== null && overCol !== status} />
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
  const { state, dispatch, product } = usePos();
  const { attributes, listeners, setNodeRef } = useDraggable({ id: rx.id });
  const p = product(rx.productId);
  const shelf = p ? stockOf(p) : 0;
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
        <p className="text-[10px] text-inksoft">by <span className="font-semibold text-ink">{rx.prescriber}</span></p>
        {rx.note && (
          <p className="mt-1.5 text-[10px] leading-snug text-honey-700 bg-honey-100/70 border border-honey-300/50 rounded-md px-2 py-1">
            ⚑ {rx.note}
          </p>
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
            {rx.insurance.status === "pending" && (state.user?.role === "cashier" ? (
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
            <IRegister size={11} /> Attach to sale
          </button>
        )}
        {rx.status === "dispensed" && (
          <span className="flex-1 py-1.5 rounded-lg bg-pine-100 text-pine-800 text-[11px] font-bold text-center flex items-center justify-center gap-1">
            <ICheck size={11} /> Completed & logged
          </span>
        )}
      </div>
    </article>
  );
}
