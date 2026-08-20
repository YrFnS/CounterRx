import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePos } from "./store";
import type { Toast } from "./store";
import { IX, ICheck, IAlert, IInfo, IPlus } from "./icons";
import type { Field } from "./data";

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

export function Modal({ onClose, children, width = 560, labelledBy }: {
  onClose: () => void; children: ReactNode; width?: number; labelledBy?: string;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <button aria-label="Close" onClick={onClose}
        className="absolute inset-0 bg-pine-950/55 backdrop-blur-[2px] cursor-default" />
      <div className="anim-pop relative bg-card rounded-xl shadow-pop border border-mist max-h-[92vh] flex flex-col w-full"
        style={{ maxWidth: width }}>
        {children}
      </div>
    </div>
  );
}

export function Badge({ tone, children }: { tone: "pine" | "honey" | "brick" | "mist" | "ink"; children: ReactNode }) {
  const tones: Record<string, string> = {
    pine: "bg-pine-100 text-pine-800 border-pine-200",
    honey: "bg-honey-100 text-honey-700 border-honey-300/60",
    brick: "bg-brick-100 text-brick-700 border-brick-300/60",
    mist: "bg-mist/50 text-inksoft border-mist",
    ink: "bg-ink text-paper border-ink",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-semibold leading-none", tones[tone])}>
      {children}
    </span>
  );
}

export function StockBar({ stock, reorder }: { stock: number; reorder: number }) {
  const pct = Math.min(100, Math.round((stock / Math.max(1, reorder * 2)) * 100));
  const tone = stock <= reorder ? (stock <= Math.ceil(reorder / 3) ? "#c24a2e" : "#e0a63c") : "#3b8668";
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="h-1.5 flex-1 rounded-full bg-mist/70 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(4, pct)}%`, background: tone }} />
      </div>
      <span className="num text-xs text-inksoft w-8 text-right">{stock}</span>
    </div>
  );
}

function ToastItem({ t }: { t: Toast }) {
  const { dispatch } = usePos();
  useEffect(() => {
    const id = setTimeout(() => dispatch({ type: "DISMISS_TOAST", id: t.id }), 3400);
    return () => clearTimeout(id);
  }, [t.id, dispatch]);
  const icon =
    t.kind === "success" ? <ICheck size={14} /> :
    t.kind === "info" ? <IInfo size={14} /> :
    t.kind === "warn" ? <IAlert size={14} /> : <IAlert size={14} />;
  const tone =
    t.kind === "success" ? "bg-pine-800 text-pine-50 border-pine-600" :
    t.kind === "info" ? "bg-ink text-paper border-ink" :
    t.kind === "warn" ? "bg-honey-500 text-pine-950 border-honey-700/40" :
    "bg-brick-500 text-brick-100 border-brick-700/40";
  const iconTone =
    t.kind === "success" ? "bg-pine-600 text-pine-50" :
    t.kind === "info" ? "bg-inksoft text-paper" :
    t.kind === "warn" ? "bg-pine-950/15 text-pine-950" : "bg-brick-100/20 text-brick-100";
  return (
    <div className={cx("anim-toast pointer-events-auto flex items-center gap-2.5 pl-2.5 pr-1.5 py-2 rounded-lg border shadow-lift text-[13px] font-medium max-w-[340px]", tone)}>
      <span className={cx("shrink-0 grid place-items-center w-5 h-5 rounded-full", iconTone)}>{icon}</span>
      <span className="flex-1 leading-snug">{t.msg}</span>
      <button onClick={() => dispatch({ type: "DISMISS_TOAST", id: t.id })}
        className="shrink-0 p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-white/10 transition" aria-label="Dismiss">
        <IX size={13} />
      </button>
    </div>
  );
}

export function ToastHost() {
  const { state } = usePos();
  return (
    <div className="fixed bottom-5 right-5 z-[70] flex flex-col gap-2 pointer-events-none">
      {state.toasts.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}

export function Stat({ label, value, sub, icon, accent }: {
  label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; accent?: string;
}) {
  return (
    <div className="group bg-card border border-mist rounded-xl p-4 shadow-lift hover:-translate-y-0.5 hover:shadow-pop transition-all duration-300">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inksoft">{label}</p>
        <span className="grid place-items-center w-8 h-8 rounded-lg text-paper transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
          style={{ background: accent ?? "#0f4437" }}>
          {icon}
        </span>
      </div>
      <p className="num text-[26px] font-semibold text-ink mt-1 leading-none">{value}</p>
      {sub && <div className="mt-2 text-xs text-inksoft">{sub}</div>}
    </div>
  );
}

export function Empty({ title, hint, icon }: { title: string; hint: string; icon: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="grid place-items-center w-14 h-14 rounded-2xl bg-pine-100 text-pine-700 mb-3">{icon}</div>
      <p className="font-display font-semibold text-ink">{title}</p>
      <p className="text-sm text-inksoft mt-1 max-w-[260px]">{hint}</p>
    </div>
  );
}

/* Custom user-defined attributes (6.7) — chips + inline add/remove */
export function CustomFieldsBlock({ fields, suggestions, onSave, onRemove, listId }: {
  fields: Field[];
  suggestions: string[];
  onSave: (key: string, value: string) => void;
  onRemove: (key: string) => void;
  listId: string;
}) {
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [val, setVal] = useState("");

  const commit = () => {
    if (key.trim() && val.trim()) onSave(key.trim(), val.trim());
    setAdding(false); setKey(""); setVal("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {fields.map((f) => (
        <span key={f.key} className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded bg-mist/50 border border-mist text-[10px] text-ink">
          <span className="font-bold text-inksoft">{f.key}</span>
          <span className="font-semibold">{f.value}</span>
          <button onClick={() => onRemove(f.key)} className="p-0.5 rounded text-inksoft/60 hover:text-brick-700 hover:bg-brick-100 transition" aria-label={`Remove ${f.key}`}>
            <IX size={8} />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="inline-flex items-center gap-1 anim-fade-up">
          <input autoFocus value={key} onChange={(e) => setKey(e.target.value)} list={listId} placeholder="Key"
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setAdding(false); }}
            className="w-20 px-1.5 py-0.5 rounded border border-pine-400 text-[10px] font-semibold focus:outline-none" />
          <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Value"
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setAdding(false); }}
            className="w-24 px-1.5 py-0.5 rounded border border-pine-400 text-[10px] font-semibold focus:outline-none" />
          <button onClick={commit} className="p-1 rounded bg-pine-700 text-pine-50 hover:bg-pine-600 transition" aria-label="Save field"><ICheck size={9} /></button>
          <button onClick={() => setAdding(false)} className="p-1 rounded text-inksoft hover:text-brick-700 transition" aria-label="Cancel"><IX size={9} /></button>
        </span>
      ) : (
        <button onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-mist text-[10px] font-bold text-inksoft/70 hover:text-pine-700 hover:border-pine-400 transition-all">
          <IPlus size={8} /> field
        </button>
      )}
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}
