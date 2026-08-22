import { useEffect, useRef, useState } from "react";
import type { ReactNode, ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "./i18n";
import { PosProvider, usePos } from "./store";
import { signInStaffByEmail } from "./lib/sync";
import type { View } from "./store";
import { daysUntil, nearestExpiry, stockOf, ROLE_LABEL, VIEW_ROLES } from "./data";
import type { Product, Transaction, Prescription } from "./data";
import { cx } from "./ui";
import { PaymentModal, ReceiptModal, DataExchangeModal } from "./modals";
import { ToastHost } from "./ui";
import Register from "./views/Register";
import Dashboard from "./views/Dashboard";
import Inventory from "./views/Inventory";
import Prescriptions from "./views/Prescriptions";
import History from "./views/History";
import {
  ICross, IRegister, IDash, IBox, IRx, IHistory, IBell, IAlert, IChevD, IScan, IDownload, IUpload, IUsers, IWifi, IWifiOff, ICode, IMenu, IX, IGear, ILedger, ITrendUp, ITruck,
} from "./icons";
import Customers from "./views/Customers";
import Settings from "./views/Settings";
import Deliveries from "./views/Deliveries";
import Reports from "./views/Reports";
import Finance from "./views/Finance";

const TITLES: Record<View, { title: string; sub: string }> = {
  register: { title: "nav.pos", sub: "Scan, sell, dispense — one lane" },
  dashboard: { title: "nav.dashboard", sub: "Live figures from the POS ledger" },
  customers: { title: "nav.customers", sub: "Loyalty balances, visit history, preferences" },
  inventory: { title: "nav.inventory", sub: "Stock on hand, expiry windows, reorder points" },
  finance: { title: "nav.finance", sub: "Purchase orders, accounts payable, expenses, P&L" },
  reports: { title: "nav.reports", sub: "Margin, FIFO valuation, P&L, custom report builder" },
  prescriptions: { title: "nav.prescriptions", sub: "Pharmacist workflow · drop-off to dispense" },
  deliveries: { title: "nav.deliveries", sub: "Route board, web intake, proof of delivery" },
  history: { title: "nav.history", sub: "Every receipt this terminal has printed" },
  settings: { title: "nav.settings", sub: "Organization profile, team, loyalty, backups" },
};

const NAV: { id: View; label: string; icon: ReactNode; key: string }[] = [
  { id: "register", label: "nav.pos", icon: <IRegister size={17} />, key: "F1" },
  { id: "dashboard", label: "nav.dashboard", icon: <IDash size={17} />, key: "F3" },
  { id: "customers", label: "nav.customers", icon: <IUsers size={17} />, key: "F7" },
  { id: "inventory", label: "nav.inventory", icon: <IBox size={17} />, key: "F4" },
  { id: "finance", label: "nav.finance", icon: <ILedger size={17} />, key: "F8" },
  { id: "reports", label: "nav.reports", icon: <ITrendUp size={17} />, key: "F10" },
  { id: "prescriptions", label: "nav.prescriptions", icon: <IRx size={17} />, key: "F5" },
  { id: "deliveries", label: "nav.deliveries", icon: <ITruck size={17} />, key: "" },
  { id: "history", label: "nav.history", icon: <IHistory size={17} />, key: "F6" },
  { id: "settings", label: "nav.settings", icon: <IGear size={17} />, key: "F9" },
];

/* role-based route guards live in data.ts (VIEW_ROLES) — shared with in-page nav buttons */

export default function App() {
  return (
    <PosProvider>
      <Shell />
    </PosProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Lock screen — multi-user PIN sign-in (6.1)                         */
/* ------------------------------------------------------------------ */
function LockScreen() {
  const { state, dispatch } = usePos();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(false);
    // Verify typed credentials first (Supabase, or offline seed table), then log in.
    const r = await signInStaffByEmail(email, password);
    if (!r.staffId) {
      setError(true);
      setBusy(false);
      return;
    }
    dispatch({ type: "LOGIN", staffId: r.staffId });
    dispatch({ type: "BACKEND_AUTH", staffId: r.staffId, authenticated: r.authenticated });
    setBusy(false);
  };

  return (
    <div className="h-full grid place-items-center px-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[820px] h-[420px] rounded-full bg-pine-200/25 blur-[110px] pointer-events-none" />
      <div className="w-full max-w-[380px] relative">
        <div className="text-center mb-5">
          <span className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-pine-800 text-pine-50 shadow-pop mx-auto">
            <ICross size={28} />
          </span>
          <h1 className="font-display font-bold text-[26px] text-ink mt-3 tracking-tight">CounterRx</h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-inksoft mt-0.5">{state.settings.terminalId}</p>
        </div>

        <form onSubmit={submit} className="bg-card border border-mist rounded-2xl shadow-pop p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft mb-3">{t('auth.loginTitle')}</p>
          <label className="block mb-3">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-1">{t('auth.email')}</span>
            <input type="email" required autoComplete="username" value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); setError(false); }}
              className="w-full rounded-xl border border-mist bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink focus:border-pine-500 focus:outline-none transition" />
          </label>
          <label className="block mb-4">
            <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft mb-1">{t('auth.password')}</span>
            <input type="password" required autoComplete="current-password" value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => { setPassword(e.target.value); setError(false); }}
              className="w-full rounded-xl border border-mist bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink focus:border-pine-500 focus:outline-none transition" />
          </label>
          {error && <p className="text-[11px] font-semibold text-brick-700 mb-3">{t('auth.invalidCredentials')}</p>}
          <button type="submit" disabled={busy || !email || !password}
            className="w-full py-2.5 rounded-xl bg-pine-700 text-pine-50 font-display font-bold text-[13px] hover:bg-pine-600 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition-all">
            {busy ? t('auth.login') : t('auth.signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}

function Shell() {
  const { state, dispatch, lowStock, expiring, newRx } = usePos();
  const { t, i18n } = useTranslation();
  const [apiOpen, setApiOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const go = (view: View) => { dispatch({ type: "GO", view }); setNavOpen(false); };

  /* role-based route guards (F7): hide restricted nav, deny restricted views */
  const role = state.user?.role;
  const viewAllowed = !role || (VIEW_ROLES[state.view]?.includes(role) ?? false);
  const navItems = role ? NAV.filter((n) => VIEW_ROLES[n.id]?.includes(role)) : NAV;

  /* reflect the active language in <html dir> (F5: RTL activation) */
  useEffect(() => {
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
  }, [i18n.language]);

  /* close the mobile nav drawer with Escape */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setNavOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* global keyboard shortcuts */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const map: Record<string, View> = { F1: "register", F3: "dashboard", F4: "inventory", F5: "prescriptions", F6: "history", F7: "customers", F8: "finance", F9: "settings", F10: "reports" };
      if (map[e.key]) { e.preventDefault(); dispatch({ type: "GO", view: map[e.key] }); setNavOpen(false); return; }
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

  /* ---------- backup / restore ---------- */
  const fileRef = useRef<HTMLInputElement>(null);
  const backup = () => {
    const payload = {
      app: "counterrx", version: 3, at: new Date().toISOString(),
      products: state.products, transactions: state.transactions, prescriptions: state.prescriptions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `counterrx-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    dispatch({ type: "TOAST", kind: "success", msg: "Backup downloaded — ledger, stock & scripts saved" });
  };
  const onRestoreFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(String(reader.result)) as { products?: unknown; transactions?: unknown; prescriptions?: unknown };
        if (!Array.isArray(d.products) || !Array.isArray(d.transactions) || !Array.isArray(d.prescriptions)) throw new Error("invalid backup");
        dispatch({
          type: "RESTORE",
          products: d.products as Product[],
          transactions: d.transactions as Transaction[],
          prescriptions: d.prescriptions as Prescription[],
        });
      } catch {
        dispatch({ type: "TOAST", kind: "error", msg: "Restore failed — not a valid CounterRx backup" });
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  };

  /* idle auto-lock (§0 sessions) — any activity resets the timer */
  const idleMins = state.settings.idleLockMins;
  useEffect(() => {
    if (!state.user || idleMins <= 0) return;
    let t = window.setTimeout(() => dispatch({ type: "LOGOUT", auto: true }), idleMins * 60_000);
    const reset = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => dispatch({ type: "LOGOUT", auto: true }), idleMins * 60_000);
    };
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [state.user, idleMins, dispatch]);

  /* multi-user session — the till locks until someone signs in (after all hooks) */
  if (!state.user) return <LockScreen />;

  return (
    <div className="flex h-full overflow-hidden">
      {/* mobile nav overlay */}
      {navOpen && (
        <button aria-label="Close navigation" onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-pine-950/55 backdrop-blur-[2px] lg:hidden anim-fade-up" />
      )}

      {/* ---------- sidebar (off-canvas below lg) ---------- */}
      <aside className={cx(
        "fixed lg:static inset-y-0 start-0 z-50 w-[218px] shrink-0 bg-pine-950 text-pine-100 flex flex-col overflow-hidden transition-transform duration-300 ease-out",
        navOpen ? "translate-x-0 shadow-pop" : "-translate-x-full lg:translate-x-0 drawer-closed")}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.05]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'%3E%3Cpath d='M11 7h4v4h4v4h-4v4h-4v-4H7v-4h4z' fill='%238fbfa9'/%3E%3C/svg%3E\")" }} />
        <div className="relative px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-pine-700 text-pine-100 shadow-lift">
              <ICross size={18} />
            </span>
            <div className="flex-1">
              <p className="font-display font-bold text-[17px] text-paper leading-none tracking-tight">CounterRx</p>
              <p className="text-[10px] text-pine-300 font-semibold tracking-[0.18em] uppercase mt-1">Pharmacy POS</p>
            </div>
            <button onClick={() => setNavOpen(false)} aria-label="Close menu"
              className="lg:hidden grid place-items-center w-8 h-8 rounded-lg text-pine-300 hover:text-paper hover:bg-pine-900 transition active:scale-90">
              <IX size={15} />
            </button>
          </div>
        </div>

        <nav className="relative flex-1 px-3 space-y-1 mt-1">
          {navItems.map((n) => {
            const active = state.view === n.id;
            const badge = n.id === "inventory" ? lowStock.length + expiring.length
              : n.id === "prescriptions" ? newRx
              : n.id === "deliveries" ? state.webOrders.filter((w) => w.status === "new").length : 0;
            return (
              <button key={n.id} onClick={() => go(n.id)}
                className={cx("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-200 group",
                  active ? "bg-pine-700 text-paper shadow-lift translate-x-0.5" : "text-pine-200 hover:bg-pine-900 hover:text-paper hover:translate-x-0.5")}>
                <span className={cx("transition-transform duration-200", !active && "group-hover:scale-110")}>{n.icon}</span>
                <span className="flex-1 text-start">{t(n.label)}</span>
                {badge > 0 && (
                  <span className={cx("num text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                    n.id === "inventory" ? "bg-honey-500 text-pine-950" : "bg-brick-500 text-brick-100")}>
                    {badge}
                  </span>
                )}
                {n.key && <span className={cx("num text-[9px]", active ? "text-pine-300" : "text-pine-200/40")}>{n.key}</span>}
              </button>
            );
          })}
        </nav>

        <div className="relative px-4 pb-4 space-y-3">
          <div className="bg-pine-900/80 border border-pine-800 rounded-lg px-3 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-pine-300">{t('common.onShift')}</p>
              <span className={cx("px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide",
                state.user.role === "pharmacist" ? "bg-honey-500 text-pine-950"
                  : state.user.role === "manager" ? "bg-brick-500 text-brick-100"
                  : "bg-pine-700 text-pine-100")}>
                {state.user.role}
              </span>
            </div>
            <p className="text-[13px] font-semibold text-paper mt-0.5">{state.user.name}</p>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-[10px] text-pine-300 num">{t('common.terminalDrawerSynced', { terminal: '01' })}</p>
              <button onClick={() => dispatch({ type: "LOGOUT" })}
                className="text-[10px] font-bold text-pine-300 hover:text-paper underline underline-offset-2 transition">
                {t('common.switch')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={backup}
              className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-pine-800 text-pine-300 text-[11px] font-semibold hover:border-pine-600 hover:text-paper transition active:scale-95"
              title={t('common.downloadBackup')}>
              <IDownload size={12} /> {t('common.backup')}
            </button>
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-pine-800 text-pine-300 text-[11px] font-semibold hover:border-pine-600 hover:text-paper transition active:scale-95"
              title={t('common.restoreFromBackup')}>
              <IUpload size={12} /> {t('common.restore')}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onRestoreFile} />
          <button onClick={() => setApiOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-pine-800 text-pine-300 text-[11px] font-semibold hover:border-pine-600 hover:text-paper transition active:scale-95"
            title={t('common.apiSurfaceDesc')}>
            <ICode size={12} /> {t('common.apiSurface')}
          </button>
          {state.backendOffline && (
            <div className="flex items-center justify-center gap-1.5 px-2 py-1 rounded-md bg-honey-100 border border-honey-300 text-honey-700 text-[9px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-honey-600 anim-pulse-dot" />
              {t('common.backendReconnecting')}
            </div>
          )}
        </div>
      </aside>

      {/* ---------- main ---------- */}
      <div className="flex-1 min-w-0 ambient flex flex-col">
        <TopBar onMenu={() => setNavOpen(true)} />
        {state.backendOffline && (
          <div className="flex items-center justify-center gap-3 px-3 py-1.5 bg-honey-100 border-b border-honey-300 text-honey-700 text-[11px] font-semibold shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-honey-600 anim-pulse-dot" />
            {t('common.dbUnreachable')}
            <button onClick={() => window.location.reload()}
              className="px-2 py-0.5 rounded-md border border-honey-400 hover:border-honey-600 hover:bg-honey-200/60 transition text-[10px] font-bold uppercase tracking-wide">
              {t('common.retryConnection')}
            </button>
          </div>
        )}
        <main className="flex-1 min-h-0 min-w-0">
          {viewAllowed ? (
            <>
              {state.view === "register" && <Register />}
              {state.view === "dashboard" && <Dashboard />}
              {state.view === "customers" && <Customers />}
              {state.view === "inventory" && <Inventory />}
              {state.view === "finance" && <Finance />}
              {state.view === "reports" && <Reports />}
              {state.view === "prescriptions" && <Prescriptions />}
              {state.view === "deliveries" && <Deliveries />}
              {state.view === "history" && <History />}
              {state.view === "settings" && <Settings />}
            </>
          ) : (
            <div className="flex items-center justify-center h-full px-6">
              <div className="text-center">
                <p className="text-base font-bold text-ink">Access denied</p>
                <p className="text-xs text-inksoft mt-1">Your role does not have permission to view this section.</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {state.payOpen && <PaymentModal />}
      {state.receipt && <ReceiptModal tx={state.receipt} onClose={() => dispatch({ type: "OPEN_RECEIPT", tx: null })} />}
      {apiOpen && <DataExchangeModal onClose={() => setApiOpen(false)} />}
      <ToastHost />
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { state, dispatch, lowStock, expiring, newRx } = usePos();
  const { t: tr } = useTranslation();
  const [bellOpen, setBellOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const t = TITLES[state.view];
  const alertCount = lowStock.length + expiring.length + newRx;

  return (
    <header className="h-14 shrink-0 border-b border-mist bg-card/70 backdrop-blur-sm flex items-center gap-2 sm:gap-3 px-3 sm:px-5">
      <button onClick={onMenu} aria-label={tr('common.openNavigation')}
        className="lg:hidden grid place-items-center w-9 h-9 rounded-lg border border-mist bg-card text-ink hover:border-pine-400 hover:bg-pine-50 transition active:scale-90 shrink-0">
        <IMenu size={16} />
      </button>
      <div className="min-w-0 flex-1 sm:flex-none">
        <h1 className="font-display font-bold text-[14px] sm:text-[15px] text-ink leading-none truncate">{tr(t.title)}</h1>
        <p className="text-[11px] text-inksoft mt-0.5 truncate hidden sm:block">{t.sub}</p>
      </div>

      <div className="flex-1" />

      {/* connection status (6.5) */}
      <span title={state.online ? tr('common.liveSyncActive') : tr('common.offlineLocalData')}
        className={cx("flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-semibold transition-colors",
          state.online
            ? "bg-pine-100/70 border-pine-200 text-pine-800"
            : "bg-honey-100 border-honey-300 text-honey-700")}>
        <span className={cx("w-1.5 h-1.5 rounded-full", state.online ? "bg-pine-600 anim-pulse-dot" : "bg-honey-600")} />
        {state.online ? <IWifi size={13} /> : <IWifiOff size={13} />}
        <span className="hidden sm:inline">{state.online ? tr('common.online') + " · " + tr('common.synced') : tr('common.offline') + " · " + tr('common.local')}</span>
      </span>

      <span className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-pine-100/70 border border-pine-200 text-pine-800 text-[11px] font-semibold">
        <IScan size={12} /> {tr('common.barcodeScannerArmed')}
      </span>

      {/* alerts bell */}
      <div className="relative">
        <button onClick={() => setBellOpen((o) => !o)}
          className={cx("relative grid place-items-center w-9 h-9 rounded-lg border transition active:scale-90",
            bellOpen ? "bg-ink text-paper border-ink" : "bg-card border-mist text-ink hover:border-pine-400")}
          aria-label={tr('common.alerts')}>
          <IBell size={16} />
          {alertCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 num text-[9px] font-bold bg-brick-500 text-brick-100 rounded-full min-w-[16px] h-4 px-1 grid place-items-center anim-pop">
              {alertCount}
            </span>
          )}
        </button>
        {bellOpen && (
          <>
            <button className="fixed inset-0 z-40 cursor-default" onClick={() => setBellOpen(false)} aria-label={tr('common.closeAlerts')} />
            <div className="anim-fade-up absolute right-0 top-11 z-50 w-72 bg-card border border-mist rounded-xl shadow-pop p-2">
              <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">{tr('common.storeAlerts', { count: alertCount })}</p>
              <div className="max-h-72 overflow-y-auto scroll-slim space-y-1">
                {expiring.slice(0, 3).map((p) => (
                  <AlertRow key={p.id} tone="brick" icon={<IAlert size={13} />}
                    text={`${p.name} — ${Math.max(0, daysUntil(nearestExpiry(p)!))}d to expiry`}
                    onClick={() => { dispatch({ type: "GO", view: "inventory", invPreset: "expiring" }); setBellOpen(false); }} />
                ))}
                {lowStock.slice(0, 3).map((p) => (
                  <AlertRow key={`l-${p.id}`} tone="honey" icon={<IBox size={13} />}
                    text={`${p.name} — ${stockOf(p)} left, reorder at ${p.reorderLevel}`}
                    onClick={() => { dispatch({ type: "GO", view: "inventory", invPreset: "low" }); setBellOpen(false); }} />
                ))}
                {newRx > 0 && (
                  <AlertRow tone="pine" icon={<IRx size={13} />}
                    text={`${newRx} prescription${newRx === 1 ? "" : "s"} awaiting review`}
                    onClick={() => { dispatch({ type: "GO", view: "prescriptions" }); setBellOpen(false); }} />
                )}
                {alertCount === 0 && <p className="px-2.5 py-3 text-xs text-inksoft">{tr('common.allClear')}</p>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* live clock */}
      <div className="hidden md:flex flex-col items-end ps-3 border-l border-mist">
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
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-paper text-start transition group">
      <span className={cx("grid place-items-center w-7 h-7 rounded-md shrink-0", tones[tone])}>{icon}</span>
      <span className="text-xs text-ink leading-snug flex-1">{text}</span>
      <IChevD size={12} className="-rotate-90 text-inksoft opacity-0 group-hover:opacity-100 transition" />
    </button>
  );
}
