import { useState } from "react";
import { usePos, relTime } from "../store";
import type { RxStatus } from "../data";
import { cx, Badge, Empty } from "../ui";
import { IRx, ICheck, IClock, IRegister, IShield } from "../icons";

const FLOW: RxStatus[] = ["new", "verifying", "ready", "dispensed"];
const LABEL: Record<RxStatus, string> = {
  new: "Dropped off", verifying: "Pharmacist review", ready: "Ready for pickup", dispensed: "Dispensed",
};
const NEXT: Partial<Record<RxStatus, { to: RxStatus; label: string }>> = {
  new: { to: "verifying", label: "Start review" },
  verifying: { to: "ready", label: "Mark ready" },
  ready: { to: "dispensed", label: "Dispense" },
};

export default function Prescriptions() {
  const { state, dispatch, product } = usePos();
  const [tab, setTab] = useState<RxStatus | "active">("active");

  const list = state.prescriptions
    .filter((r) => (tab === "active" ? r.status !== "dispensed" : r.status === tab))
    .sort((a, b) => FLOW.indexOf(a.status) - FLOW.indexOf(b.status) || a.createdAt - b.createdAt);

  const counts = {
    active: state.prescriptions.filter((r) => r.status !== "dispensed").length,
    new: state.prescriptions.filter((r) => r.status === "new").length,
    verifying: state.prescriptions.filter((r) => r.status === "verifying").length,
    ready: state.prescriptions.filter((r) => r.status === "ready").length,
    dispensed: state.prescriptions.filter((r) => r.status === "dispensed").length,
  };

  return (
    <div className="h-full flex flex-col px-6 py-5 min-h-0">
      <div className="flex items-center gap-2 flex-wrap">
        {([["active", "Active queue"], ...FLOW.map((s) => [s, LABEL[s]])] as [RxStatus | "active", string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cx("px-3 py-2 rounded-lg border text-xs font-semibold transition-all",
              tab === id ? "bg-ink text-paper border-ink shadow-lift" : "bg-card border-mist text-inksoft hover:border-pine-300 hover:text-ink")}>
            {label} <span className={cx("num text-[10px] ml-1", tab === id ? "text-paper/70" : "text-inksoft/70")}>{counts[id]}</span>
          </button>
        ))}
        <div className="flex-1" />
        <p className="flex items-center gap-1.5 text-xs text-inksoft">
          <IShield size={14} className="text-pine-600" /> Pharmacist on duty: <span className="font-semibold text-ink">R. Mensah, RPh</span>
        </p>
      </div>

      <div className="mt-4 flex-1 min-h-0 overflow-y-auto scroll-slim">
        {list.length === 0 ? (
          <div className="h-full grid place-items-center">
            <Empty icon={<IRx size={22} />} title="Queue is clear" hint="No prescriptions in this state. New drops appear here in real time." />
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 2xl:grid-cols-3 gap-3.5 pb-6">
            {list.map((rx, i) => {
              const p = product(rx.productId);
              const stepIdx = FLOW.indexOf(rx.status);
              const next = NEXT[rx.status];
              const canAttach = rx.status !== "dispensed" && p && p.stock > 0;
              return (
                <article key={rx.id} style={{ animationDelay: `${i * 45}ms` }}
                  className={cx("anim-fade-up bg-card border rounded-xl p-4 flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
                    rx.status === "ready" ? "border-pine-300" : rx.status === "verifying" ? "border-honey-300/80" : "border-mist")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="num text-[11px] font-bold text-inksoft tracking-wide">{rx.id} · {relTime(rx.createdAt)}</p>
                      <h3 className="font-display font-bold text-ink text-[15px] leading-tight mt-0.5">
                        {rx.patient} <span className="text-inksoft font-medium text-xs">· {rx.age}y</span>
                      </h3>
                    </div>
                    <Badge tone={rx.status === "new" ? "mist" : rx.status === "verifying" ? "honey" : rx.status === "ready" ? "pine" : "ink"}>
                      {LABEL[rx.status]}
                    </Badge>
                  </div>

                  <div className="mt-3 bg-paper border border-mist rounded-lg px-3 py-2.5">
                    <p className="text-sm font-semibold text-ink flex items-center gap-1.5">
                      <span className="text-brick-700 font-display">℞</span> {p?.name ?? rx.productId}
                      <span className="num text-xs font-bold text-inksoft">× {rx.qty}</span>
                    </p>
                    <p className="text-[11px] text-inksoft mt-0.5">{p?.form} · {p ? `${p.stock} on shelf` : "unknown product"}</p>
                    <p className="text-[11px] text-inksoft">Prescribed by <span className="font-semibold text-ink">{rx.prescriber}</span></p>
                    {rx.note && (
                      <p className="mt-1.5 text-[11px] leading-snug text-honey-700 bg-honey-100/70 border border-honey-300/50 rounded-md px-2 py-1">
                        ⚑ {rx.note}
                      </p>
                    )}
                  </div>

                  {/* pipeline */}
                  <div className="mt-3.5 flex items-center">
                    {FLOW.map((s, idx) => (
                      <div key={s} className={cx("flex items-center", idx < FLOW.length - 1 && "flex-1")}>
                        <span title={LABEL[s]} className={cx("grid place-items-center w-5 h-5 rounded-full border-2 text-[9px] font-bold transition-all duration-300",
                          idx < stepIdx ? "bg-pine-600 border-pine-600 text-pine-50"
                            : idx === stepIdx ? (rx.status === "dispensed" ? "bg-pine-800 border-pine-800 text-pine-50" : "bg-card border-pine-600 text-pine-700 anim-pulse-dot")
                            : "bg-card border-mist text-inksoft/50")}>
                          {idx < stepIdx || rx.status === "dispensed" ? <ICheck size={10} /> : idx + 1}
                        </span>
                        {idx < FLOW.length - 1 && (
                          <span className={cx("flex-1 h-0.5 mx-1 rounded transition-colors duration-500", idx < stepIdx ? "bg-pine-500" : "bg-mist")} />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3.5 pt-3 border-t border-dashed border-mist flex gap-2">
                    {next && (
                      <button onClick={() => dispatch({ type: "RX_STATUS", id: rx.id, status: next.to })}
                        className="flex-1 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-[0.97] flex items-center justify-center gap-1.5">
                        <IClock size={13} /> {next.label}
                      </button>
                    )}
                    {canAttach && (
                      <button onClick={() => dispatch({ type: "RX_TO_CART", id: rx.id })}
                        className="flex-1 py-2 rounded-lg border border-pine-200 bg-pine-50 text-pine-800 text-xs font-bold hover:bg-pine-100 transition active:scale-[0.97] flex items-center justify-center gap-1.5">
                        <IRegister size={13} /> Attach to sale
                      </button>
                    )}
                    {rx.status === "dispensed" && (
                      <span className="flex-1 py-2 rounded-lg bg-pine-100 text-pine-800 text-xs font-bold text-center flex items-center justify-center gap-1.5">
                        <ICheck size={13} /> Completed & logged
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
