"use client";
import { useState } from "react";
import { X, ShoppingBag, XCircle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

type Cat = "lost" | "spam";
interface Reason { value: string; label: string; }
interface Group { key: string; title: string; cat: Cat; reasons: Reason[]; }

// Mirrors classifier.LOST_REASONS (services/ai-agent). did_purchase is DERIVED from
// the group (the "bought" group => true), so no separate column is needed.
const GROUPS: Group[] = [
  {
    key: "bought", cat: "lost",
    title: "Bought elsewhere",
    reasons: [
      { value: "bought_other_brand", label: "Another brand" },
      { value: "bought_used_car", label: "A used car instead" },
      { value: "bought_elsewhere", label: "Same brand, other dealer" },
      { value: "competitor_promo", label: "Competitor promo" },
    ],
  },
  {
    key: "nobuy", cat: "lost",
    title: "Didn't buy",
    reasons: [
      { value: "out_of_area", label: "Out of area" },
      { value: "price_too_high", label: "Price too high" },
      { value: "financing_rejected", label: "Financing rejected" },
      { value: "no_budget", label: "No budget / postponed" },
      { value: "wrong_product", label: "Wrong product / spec" },
      { value: "changed_mind", label: "Changed mind / not buying" },
      { value: "trade_in_issue", label: "Trade-in issue" },
    ],
  },
  {
    key: "spam", cat: "spam",
    title: "Spam / invalid",
    reasons: [
      { value: "spam_junk", label: "Spam" },
      { value: "job_seeker", label: "Job seeker" },
      { value: "abusive", label: "Abusive" },
      { value: "wrong_number", label: "Wrong number" },
      { value: "duplicate", label: "Duplicate" },
    ],
  },
];

interface LostReasonDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string, category: Cat) => void;
}

export default function LostReasonDialog({ open, onClose, onSubmit }: LostReasonDialogProps) {
  const [selected, setSelected] = useState<{ value: string; cat: Cat } | null>(null);
  if (!open) return null;

  const close = () => { setSelected(null); onClose(); };
  const submit = () => { if (selected) { onSubmit(selected.value, selected.cat); setSelected(null); } };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={close} />
      <div className="relative w-[460px] max-h-[85vh] flex flex-col rounded-lg border border-border bg-card shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center px-5 py-3.5 border-b border-border">
          <div className="flex-1">
            <p className="font-bold text-[15px] text-foreground">Why is this lead lost?</p>
            <p className="text-xs text-muted-foreground">Pick the closest reason.</p>
          </div>
          <button onClick={close} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none">
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Groups */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {GROUPS.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-1.5 mb-1">
                {g.key === "bought" ? <ShoppingBag className="w-3.5 h-3.5 text-primary" /> :
                 g.key === "spam" ? <Ban className="w-3.5 h-3.5 text-red-500" /> :
                 <XCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{g.title}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {g.reasons.map((r) => {
                  const on = selected?.value === r.value;
                  return (
                    <button
                      key={r.value}
                      onClick={() => setSelected({ value: r.value, cat: g.cat })}
                      className={cn(
                        "px-2.5 py-1.5 rounded-md border text-xs font-semibold transition-colors outline-none",
                        on
                          ? (g.cat === "spam"
                              ? "bg-red-50 border-red-500 text-red-600"
                              : "bg-primary/10 border-primary text-primary")
                          : "bg-card border-border text-foreground/70 hover:bg-muted",
                      )}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={close} className="px-3 py-1.5 rounded-md text-sm font-semibold text-foreground/70 hover:bg-muted outline-none">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!selected}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-semibold text-white outline-none disabled:opacity-50 transition-colors",
              selected?.cat === "spam" ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary-dark",
            )}
          >
            {selected?.cat === "spam" ? "Mark as Spam" : "Mark as Lost"}
          </button>
        </div>
      </div>
    </div>
  );
}
