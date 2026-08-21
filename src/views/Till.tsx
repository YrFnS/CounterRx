import { useState } from "react";
import { usePos, money } from "../store";
import { can } from "../data";
import type { StoreCredit } from "../data";
import { useTranslation } from "react-i18next";
import { Modal, Badge } from "../ui";
import { ICash, IPlus, IMinus, ICard, IX, IChevD } from "../icons";

/** Till control bar: shows shift status and exposes cash-in/out + store-credit issue (Phase A). */
export default function ShiftBar() {
  const { state, dispatch } = usePos();
  const { t } = useTranslation();
  const shift = state.currentShift;
  const [cashOpen, setCashOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-mist bg-card">
        <span className={cxDot(!!shift)} />
        <span className="text-xs font-semibold text-ink">
          {shift ? `${t("reports.tillOpen")} · ${shift.id}` : t("reports.noOpenShift")}
        </span>
        {shift && <span className="num text-[11px] text-inksoft">| {money(shift.expectedCash)}</span>}
      </div>

      <button disabled={!shift} onClick={() => setCashOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-pine-400 disabled:opacity-40 transition">
        <ICash size={14} /> {t("till.cashInOut")}
      </button>

      <button disabled={!shift || !can(state.user?.role, "refund")} onClick={() => setCreditOpen(true)}
        title={can(state.user?.role, "refund") ? undefined : t("till.needManager")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-mist bg-card text-xs font-semibold text-ink hover:border-pine-400 disabled:opacity-40 transition">
        <ICard size={14} /> {t("till.issueCredit")}
      </button>

      <button onClick={() => dispatch({ type: "GO", view: "reports" })}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pine-700 text-pine-50 text-xs font-bold hover:bg-pine-600 transition active:scale-95">
        {t("till.viewReports")}
      </button>

      {cashOpen && <CashMovementDialog onClose={() => setCashOpen(false)} />}
      {creditOpen && <IssueCreditDialog onClose={() => setCreditOpen(false)} />}
    </div>
  );
}

function cxDot(active: boolean) {
  return active
    ? "inline-block w-2 h-2 rounded-full bg-pine-600 shadow-[0_0_0_3px_rgba(15,68,55,0.15)]"
    : "inline-block w-2 h-2 rounded-full bg-brick-500";
}

function CashMovementDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePos();
  const { t } = useTranslation();
  const [kind, setKind] = useState<"paid_in" | "paid_out">("paid_in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const amt = parseFloat(amount) || 0;
  const valid = amt > 0 && reason.trim().length >= 2 && !!state.currentShift;
  const needsApproval = amt > 100 && !can(state.user?.role, "refund");

  const submit = () => {
    if (!valid) return;
    dispatch({ type: "SHIFT_CASH_MOVEMENT", movementType: kind, amount: amt, reason: reason.trim() });
    onClose();
  };

  return (
    <Modal onClose={onClose} width={420} labelledBy="cash-title">
      <div className="flex items-center justify-between px-5 py-4 border-b border-mist">
        <h2 id="cash-title" className="font-display font-bold text-ink flex items-center gap-2"><ICash size={16} className="text-pine-700" /> {t("till.cashInOut")}</h2>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setKind("paid_in")} className={kindBtn(kind === "paid_in")}><IPlus size={15} /> {t("till.cashIn")}</button>
          <button onClick={() => setKind("paid_out")} className={kindBtn(kind === "paid_out")}><IMinus size={15} /> {t("till.cashOut")}</button>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("till.amount")}</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal" placeholder="0.00"
            className="num w-full mt-1 px-3 py-2 rounded-lg border-2 border-mist bg-card text-base font-semibold text-ink focus:border-pine-500 focus:outline-none transition" />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("till.reason")}</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg border-2 border-mist bg-card text-sm text-ink focus:border-pine-500 focus:outline-none transition" />
        </div>
        {needsApproval && (
          <p className="text-xs text-honey-700 font-semibold bg-honey-100 border border-honey-300 rounded-md px-3 py-2">
            {t("till.managerApproval")}
          </p>
        )}
        <button onClick={submit} disabled={!valid}
          className={cxBtn(valid)}>{t("till.record")}</button>
      </div>
    </Modal>
  );
}

function IssueCreditDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePos();
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");

  const amt = parseFloat(amount) || 0;
  const valid = amt > 0;

  const submit = () => {
    if (!valid) return;
    const credit: StoreCredit = {
      id: `SC-${Date.now().toString(36).toUpperCase()}`,
      customerId: state.saleCustomerId,
      balance: amt,
      issuedAt: Date.now(),
      code: code.trim() || undefined,
      note: note.trim() || undefined,
    };
    dispatch({ type: "ISSUE_STORE_CREDIT", credit });
    onClose();
  };

  return (
    <Modal onClose={onClose} width={440} labelledBy="credit-title">
      <div className="flex items-center justify-between px-5 py-4 border-b border-mist">
        <h2 id="credit-title" className="font-display font-bold text-ink flex items-center gap-2"><ICard size={16} className="text-pine-700" /> {t("till.issueCredit")}</h2>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-mist/60 text-inksoft" aria-label="Close"><IX size={14} /></button>
      </div>
      <div className="p-5 space-y-3">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("till.creditAmount")}</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal" placeholder="0.00"
            className="num w-full mt-1 px-3 py-2 rounded-lg border-2 border-mist bg-card text-base font-semibold text-ink focus:border-pine-500 focus:outline-none transition" />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("till.creditCode")} <span className="text-inksoft/70 normal-case">{t("till.optional")}</span></label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("till.giftCardCode")}
            className="w-full mt-1 px-3 py-2 rounded-lg border-2 border-mist bg-card text-sm text-ink focus:border-pine-500 focus:outline-none transition" />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{t("till.note")} <span className="text-inksoft/70 normal-case">{t("till.optional")}</span></label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg border-2 border-mist bg-card text-sm text-ink focus:border-pine-500 focus:outline-none transition" />
        </div>
        <button onClick={submit} disabled={!valid}
          className={cxBtn(valid)}>{t("till.issue")}</button>
      </div>
    </Modal>
  );
}

function kindBtn(on: boolean) {
  return `flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 text-sm font-semibold transition ${
    on ? "border-pine-600 bg-pine-700 text-pine-50" : "border-mist bg-card text-ink hover:border-pine-300"
  }`;
}

function cxBtn(valid: boolean) {
  return `w-full mt-2 py-2.5 rounded-lg font-display font-bold text-sm transition active:scale-[0.98] ${
    valid ? "bg-pine-700 text-pine-50 hover:bg-pine-600 shadow-lift" : "bg-mist text-inksoft cursor-not-allowed"
  }`;
}
