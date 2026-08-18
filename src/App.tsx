import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { PosProvider, usePos } from "./store";
import type { View } from "./store";
import { CASHIER, STORE } from "./data";
import { cx } from "./ui";
import { PaymentModal, ReceiptModal } from "./modals";
import { ToastHost } from "./ui";
import Register from "./views/Register";
import Dashboard from "./views/Dashboard";
import Inventory from "./views/Inventory";
import Prescriptions from "./views/Prescriptions";
import History from "./views/History";
import {
  ICross, IRegister, IDash, IBox, IRx, IHistory, IBell, IAlert, IChevD, IRecall, IScan,
} from "./icons";

const TITLES: Record<View, { title: string; sub: string }> = {
  register: { title: "Register · Terminal 01", sub: "Scan, sell, dispense — one lane" },
  dashboard: { title: "Store pulse", sub: "Live figures from the POS ledger" },
  inventory: { title: "Inventory & batches", sub: "Stock on hand, expiry windows, reorder points" },
  prescriptions: { title: "Prescription queue", sub: "Pharmacist workflow · drop-off to dispense" },
  history: { title: "Sales ledger", sub: "Every receipt this terminal has printed" },
};

const NAV: { id: View; label: string; icon: ReactNode; key: string }[] = [
  { id: "register", label: "Register", icon: <IRegister size={17} />, key: "F1" },
  { id: "dashboard", label: "Dashboard", icon: <IDash size={17} />, key: "F3" },
  { id: "inventory", label: "Inventory", icon: <IBox size={17} />, key: "F4" },
  { id: "prescriptions", label: "Prescriptions", icon: <IRx size={17} />, key: "F5" },
  { id: "history", label: "Sales ledger", icon: <IHistory size={17} />, key: "F6" },
];

export default function App() {
  return (
    <PosProvider>
      <Shell />
    </PosProvider>
  );
}

function Shell() {
  const { state, dispatch, lowStock, expiring, newRx } = usePos();

  /* global keyboard shortcuts */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const map: Record<string, View> = { F1: "register", F3: "dashboard", F4: "inventory", F5: "prescriptions", F6: "history" };
      if (map[e.key]) { e.preventDefault(); dispatch({ type: "GO", view: map[e.key] }); return; }
      if (e.key === "F2") {
        e.preventDefault();
        if (state.view !== "register") dispatch({ type: "GO", view: "register" });
        setTimeout(() => document.getElementById("pos-search")?.focus(), 30);
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        if (state.cart.length > 0 && !state.payOpen && !state.receipt) dispatch({ type: "OPEN_PAY", open: true });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [dispatch, state.view, state.cart.length, state.payOpen, state.receipt]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ---------- sidebar ---------- */}
      <aside className="w-[218px] shrink-0 bg-pine-950 text-pine-100 flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.05]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'%3E%3Cpath d='M11 7h4v4h4v4h-4v4h-4v-4H7v-4h4z' fill='%238fbfa9'/%3E%3C/svg%3E\")" }} />
        <div className="relative px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-pine-700 text-pine-100 shadow-lift">
              <ICross size={18} />
            </span>
            <div>
              <p className="font-display font-bold text-[17px] text-paper leading-none tracking-tight">CounterRx</p>
              <p className="text-[10px] text-pine-300 font-semibold tracking-[0.18em] uppercase mt-1">Pharmacy POS</p>
            </div>
          </div>
        </div>

        <nav className="relative flex-1 px-3 space-y-1 mt-1">
          {NAV.map((n) => {
            const active = state.view === n.id;
            const badge = n.id === "inventory" ? lowStock.length + expiring.length
              : n.id === "prescriptions" ? newRx : 0;
            return (
              <button key={n.id} onClick={() => dispatch({ type: "GO", view: n.id })}
                className={cx("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-200 group",
                  active ? "bg-pine-700 text-paper shadow-lift translate-x-0.5" : "text-pine-200 hover:bg-pine-900 hover:text-paper hover:translate-x-0.5")}>
                <span className={cx("transition-transform duration-200", !active && "group-hover:scale-110")}>{n.icon}</span>
                <span className="flex-1 text-left">{n.label}</span>
                {badge > 0 && (
                  <span className={cx("num text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                    n.id === "inventory" ? "bg-honey-500 text-pine-950" : "bg-brick-500 text-brick-100")}>
                    {badge}
                  </span>
                )}
                <span className={cx("num text-[9px]", active ? "text-pine-300" : "text-pine-200/40")}>{n.key}</span>
              </button>
            );
          })}
        </nav>

        <div className="relative px-4 pb-4 space-y-3">
          <div className="bg-pine-900/80 border border-pine-800 rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-pine-300">On shift</p>
            <p className="text-[13px] font-semibold text-paper mt-0.5">{CASHIER}</p>
            <p className="text-[10px] text-pine-300 num">Terminal 01 · drawer synced</p>
          </div>
          <button onClick={() => dispatch({ type: "RESET" })}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-pine-800 text-pine-300 text-[11px] font-semibold hover:border-pine-600 hover:text-paper transition">
            <IRecall size={12} /> Reset demo data
          </button>
          <p className="text-center text-[9px] text-pine-200/40 num">v2.4.1 · local ledger · {STORE.branch.split("—")[0]}</p>
        </div>
      </aside>

      {/* ---------- main ---------- */}
      <div className="flex-1 min-w-0 ambient flex flex-col">
        <TopBar />
        <main className="flex-1 min-h-0">
          {state.view === "register" && <Register />}
          {state.view === "dashboard" && <Dashboard />}
          {state.view === "inventory" && <Inventory />}
          {state.view === "prescriptions" && <Prescriptions />}
          {state.view === "history" && <History />}
        </main>
      </div>

      {state.payOpen && <PaymentModal />}
      {state.receipt && <ReceiptModal tx={state.receipt} onClose={() => dispatch({ type: "OPEN_RECEIPT", tx: null })} />}
      <ToastHost />
    </div>
  );
}

function TopBar() {
  const { state, dispatch, lowStock, expiring, newRx } = usePos();
  const [bellOpen, setBellOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const t = TITLES[state.view];
  const alertCount = lowStock.length + expiring.length + newRx;

  return (
    <header className="h-14 shrink-0 border-b border-mist bg-card/70 backdrop-blur-sm flex items-center gap-3 px-5">
      <div className="min-w-0">
        <h1 className="font-display font-bold text-[15px] text-ink leading-none truncate">{t.title}</h1>
        <p className="text-[11px] text-inksoft mt-0.5 truncate">{t.sub}</p>
      </div>

      <div className="flex-1" />

      <span className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-pine-100/70 border border-pine-200 text-pine-800 text-[11px] font-semibold">
        <IScan size={12} /> Barcode scanner armed · F2 to scan
      </span>

      {/* alerts bell */}
      <div className="relative">
        <button onClick={() => setBellOpen((o) => !o)}
          className={cx("relative grid place-items-center w-9 h-9 rounded-lg border transition active:scale-90",
            bellOpen ? "bg-ink text-paper border-ink" : "bg-card border-mist text-ink hover:border-pine-400")}
          aria-label="Alerts">
          <IBell size={16} />
          {alertCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 num text-[9px] font-bold bg-brick-500 text-brick-100 rounded-full min-w-[16px] h-4 px-1 grid place-items-center anim-pop">
              {alertCount}
            </span>
          )}
        </button>
        {bellOpen && (
          <>
            <button className="fixed inset-0 z-40 cursor-default" onClick={() => setBellOpen(false)} aria-label="Close alerts" />
            <div className="anim-fade-up absolute right-0 top-11 z-50 w-72 bg-card border border-mist rounded-xl shadow-pop p-2">
              <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">Store alerts · {alertCount}</p>
              <div className="max-h-72 overflow-y-auto scroll-slim space-y-1">
                {expiring.slice(0, 3).map((p) => (
                  <AlertRow key={p.id} tone="brick" icon={<IAlert size={13} />}
                    text={`${p.name} — ${Math.max(0, Math.ceil((new Date(p.expiry + "T00:00:00").getTime() - Date.now()) / 86400000))}d to expiry`}
                    onClick={() => { dispatch({ type: "GO", view: "inventory", invPreset: "expiring" }); setBellOpen(false); }} />
                ))}
                {lowStock.slice(0, 3).map((p) => (
                  <AlertRow key={`l-${p.id}`} tone="honey" icon={<IBox size={13} />}
                    text={`${p.name} — ${p.stock} left, reorder at ${p.reorderLevel}`}
                    onClick={() => { dispatch({ type: "GO", view: "inventory", invPreset: "low" }); setBellOpen(false); }} />
                ))}
                {newRx > 0 && (
                  <AlertRow tone="pine" icon={<IRx size={13} />}
                    text={`${newRx} prescription${newRx === 1 ? "" : "s"} awaiting review`}
                    onClick={() => { dispatch({ type: "GO", view: "prescriptions" }); setBellOpen(false); }} />
                )}
                {alertCount === 0 && <p className="px-2.5 py-3 text-xs text-inksoft">All clear — shelves healthy. ✓</p>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* live clock */}
      <div className="hidden md:flex flex-col items-end pl-3 border-l border-mist">
        <span className="num text-[15px] font-bold text-ink leading-none">
          {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
        <span className="text-[10px] text-inksoft mt-0.5 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-pine-500 anim-pulse-dot" />
          {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · open since 08:30
        </span>
      </div>

    </header>
  );
}

function AlertRow({ tone, icon, text, onClick }: {
  tone: "brick" | "honey" | "pine"; icon: ReactNode; text: string; onClick: () => void;
}) {
  const tones = {
    brick: "text-brick-700 bg-brick-100/60",
    honey: "text-honey-700 bg-honey-100/70",
    pine: "text-pine-700 bg-pine-100/70",
  };
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-paper text-left transition group">
      <span className={cx("grid place-items-center w-7 h-7 rounded-md shrink-0", tones[tone])}>{icon}</span>
      <span className="text-xs text-ink leading-snug flex-1">{text}</span>
      <IChevD size={12} className="-rotate-90 text-inksoft opacity-0 group-hover:opacity-100 transition" />
    </button>
  );
}
