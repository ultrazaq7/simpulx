"use client";
// Shared wizard chrome used by the Create Channel / Connect Ad Account / Add API
// Source wizards so all three look identical (header + numbered step indicator +
// scrollable body + footer). Keeps each wizard focused on its own steps.
import { type ReactNode } from "react";
import { X, Check, CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldLabel, INPUT_CLASS } from "../_shared";

export function WizardModal({ title, icon, steps, step, onClose, children, footer, maxWidth = 760 }: {
  title: string; icon: ReactNode; steps: string[]; step: number;
  onClose: () => void; children: ReactNode; footer: ReactNode; maxWidth?: number;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-h-[88vh] rounded-xl border border-border bg-card shadow-2xl animate-scale-in flex flex-col" style={{ maxWidth }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center">{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[16px] text-foreground leading-tight">{title}</p>
            <p className="text-[12px] text-muted-foreground">Step {step + 1} of {steps.length}: {steps[step]}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><X className="w-5 h-5" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-6 pt-4 shrink-0">
          {steps.map((s, i) => {
            const done = i < step, active = i === step;
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                  <div className={cn("w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold shrink-0 transition-colors",
                    done ? "bg-success text-white" : active ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                    {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={cn("text-[12.5px] font-semibold whitespace-nowrap hidden sm:block", active ? "text-foreground" : "text-muted-foreground")}>{s}</span>
                </div>
                {i < steps.length - 1 && <div className={cn("h-0.5 flex-1 mx-3 rounded-full", done ? "bg-success" : "bg-border")} />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 min-h-0">{children}</div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-border shrink-0">{footer}</div>
      </div>
    </div>
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
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 px-4 h-9 rounded-md border border-border text-sm font-semibold text-foreground/80 hover:bg-muted transition-colors outline-none">
      Back
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
