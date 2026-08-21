import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { usePos, listSnapshots, money } from "../store";
import i18n from "../i18n";
import { CURRENCIES, ROLE_LABEL, can, randomPin } from "../data";
import type { OrgSettings, Role, Staff, Snapshot } from "../data";
import { cx, Modal, Badge } from "../ui";
import {
  IGear, IPrint, IStar, IUsers, IDownload, IUpload, IPlus, IX, ICheck, ICopy, ITrash, IRecall, IAlert, IScan, IChevD, IClockIn,
} from "../icons";
import { connectPrinter, printLabel, kickDrawer, HardwareError } from "../lib/hardware";

type Tab = "profile" | "receipt" | "loyalty" | "team" | "clock" | "hardware" | "data" | "language";

export default function Settings() {
  const { t } = useTranslation();
  const { state } = usePos();
  const [tab, setTab] = useState<Tab>("profile");
  const admin = can(state.user?.role, "edit_settings");
  const teamAdmin = can(state.user?.role, "manage_staff");

  const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "profile", label: t("settings.storeProfile"), icon: <IGear size={14} /> },
    { id: "receipt", label: t("settings.receipt"), icon: <IPrint size={14} /> },
    { id: "loyalty", label: t("settings.loyalty"), icon: <IStar size={14} /> },
    { id: "team", label: t("settings.team"), icon: <IUsers size={14} /> },
    { id: "clock", label: t("settings.timeClock"), icon: <IClockIn size={14} /> },
    { id: "hardware", label: t("settings.hardware"), icon: <IPrint size={14} /> },
    { id: "data", label: t("settings.dataBackups"), icon: <IDownload size={14} /> },
    { id: "language", label: t("settings.language"), icon: <IX size={14} /> },
  ];

  return (
    <div className="h-full overflow-y-auto scroll-slim px-3 sm:px-6 py-4 sm:py-5">
      {!admin && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-honey-300/60 bg-honey-100/50 px-4 py-3 text-xs font-semibold text-honey-700 anim-fade-up">
          <IAlert size={14} className="shrink-0" />
          Read-only — settings changes require the <span className="font-bold">Admin</span> role. Ask {state.staff.find((s) => s.role === "pharmacy_admin")?.name ?? "an admin"} or switch profile (F-keys → Switch).
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map((t) => {
          if (t.id === "team" && !teamAdmin) return null;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cx("flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-bold transition-all duration-200",
                active ? "bg-ink text-paper border-ink shadow-lift" : "bg-card border-mist text-inksoft hover:border-pine-300 hover:text-ink")}>
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 anim-fade-up" key={tab}>
        {tab === "profile" && <ProfileTab admin={admin} />}
        {tab === "receipt" && <ReceiptTab admin={admin} />}
        {tab === "loyalty" && <LoyaltyTab admin={admin} />}
        {tab === "team" && teamAdmin && <TeamTab />}
        {tab === "clock" && <TimeTab />}
        {tab === "hardware" && <HardwareTab admin={admin} />}
        {tab === "data" && <DataTab />}
        {tab === "language" && <LanguageTab />}
      </div>
    </div>
  );
}

/* language picker (F4): switches i18n locale; the detector caches to localStorage */
function LanguageTab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-mist bg-card px-3 py-2.5">
        <span className="text-xs font-bold text-ink">{t("common.interfaceLanguage")}</span>
        <div className="flex gap-1.5">
          {(["en", "ar"] as const).map((lng) => (
            <button key={lng} onClick={() => void i18n.changeLanguage(lng)}
              className={cx("px-3 py-1.5 rounded-lg text-xs font-bold transition",
                i18n.language === lng || i18n.language.startsWith(lng)
                  ? "bg-pine-600 text-paper shadow"
                  : "bg-paper border border-mist text-inksoft hover:border-pine-300")}>
              {lng === "en" ? "English" : "العربية"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-inksoft px-1">
        {t("common.rtlNote")}
      </p>
    </div>
  );
}

/* ---------------------------------- profile ---------------------------------- */
function ProfileTab({ admin }: { admin: boolean }) {
  const { state, dispatch } = usePos();
  const s = state.settings;
  const set = (patch: Partial<OrgSettings>) => admin && dispatch({ type: "UPDATE_SETTINGS", patch });

  return (
    <div className="grid lg:grid-cols-2 gap-4 max-w-[980px]">
      <Card title="Organization" hint="Printed on receipts, labels and exports">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Pharmacy name"><Input disabled={!admin} value={s.orgName} onChange={(v) => set({ orgName: v })} /></Field>
          <Field label="Branch"><Input disabled={!admin} value={s.branch} onChange={(v) => set({ branch: v })} /></Field>
          <Field label="Address" wide><Input disabled={!admin} value={s.address} onChange={(v) => set({ address: v })} /></Field>
          <Field label="Phone"><Input disabled={!admin} value={s.phone} onChange={(v) => set({ phone: v })} /></Field>
          <Field label="License / GSTIN"><Input disabled={!admin} value={s.license} onChange={(v) => set({ license: v })} /></Field>
        </div>
      </Card>

      <Card title="Terminal & sessions" hint="Scope every sale to this register">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Terminal ID"><Input disabled={!admin} value={s.terminalId} onChange={(v) => set({ terminalId: v })} mono /></Field>
          <Field label="Currency">
            <select disabled={!admin} value={s.currency} onChange={(e) => set({ currency: e.target.value })} className={inputCls}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Idle auto-lock">
            <select disabled={!admin} value={String(s.idleLockMins)} onChange={(e) => set({ idleLockMins: Number(e.target.value) })} className={inputCls}>
              {[0, 5, 10, 15, 30].map((m) => <option key={m} value={m}>{m === 0 ? "Never" : `After ${m} min`}</option>)}
            </select>
          </Field>
          <Field label="Auto snapshot">
            <select disabled={!admin} value={String(s.autoSnapshotMins)} onChange={(e) => set({ autoSnapshotMins: Number(e.target.value) })} className={inputCls}>
              {[0, 15, 30, 60].map((m) => <option key={m} value={m}>{m === 0 ? "Off" : `Every ${m} min`}</option>)}
            </select>
          </Field>
        </div>
        <ToggleRow disabled={!admin} on={s.scanBeep} onChange={(v) => set({ scanBeep: v })}
          icon={<IScan size={14} />} label="Scanner beep" hint="Audible chirp on a successful barcode scan" />
      </Card>
    </div>
  );
}

/* ---------------------------------- receipt ---------------------------------- */
function ReceiptTab({ admin }: { admin: boolean }) {
  const { state, dispatch } = usePos();
  const s = state.settings;
  const set = (patch: Partial<OrgSettings>) => admin && dispatch({ type: "UPDATE_SETTINGS", patch });

  return (
    <div className="grid lg:grid-cols-2 gap-4 max-w-[980px] items-start">
      <Card title="Receipt template" hint="Header comes from the store profile">
        <div className="space-y-3">
          <Field label="Footer message"><Input disabled={!admin} value={s.receiptFooter} onChange={(v) => set({ receiptFooter: v })} /></Field>
          <Field label="Terms line"><Input disabled={!admin} value={s.receiptTerms} onChange={(v) => set({ receiptTerms: v })} /></Field>
          <ToggleRow disabled={!admin} on={s.showBarcode} onChange={(v) => set({ showBarcode: v })}
            icon={<IPrint size={14} />} label="Print barcode strip" hint="Scannable receipt number at the bottom" />
        </div>
      </Card>

      {/* live preview */}
      <div className="bg-card border border-mist rounded-xl shadow-lift p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-inksoft mb-3">Live preview</p>
        <div className="mx-auto max-w-[280px] bg-white border border-mist rounded-lg p-4 num text-[11px] text-ink leading-relaxed">
          <div className="text-center">
            <p className="font-bold text-[13px] tracking-wide">{s.orgName.toUpperCase()}</p>
            <p className="text-inksoft">{s.branch}</p>
            <p className="text-inksoft">{s.address} · {s.phone}</p>
            <p className="text-inksoft">{s.license}</p>
          </div>
          <div className="receipt-dash my-2.5" />
          <div className="flex justify-between"><span>Receipt</span><span className="font-semibold">T-2K9X4A</span></div>
          <div className="flex justify-between"><span>Cashier</span><span>{state.user?.name ?? "—"}</span></div>
          <div className="receipt-dash my-2.5" />
          <div className="flex justify-between"><span>1 × Paracetamol 500mg</span><span>{money(1.8)}</span></div>
          <div className="flex justify-between"><span>Tax 8%</span><span>{money(0.14)}</span></div>
          <div className="flex justify-between font-bold"><span>TOTAL</span><span>{money(1.94)}</span></div>
          <div className="receipt-dash my-2.5" />
          <p className="text-center text-inksoft">{s.receiptTerms}</p>
          {s.showBarcode && <><div className="mt-2.5 h-6 barcode-stripes opacity-90" />
            <p className="text-center text-[9px] mt-1 tracking-[0.3em] text-inksoft">8 9 0 2 K 9 X 4 A</p></>}
          <p className="text-center text-inksoft mt-2">{s.receiptFooter}</p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- hardware -------------------------------- */
function HardwareTab({ admin }: { admin: boolean }) {
  const { state, dispatch } = usePos();
  const { t } = useTranslation();
  const s = state.settings;
  const set = (patch: Partial<OrgSettings>) => admin && dispatch({ type: "UPDATE_SETTINGS", patch });
  const [busy, setBusy] = useState(false);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      dispatch({ type: "TOAST", kind: "success", msg: t("settings.hwOk", { op: label }) });
    } catch (e) {
      const err = e as HardwareError;
      const msg = err instanceof HardwareError && err.code === "disabled"
        ? t("settings.hwDisabled")
        : err.message;
      dispatch({ type: "TOAST", kind: "error", msg });
    } finally {
      setBusy(false);
    }
  };

  const HwBtn = ({ label, onClick, hint }: { label: string; onClick: () => Promise<void>; hint?: string }) => (
    <button onClick={() => run(label, onClick)} disabled={busy || !s.hardwareEnabled}
      className={cx("flex-1 py-2.5 rounded-lg border text-sm font-bold transition-all",
        s.hardwareEnabled ? "border-pine-300 bg-pine-50 text-pine-800 hover:bg-pine-100" : "border-mist text-inksoft/50 cursor-not-allowed")}>
      {label}
      {hint && <span className="block text-[10px] font-normal mt-0.5">{hint}</span>}
    </button>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4 max-w-[980px] items-start">
      <Card title={t("settings.hardware")} hint={t("settings.hardwareHint")}>
        <div className="space-y-3">
          <ToggleRow disabled={!admin} on={s.hardwareEnabled} onChange={(v) => set({ hardwareEnabled: v })}
            icon={<IPrint size={14} />} label={t("settings.enableHardware")} hint={t("settings.enableHardwareHint")} />
          <div className="flex gap-2 pt-1 flex-wrap">
            <HwBtn label={t("settings.connectPrinter")} hint={t("settings.connectHint")}
              onClick={() => connectPrinter(s.hardwareEnabled)} />
            <HwBtn label={t("settings.testPrint")} hint={t("settings.testPrintHint")}
              onClick={() => printLabel({ title: "CounterRx", barcode: "T-01", subtitle: s.orgName }, s.hardwareEnabled)} />
            <HwBtn label={t("settings.kickDrawer")}
              onClick={() => kickDrawer(s.hardwareEnabled)} />
          </div>
        </div>
      </Card>
      <Card title={t("settings.hardwareAbout")} hint={t("settings.hardwareAboutHint")}>
        <ul className="text-[12px] text-inksoft space-y-1.5 list-disc ps-4">
          <li>{t("settings.hwReq1")}</li>
          <li>{t("settings.hwReq2")}</li>
          <li>{t("settings.hwReq3")}</li>
        </ul>
      </Card>
    </div>
  );
}

/* ---------------------------------- loyalty ---------------------------------- */
function LoyaltyTab({ admin }: { admin: boolean }) {
  const { state, dispatch } = usePos();
  const l = state.settings.loyalty;
  const set = (patch: Partial<OrgSettings["loyalty"]>) => admin && dispatch({ type: "UPDATE_SETTINGS", patch: { loyalty: patch } });

  return (
    <div className="grid lg:grid-cols-2 gap-4 max-w-[980px]">
      <Card title="Earning" hint="Points credited when a customer is attached at the till">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={`Points per ${money(1)} spent`}>
            <NumInput disabled={!admin} value={l.ptsPerUnit} min={0} onChange={(v) => set({ ptsPerUnit: v })} />
          </Field>
        </div>
        <p className="mt-3 text-[11px] text-inksoft bg-mist/40 rounded-lg px-3 py-2">
          A {money(42.5)} sale earns <span className="num font-bold text-ink">{Math.floor(42.5 * l.ptsPerUnit)} pts</span> for the attached customer.
        </p>
      </Card>

      <Card title="Redemption & tiers" hint="Chunks of points trade for currency at checkout">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Chunk size (pts)"><NumInput disabled={!admin} value={l.chunkPts} min={1} onChange={(v) => set({ chunkPts: v })} /></Field>
          <Field label="Chunk value"><NumInput disabled={!admin} value={l.chunkValue} min={0.5} step={0.5} onChange={(v) => set({ chunkValue: v })} /></Field>
          <div className="flex items-end pb-2 text-[11px] font-semibold text-inksoft">
            {l.chunkPts} pts = {money(l.chunkValue)}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Field label="Silver tier at (pts)"><NumInput disabled={!admin} value={l.silverAt} min={1} onChange={(v) => set({ silverAt: v })} /></Field>
          <Field label="Gold tier at (pts)"><NumInput disabled={!admin} value={l.goldAt} min={1} onChange={(v) => set({ goldAt: v })} /></Field>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------- team ---------------------------------- */
function TeamTab() {
  const { state, dispatch } = usePos();
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState<Staff | null>(null);

  return (
    <div className="max-w-[980px]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-inksoft">{state.staff.filter((s) => s.active).length} active · {state.staff.length} total — PINs are stored as SHA-256 hashes only</p>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95 shadow-lift">
          <IPlus size={14} /> Add staff
        </button>
      </div>

      <div className="rounded-xl border border-mist bg-card shadow-lift overflow-auto scroll-slim">
        <table className="w-full text-sm border-collapse min-w-[720px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-pine-900 text-pine-100 text-start text-[10px] uppercase tracking-[0.14em]">
              <th className="px-4 py-2.5 font-bold">Staff</th>
              <th className="px-3 py-2.5 font-bold">Role</th>
              <th className="px-3 py-2.5 font-bold">Status</th>
              <th className="px-3 py-2.5 font-bold">Since</th>
              <th className="px-4 py-2.5 font-bold text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {state.staff.map((s) => {
              const self = s.id === state.user?.id;
              return (
                <tr key={s.id} className={cx("border-t border-mist/70 transition-colors hover:bg-pine-50/60", !s.active && "opacity-55")}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid place-items-center w-8 h-8 rounded-lg bg-pine-800 text-pine-100 font-display font-bold text-[11px] shrink-0">{s.initials}</span>
                      <div>
                        <p className="font-bold text-ink">{s.name}{self && <span className="ms-1.5 text-[9px] font-bold uppercase text-pine-700 bg-pine-100 px-1.5 py-0.5 rounded">you</span>}</p>
                        <p className="text-[10px] text-inksoft num">{s.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <select value={s.role} disabled={self}
                      onChange={(e) => dispatch({ type: "UPDATE_STAFF", id: s.id, patch: { role: e.target.value as Role } })}
                      className="px-2 py-1 rounded-md border border-mist bg-card text-xs font-semibold focus:border-pine-500 focus:outline-none disabled:opacity-60">
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={s.active ? "pine" : "mist"}>{s.active ? "active" : "deactivated"}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-inksoft num">{new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setResetFor(s)}
                        className="px-2 py-1 rounded-md border border-mist text-[11px] font-bold text-inksoft hover:border-honey-400 hover:text-honey-700 transition">
                        Reset PIN
                      </button>
                      <button disabled={self}
                        onClick={() => dispatch({ type: "UPDATE_STAFF", id: s.id, patch: { active: !s.active } })}
                        className="px-2 py-1 rounded-md border border-mist text-[11px] font-bold text-inksoft hover:border-brick-400 hover:text-brick-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                        {s.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adding && <AddStaffModal onClose={() => setAdding(false)} />}
      {resetFor && <PinModal staff={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
}

function AddStaffModal({ onClose }: { onClose: () => void }) {
  const { dispatch } = usePos();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [pin] = useState(randomPin);
  const [done, setDone] = useState(false);
  const ok = name.trim().length >= 2;

  return (
    <Modal onClose={onClose} width={420} labelledBy="stf-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <div>
          <h2 id="stf-title" className="font-display font-bold text-ink flex items-center gap-2"><IUsers size={17} className="text-pine-700" /> Add staff member</h2>
          <p className="text-xs text-inksoft mt-0.5">A 4-digit PIN is generated — share it once, in person</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3">
        {!done ? (
          <>
            <Field label="Full name *"><Input value={name} onChange={setName} placeholder="e.g. K. Asante" autoFocus /></Field>
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputCls}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </Field>
            <button disabled={!ok} onClick={() => { dispatch({ type: "ADD_STAFF", name, role, pin }); setDone(true); }}
              className={cx("w-full py-2.5 rounded-lg font-display font-bold text-sm transition-all flex items-center justify-center gap-2",
                ok ? "bg-pine-700 text-pine-50 hover:bg-pine-600 active:scale-[0.98] shadow-lift" : "bg-mist text-inksoft cursor-not-allowed")}>
              <ICheck size={15} /> Create account
            </button>
          </>
        ) : (
          <div className="text-center anim-pop">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-inksoft">Temporary PIN for {name.trim()}</p>
            <p className="num text-[40px] font-bold text-pine-800 tracking-[0.3em] my-2">{pin}</p>
            <p className="text-[11px] text-inksoft">It is stored as a hash only and won't be shown again.</p>
            <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-lg bg-ink text-paper font-display font-bold text-sm hover:bg-pine-900 transition">
              Done — I've shared it
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PinModal({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const { dispatch } = usePos();
  const [pin] = useState(randomPin);
  const [saved, setSaved] = useState(false);
  return (
    <Modal onClose={onClose} width={400} labelledBy="pin-title">
      <div className="px-5 py-4 border-b border-mist flex items-start justify-between">
        <h2 id="pin-title" className="font-display font-bold text-ink">Reset PIN — {staff.name}</h2>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 text-center">
        {!saved ? (
          <>
            <p className="text-xs text-inksoft">Generate a fresh PIN and hand it to {staff.name.split(",")[0]} privately. Their lockout (if any) clears.</p>
            <button onClick={() => { dispatch({ type: "SET_STAFF_PIN", id: staff.id, pin }); setSaved(true); }}
              className="mt-4 w-full py-2.5 rounded-lg bg-pine-700 text-pine-50 font-display font-bold text-sm hover:bg-pine-600 transition active:scale-[0.98] shadow-lift">
              Generate new PIN
            </button>
          </>
        ) : (
          <div className="anim-pop">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-inksoft">New PIN</p>
            <p className="num text-[40px] font-bold text-pine-800 tracking-[0.3em] my-2">{pin}</p>
            <button onClick={onClose} className="mt-3 w-full py-2.5 rounded-lg bg-ink text-paper font-display font-bold text-sm hover:bg-pine-900 transition">
              Done — I've shared it
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------------------------- data & backups ---------------------------------- */
function DataTab() {
  const { state, dispatch } = usePos();
  const [snaps, setSnaps] = useState<Snapshot[]>(() => listSnapshots());
  const canRestore = can(state.user?.role, "restore_snapshot");
  const refresh = () => setSnaps(listSnapshots());

  const backup = () => {
    const payload = {
      app: "counterrx", version: 6, at: new Date().toISOString(),
      products: state.products, transactions: state.transactions, prescriptions: state.prescriptions,
      customers: state.customers, transfers: state.transfers, audit: state.audit,
      staff: state.staff, settings: state.settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `counterrx-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    dispatch({ type: "TOAST", kind: "success", msg: "Full backup downloaded" });
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4 max-w-[980px] items-start">
      <Card title="Snapshots" hint={`Automated every ${state.settings.autoSnapshotMins > 0 ? `${state.settings.autoSnapshotMins} min` : "— (off)"} · newest first · up to 8 kept`}>
        <button onClick={() => { dispatch({ type: "SNAPSHOT_SAVE", label: `Manual · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, auto: false }); setTimeout(refresh, 60); }}
          className="mb-3 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95 shadow-lift">
          <IPlus size={13} /> Save snapshot now
        </button>
        <div className="space-y-2 max-h-[340px] overflow-y-auto scroll-slim">
          {snaps.length === 0 && <p className="text-xs text-inksoft py-4 text-center">No snapshots yet — save one now or wait for the auto schedule.</p>}
          {snaps.map((s) => (
            <div key={s.meta.id} className="flex items-center gap-2.5 rounded-lg border border-mist bg-paper px-3 py-2.5">
              <span className={cx("grid place-items-center w-7 h-7 rounded-md shrink-0", s.meta.auto ? "bg-mist/60 text-inksoft" : "bg-pine-100 text-pine-700")}>
                {s.meta.auto ? <IGear size={13} /> : <ICheck size={13} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-ink truncate">{s.meta.label}</p>
                <p className="text-[10px] text-inksoft num">
                  {new Date(s.meta.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {" · "}{(JSON.stringify(s.data).length / 1024).toFixed(0)} KB
                </p>
              </div>
              <button disabled={!canRestore} title={canRestore ? "Restore this snapshot" : "Requires Admin role"}
                onClick={() => { dispatch({ type: "SNAPSHOT_RESTORE", id: s.meta.id }); refresh(); }}
                className="p-1.5 rounded-md border border-mist text-inksoft hover:border-pine-400 hover:text-pine-700 transition disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Restore">
                <IRecall size={13} />
              </button>
              <button onClick={() => { dispatch({ type: "SNAPSHOT_DELETE", id: s.meta.id }); setTimeout(refresh, 60); }}
                className="p-1.5 rounded-md border border-mist text-inksoft hover:border-brick-400 hover:text-brick-700 transition" aria-label="Delete">
                <ITrash size={13} />
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Portable backup" hint="One JSON file with the complete ledger — store it off-device">
        <div className="space-y-2.5">
          <button onClick={backup}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-ink text-paper text-xs font-bold hover:bg-pine-900 transition active:scale-[0.98]">
            <IDownload size={14} /> Download full backup (.json)
          </button>
          <p className="text-[11px] text-inksoft leading-relaxed">
            Restoring a full backup is available from the sidebar <span className="font-semibold">Restore</span> control.
            Snapshots above are quicker, in-browser checkpoints.
          </p>
          <div className="rounded-lg bg-mist/40 border border-mist px-3 py-2.5 text-[11px] text-inksoft">
            <p className="font-bold text-ink flex items-center gap-1.5"><IChevD size={11} className="rotate-180" /> Roadmap (P0 → P1)</p>
            <p className="mt-1">This store keeps the offline-first ledger locally. Next: Supabase adapter — same schema, server-side RLS, hashed PINs verified via Postgres RPC.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------- shared bits ---------------------------------- */
const inputCls = "w-full px-3 py-2.5 rounded-lg border border-mist bg-card text-sm text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-200 transition disabled:opacity-60 disabled:bg-mist/30";

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="bg-card border border-mist rounded-xl shadow-lift p-5">
      <h3 className="font-display font-bold text-ink text-[15px]">{title}</h3>
      {hint && <p className="text-[11px] text-inksoft mt-0.5 mb-3.5">{hint}</p>}
      {children}
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-inksoft">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Input({ value, onChange, disabled, placeholder, autoFocus, mono }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string; autoFocus?: boolean; mono?: boolean;
}) {
  return (
    <input value={value} disabled={disabled} placeholder={placeholder} autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className={cx(inputCls, mono && "num")} />
  );
}

function NumInput({ value, onChange, disabled, min = 0, step = 1 }: {
  value: number; onChange: (v: number) => void; disabled?: boolean; min?: number; step?: number;
}) {
  return (
    <input type="number" value={value} min={min} step={step} disabled={disabled}
      onChange={(e) => onChange(Math.max(min, parseFloat(e.target.value) || 0))}
      className={cx(inputCls, "num")} />
  );
}

function ToggleRow({ on, onChange, label, hint, icon, disabled }: {
  on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; icon?: ReactNode; disabled?: boolean;
}) {
  return (
    <button onClick={() => !disabled && onChange(!on)}
      className={cx("mt-3 w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition-all",
        on ? "border-pine-300 bg-pine-50" : "border-mist bg-paper", disabled && "opacity-60 cursor-not-allowed")}>
      {icon && <span className={cx("shrink-0", on ? "text-pine-700" : "text-inksoft")}>{icon}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-bold text-ink">{label}</span>
        {hint && <span className="block text-[10px] text-inksoft truncate">{hint}</span>}
      </span>
      <span className={cx("relative w-9 h-5 rounded-full transition-colors shrink-0", on ? "bg-pine-600" : "bg-mist")}>
        <span className={cx("absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200", on ? "start-[18px]" : "start-0.5")} />
      </span>
    </button>
  );
}

/* time-clock: punch in/out + weekly hours per staff */
function TimeTab() {
  const { state, dispatch } = usePos();
  const now = Date.now();
  const me = state.user;
  const openEntry = state.timeEntries.find((t) => t.staffId === me?.id && !t.outAt);
  const weekStart = now - 7 * 86_400_000;
  const hrs = (ms: number) => (ms / 3_600_000).toFixed(1);

  const weekByStaff = state.staff.map((s) => {
    const entries = state.timeEntries.filter((t) => t.staffId === s.id && t.inAt >= weekStart);
    const total = entries.reduce((sum, t) => sum + ((t.outAt ?? now) - t.inAt), 0);
    return { s, total, shifts: entries.length };
  }).sort((a, b) => b.total - a.total);

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="rounded-xl border border-mist bg-card p-5 shadow-lift">
        <h3 className="font-display font-bold text-ink text-[15px] flex items-center gap-2">
          <IClockIn size={16} className="text-pine-700" /> My shift
        </h3>
        <div className="mt-4 flex items-center gap-3">
          <span className="grid place-items-center w-12 h-12 rounded-full bg-pine-900 text-pine-100 font-display font-bold text-base">{me?.initials}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink truncate">{me?.name}</p>
            <p className="text-[11px] text-inksoft">{ROLE_LABEL[me?.role ?? "cashier"]}</p>
          </div>
          <span className={cx("ml-auto px-2.5 py-1 rounded-full text-[11px] font-bold", openEntry ? "bg-pine-100 text-pine-700" : "bg-mist/70 text-inksoft")}>
            {openEntry ? `On shift · ${hrs(now - openEntry.inAt)}h` : "Off shift"}
          </span>
        </div>
        <button onClick={() => dispatch({ type: "CLOCK" })}
          className={cx("mt-4 w-full py-2.5 rounded-lg font-display font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98]",
            openEntry ? "bg-brick-600 text-paper hover:bg-brick-700 shadow-lift" : "bg-pine-700 text-pine-50 hover:bg-pine-600 shadow-lift")}>
          <IClockIn size={15} /> {openEntry ? "Clock out" : "Clock in"}
        </button>
      </div>

      <div className="rounded-xl border border-mist bg-card p-5 shadow-lift">
        <h3 className="font-display font-bold text-ink text-[15px]">Hours this week</h3>
        <div className="mt-3 space-y-2.5">
          {weekByStaff.map(({ s, total, shifts }) => (
            <div key={s.id} className="flex items-center gap-3">
              <span className="grid place-items-center w-8 h-8 rounded-full bg-pine-800 text-pine-100 font-display font-bold text-[11px] shrink-0">{s.initials}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="font-semibold text-ink truncate">{s.name}</span>
                  <span className="num text-pine-800 font-bold shrink-0 ms-2">{hrs(total)}h · {shifts} shift{shifts === 1 ? "" : "s"}</span>
                </div>
                <div className="h-1.5 rounded-full bg-mist/60 overflow-hidden">
                  <div className="anim-grow-w h-full rounded-full bg-pine-600" style={{ width: `${Math.min(100, (total / (40 * 3_600_000)) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
