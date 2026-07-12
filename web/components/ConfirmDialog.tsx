"use client";
import { useI18n } from "@/lib/i18n";
import { useCallback, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Reusable, in-app confirm + prompt dialogs to replace native window.confirm /
// window.prompt. Imperative API mirroring useToast: destructure { confirm,
// ConfirmHost } (or { prompt, PromptHost }) and render the Host once.

type ConfirmOpts = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

function Backdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[130] grid place-items-center bg-black/40 backdrop-blur-sm p-4 animate-in"
      onMouseDown={onClose}
    >
      <div
        className="w-[min(430px,100%)] rounded-xl border border-border bg-popover shadow-2xl p-5 animate-scale-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function useConfirm() {
  const { t } = useI18n();
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );
  const done = (v: boolean) => { state?.resolve(v); setState(null); };

  const ConfirmHost = state ? (
    <Backdrop onClose={() => done(false)}>
      <div className="flex items-start gap-3">
        {state.danger && (
          <div className="w-9 h-9 rounded-full bg-destructive/10 grid place-items-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-foreground">{t(state.title)}</h3>
          {state.message && <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{typeof state.message === "string" ? t(state.message) : state.message}</p>}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={() => done(false)} className="px-3.5 h-9 rounded-md border border-border text-[13px] font-medium text-foreground hover:bg-muted outline-none transition-colors">{state.cancelLabel || t("common.cancel")}</button>
        <button onClick={() => done(true)} className={cn("px-3.5 h-9 rounded-md text-[13px] font-semibold text-white outline-none shadow-sm transition-colors", state.danger ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary-dark")}>{state.confirmLabel ? t(state.confirmLabel) : t("common.confirm")}</button>
      </div>
    </Backdrop>
  ) : null;

  return { confirm, ConfirmHost };
}

type PromptOpts = { title: string; message?: ReactNode; placeholder?: string; initial?: string; confirmLabel?: string };

export function usePrompt() {
  const { t } = useI18n();
  const [state, setState] = useState<(PromptOpts & { value: string; resolve: (v: string | null) => void }) | null>(null);
  const prompt = useCallback(
    (opts: PromptOpts) => new Promise<string | null>((resolve) => setState({ ...opts, value: opts.initial || "", resolve })),
    [],
  );
  const done = (v: string | null) => { state?.resolve(v); setState(null); };

  const PromptHost = state ? (
    <Backdrop onClose={() => done(null)}>
      <h3 className="text-[15px] font-bold text-foreground">{t(state.title)}</h3>
      {state.message && <p className="text-[13px] text-muted-foreground mt-1">{typeof state.message === "string" ? t(state.message) : state.message}</p>}
      <input
        autoFocus
        value={state.value}
        placeholder={state.placeholder ? t(state.placeholder) : undefined}
        onChange={(e) => setState((s) => (s ? { ...s, value: e.target.value } : s))}
        onKeyDown={(e) => { if (e.key === "Enter" && state.value.trim()) done(state.value.trim()); if (e.key === "Escape") done(null); }}
        className="w-full h-10 mt-3 px-3 rounded-md border border-input bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={() => done(null)} className="px-3.5 h-9 rounded-md border border-border text-[13px] font-medium text-foreground hover:bg-muted outline-none transition-colors">{t("common.cancel")}</button>
        <button onClick={() => state.value.trim() && done(state.value.trim())} disabled={!state.value.trim()} className="px-3.5 h-9 rounded-md text-[13px] font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 outline-none shadow-sm transition-colors">{state.confirmLabel ? t(state.confirmLabel) : "OK"}</button>
      </div>
    </Backdrop>
  ) : null;

  return { prompt, PromptHost };
}
