"use client";
import { useI18n } from "@/lib/i18n";
// Shared wizard chrome used by the Create Channel / Connect Ad Account / Add API
// Source wizards so all three look identical (header + numbered step indicator +
// scrollable body + footer). Keeps each wizard focused on its own steps.
import { type ReactNode } from "react";
import { Check, CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import SidePanel from "@/components/SidePanel";
import { FieldLabel, INPUT_CLASS } from "../_shared";

// Shared wizard chrome, now hosted in the app-wide right drawer. Each channel
// wizard still owns its steps + footer; this renders the header, numbered step
// indicator, and scrollable body. `maxWidth` is kept for call compatibility but
// the drawer uses a fixed large width.
export function WizardModal({ title, icon, steps, step, onClose, children, footer }: {
  title: string; icon: ReactNode; steps: string[]; step: number;
  onClose: () => void; children: ReactNode; footer: ReactNode; maxWidth?: number;
}) {
  return (
    <SidePanel
      open
      onClose={onClose}
      title={title}
      description={`Step ${step + 1} of ${steps.length}: ${steps[step]}`}
      width="lg"
      footer={<div className="flex items-center gap-2">{footer}</div>}
    >
      {/* Step indicator */}
      <div className="flex items-center gap-3 pb-5 mb-1">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">{icon}</div>
        <div className="flex items-center flex-1 min-w-0">
          {steps.map((s, i) => {
            const done = i < step, active = i === step;
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn("w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold shrink-0 transition-colors",
                    done ? "bg-success text-white" : active ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                    {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={cn("text-[12.5px] font-semibold whitespace-nowrap hidden sm:block truncate", active ? "text-foreground" : "text-muted-foreground")}>{s}</span>
                </div>
                {i < steps.length - 1 && <div className={cn("h-0.5 flex-1 mx-3 rounded-full", done ? "bg-success" : "bg-border")} />}
              </div>
            );
          })}
        </div>
      </div>

      {children}
    </SidePanel>
  );
}

// WizardCard: a selectable option card for a wizard's "select" step (platform /
// source type). icon can be a node (lucide/brand) or an image-like element.
export function WizardCard({ icon, title, desc, active, disabled, onClick }: {
  icon: ReactNode; title: string; desc: string; active: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button disabled={disabled} onClick={onClick}
      className={cn("flex items-center gap-3 p-3.5 rounded-lg border text-left transition-all outline-none",
        disabled ? "opacity-55 cursor-not-allowed border-border bg-muted/30"
          : active ? "border-primary ring-2 ring-primary/20 bg-primary/[0.04]"
            : "border-border hover:border-primary/40 hover:bg-muted/40")}>
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-foreground truncate">{title}</p>
        <p className="text-[11.5px] text-muted-foreground truncate">{desc}</p>
      </div>
      {active ? <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
        : disabled ? <Lock className="w-4 h-4 text-muted-foreground/40 shrink-0" /> : null}
    </button>
  );
}

// WizardField: label + input, matching the channel wizard's field style.
export function WizardField({ label, value, onChange, placeholder, type = "text", hint, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: string; autoFocus?: boolean;
}) {
  return (
    <div>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} className={INPUT_CLASS} />
    </div>
  );
}

// Footer buttons shared across wizards.
export function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md border border-border text-sm font-semibold text-foreground/80 hover:bg-muted transition-colors outline-none">
      {t("account.back")}
    </button>
  );
}
export function ContinueButton({ onClick, disabled, label = "Continue" }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="px-5 h-9 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-brand-md transition-all outline-none">
      {label}
    </button>
  );
}
