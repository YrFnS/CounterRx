import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { usePos, money, relTime } from "../store";
import type { Delivery, DeliveryStatus, WebOrder } from "../data";
import { cx, Badge, Empty, Modal } from "../ui";
import { ITruck, IMapPin, IWeb, IX, ICheck, IChevD, ICash, IAlert } from "../icons";

const STAGES: { id: DeliveryStatus; label: string; bar: string }[] = [
  { id: "queued", label: i18n.t("deliveries.queued"), bar: "#5c6b66" },
  { id: "assigned", label: i18n.t("deliveries.assigned"), bar: "#e0a63c" },
  { id: "out", label: i18n.t("deliveries.outForDelivery"), bar: "#3b8668" },
  { id: "delivered", label: i18n.t("deliveries.delivered"), bar: "#0f4437" },
];

const WEB_TONE: Record<WebOrder["status"], string> = {
  new: "bg-pine-100 text-pine-700",
  accepted: "bg-honey-100 text-honey-700",
  converted: "bg-mist/70 text-ink",
  declined: "bg-brick-100 text-brick-700",
};

export default function Deliveries() {
  const { t } = useTranslation();
  const { state, dispatch } = usePos();
  const [podFor, setPodFor] = useState<Delivery | null>(null);
  const [podText, setPodText] = useState("");
  /* Drivers = active staff roster; falls back to the signed-in user. */
  const drivers = useMemo(
    () => state.staff.filter((s) => s.active).map((s) => s.name),
    [state.staff]);

  const custName = (id: string) => state.customers.find((c) => c.id === id)?.name ?? i18n.t("deliveries.walkIn");
  const lineLabel = (l: { productId: string; qty: number }) =>
    `${l.qty}× ${state.products.find((p) => p.id === l.productId)?.name ?? l.productId}`;

  const activeWeb = state.webOrders.filter((w) => w.status === "new");
  const openDeliveries = state.deliveries.filter((d) => d.status !== "delivered").length;
  const feesOut = state.deliveries.filter((d) => d.status !== "delivered").reduce((s, d) => s + d.fee, 0);

  const advance = (d: Delivery) => {
    if (d.status === "queued") {
      dispatch({ type: "DELIVERY_STATUS", id: d.id, to: "assigned", driver: d.driver ?? drivers[0] ?? state.user?.name });
    } else if (d.status === "assigned") {
      dispatch({ type: "DELIVERY_STATUS", id: d.id, to: "out" });
    } else if (d.status === "out") {
      setPodFor(d); setPodText("");
    }
  };

  return (
    <div className="h-full flex flex-col px-3 sm:px-6 py-4 sm:py-5 min-h-0">
      {/* summary strip */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pine-800 text-pine-50 text-xs font-bold num">
          <ITruck size={14} /> {openDeliveries} open run{openDeliveries === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-honey-100 border border-honey-300/60 text-honey-800 text-xs font-bold num">
          <ICash size={14} /> {money(feesOut)} delivery fees in flight
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pine-100 border border-pine-300/60 text-pine-800 text-xs font-bold num">
          <IWeb size={14} /> {activeWeb.length} web order{activeWeb.length === 1 ? "" : "s"} awaiting triage
        </span>
        <span className="ml-auto text-[11px] text-inksoft hidden md:block">
          Drivers on shift: <span className="font-semibold text-ink">{drivers.slice(0, 4).join(" · ") || "—"}</span>
        </span>
      </div>

      {/* e-commerce intake */}
      <div className="mt-4 rounded-xl border border-mist bg-card shadow-lift overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-mist bg-pine-50/60">
          <h2 className="font-display font-bold text-ink text-[14px] flex items-center gap-2">
            <IWeb size={15} className="text-pine-700" /> Online intake — refill requests & e-commerce
          </h2>
          <Badge tone="mist">{state.webOrders.length} total</Badge>
        </div>
        {activeWeb.length === 0 ? (
          <p className="px-4 py-3 text-xs text-inksoft">Inbox clear — no new online requests.</p>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
            {activeWeb.map((w) => (
              <div key={w.id} className="rounded-lg border border-mist bg-paper p-3 flex flex-col anim-fade-up">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-ink">{w.customerName}</p>
                  <span className={cx("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", WEB_TONE[w.status])}>{w.type.replace("_", " ")}</span>
                </div>
                <p className="num text-[10px] text-inksoft mt-0.5">{w.id} · {w.channel} · {relTime(w.createdAt)} · {w.pickup.replace("_", " ")}</p>
                <p className="text-[11px] text-ink mt-1.5">{w.items.map((i) => lineLabel({ productId: i.productId ?? "", qty: i.qty })).join(", ")}</p>
                {w.note && <p className="text-[10px] text-honey-700 mt-1 italic">“{w.note}”</p>}
                <div className="mt-2.5 flex gap-1.5">
                  <button onClick={() => dispatch({ type: "WEB_CONVERT", id: w.id })}
                    className="flex-1 py-1.5 rounded-md bg-pine-700 text-pine-50 text-[11px] font-bold hover:bg-pine-600 transition active:scale-[0.97] flex items-center justify-center gap-1">
                    <ITruck size={11} /> Fulfill
                  </button>
                  <button onClick={() => dispatch({ type: "WEB_ORDER", id: w.id, to: "declined", reason: "Out of scope" })}
                    className="px-2.5 py-1.5 rounded-md border border-mist text-inksoft text-[11px] font-bold hover:border-brick-400 hover:text-brick-700 transition active:scale-[0.97]">
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* route board */}
      <h2 className="font-display font-bold text-ink text-[15px] mt-5 flex items-center gap-2">
        <ITruck size={16} className="text-pine-700" /> Delivery route board
      </h2>
      <div className="mt-2.5 flex-1 min-h-0 flex gap-3.5 overflow-x-auto scroll-slim pb-4">
        {STAGES.map((s) => {
          const items = state.deliveries.filter((d) => d.status === s.id).sort((a, b) => a.scheduledAt - b.scheduledAt);
          return (
            <div key={s.id} className="min-w-[240px] flex-1 flex flex-col rounded-xl border border-mist bg-card/60 overflow-hidden">
              <div className="px-3 py-2 border-b border-mist flex items-center justify-between" style={{ boxShadow: `inset 0 3px 0 ${s.bar}` }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-inksoft">{s.label}</p>
                <span className="num text-[11px] font-bold text-ink bg-mist/70 rounded-full px-2 py-0.5">{items.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto scroll-slim p-2.5 space-y-2.5">
                {items.length === 0 && (
                  <div className="text-center text-inksoft/50 text-[11px] py-6">—</div>
                )}
                {items.map((d) => (
                  <div key={d.id} className="rounded-lg border border-mist bg-card p-2.5 shadow-lift hover:-translate-y-0.5 transition-transform">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-ink truncate">{custName(d.customerId)}</p>
                      <Badge tone={d.mode === "curbside" ? "honey" : "pine"}>{d.mode}</Badge>
                    </div>
                    <p className="flex items-start gap-1 text-[10px] text-inksoft mt-1">
                      <IMapPin size={11} className="mt-px shrink-0 text-pine-600" />
                      <span className="truncate">{d.address}</span>
                    </p>
                    <p className="text-[10px] text-ink mt-1 truncate">{d.lines.map(lineLabel).join(", ")}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="num text-[10px] text-inksoft">
                        {new Date(d.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {d.fee > 0 && <span className="text-honey-700 font-bold"> · fee {money(d.fee)}</span>}
                      </span>
                      {d.driver && <span className="text-[10px] font-bold text-pine-700">⌁ {d.driver}</span>}
                    </div>
                    {d.proof && <p className="text-[10px] text-pine-700 mt-1 flex items-center gap-1"><ICheck size={10} /> POD: {d.proof}</p>}
                    {d.status !== "delivered" && (
                      <div className="mt-2 flex gap-1.5 items-center">
                        {d.status === "queued" && (
                          <select value={d.driver ?? drivers[0] ?? ""}
                            onChange={(e) => dispatch({ type: "DELIVERY_STATUS", id: d.id, to: "assigned", driver: e.target.value })}
                            className="flex-1 px-1.5 py-1.5 rounded-md border border-mist bg-paper text-[11px] font-semibold text-ink focus:outline-none focus:border-pine-500">
                            {(d.driver && !drivers.includes(d.driver) ? [d.driver, ...drivers] : drivers).map((dr) => <option key={dr} value={dr}>{dr}</option>)}
                          </select>
                        )}
                        <button onClick={() => advance(d)}
                          className="flex-1 py-1.5 rounded-md bg-pine-700 text-pine-50 text-[11px] font-bold hover:bg-pine-600 transition active:scale-[0.97]">
                          {d.status === "queued" ? i18n.t("deliveries.assign") : d.status === "assigned" ? i18n.t("deliveries.dispatch") : "Confirm POD"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {podFor && (
        <Modal onClose={() => setPodFor(null)} width={420} labelledBy="pod-title">
          <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
            <div>
              <h2 id="pod-title" className="font-display font-bold text-ink flex items-center gap-2">
                <ICheck size={17} className="text-pine-700" /> Proof of delivery — {podFor.id}
              </h2>
              <p className="text-xs text-inksoft mt-0.5">{custName(podFor.customerId)} · {podFor.address}</p>
            </div>
            <button onClick={() => setPodFor(null)} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
          </div>
          <div className="p-5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">Delivery note / signature ref</label>
            <textarea autoFocus value={podText} onChange={(e) => setPodText(e.target.value)} rows={3}
              placeholder="e.g. Handed to patient — signed J.N."
              className="mt-1 w-full px-3 py-2 rounded-lg border border-mist bg-card text-sm focus:border-pine-500 focus:outline-none transition resize-none" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setPodFor(null)} className="flex-1 py-2 rounded-lg border border-mist text-xs font-semibold text-inksoft hover:text-ink transition">Cancel</button>
              <button onClick={() => { dispatch({ type: "DELIVERY_STATUS", id: podFor.id, to: "delivered", proof: podText.trim() || i18n.t("deliveries.delivered") }); setPodFor(null); }}
                className="flex-1 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-[0.98] shadow-lift">
                Mark delivered
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
