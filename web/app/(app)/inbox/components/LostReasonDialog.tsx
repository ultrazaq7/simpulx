"use client";
import { useState } from "react";
import { X, ShoppingBag, XCircle, Ban, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Cat = "lost" | "spam";
interface Reason { value: string; label: string; }
interface Group { key: string; title: string; subtitle: string; cat: Cat; reasons: Reason[]; }

// Three lost types (wizard step 1): Purchase (bought elsewhere), Not Purchase
// (didn't buy), Spam/invalid. did_purchase is DERIVED from the group ("bought"
// => true), so no separate column is needed. Values mirror classifier.LOST_REASONS.
const GROUPS: Group[] = [
  {
    key: "bought", cat: "lost", title: "Purchase", subtitle: "Bought elsewhere",
    reasons: [
      { value: "bought_other_brand", label: "Another brand" },
      { value: "bought_used_car", label: "A used car instead" },
      { value: "bought_elsewhere", label: "Same brand, other dealer" },
      { value: "competitor_promo", label: "Competitor promo" },
    ],
  },
  {
    key: "nobuy", cat: "lost", title: "Not Purchase", subtitle: "Didn't buy",
    reasons: [
      { value: "out_of_area", label: "Out of area" },
      { value: "price_too_high", label: "Price too high" },
      { value: "financing_rejected", label: "Financing rejected" },
      { value: "no_budget", label: "No budget / postponed" },
      { value: "wrong_product", label: "Wrong product / spec" },
      { value: "changed_mind", label: "Changed mind / not buying" },
      { value: "trade_in_issue", label: "Trade-in issue" },
      { value: "no_response", label: "No response" },
    ],
  },
  {
    key: "spam", cat: "spam", title: "Spam", subtitle: "Spam / invalid",
    reasons: [
      { value: "spam_junk", label: "Spam" },
      { value: "job_seeker", label: "Job seeker" },
      { value: "abusive", label: "Abusive" },
      { value: "wrong_number", label: "Wrong number" },
      { value: "duplicate", label: "Duplicate" },
    ],
  },
];

const GROUP_ICON = (key: string, cls: string) =>
  key === "bought" ? <ShoppingBag className={cls} /> : key === "spam" ? <Ban className={cls} /> : <XCircle className={cls} />;

// Code -> proper label (e.g. "changed_mind" -> "Changed mind / not buying"),
// reused by the dashboards so lost reasons render nicely instead of raw enums.
export const LOST_REASON_LABELS: Record<string, string> = Object.fromEntries(
  GROUPS.flatMap((g) => g.reasons).map((r) => [r.value, r.label]),
);
export function lostReasonLabel(value: string): string {
  return LOST_REASON_LABELS[value] || value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());
}

interface LostReasonDialogProps {
  open: boolean;
  onClose: () => void;
  // didPurchase is derived from the reason group ("bought" => true), so the
  // caller can route to the "Lost Purchase" vs "Lost Not Purchase" stage.
  onSubmit: (reason: string, category: Cat, didPurchase: boolean) => void;
}

export default function LostReasonDialog({ open, onClose, onSubmit }: LostReasonDialogProps) {
  // Step 1: pick a type (group). Step 2: pick a specific reason within it.
  const [group, setGroup] = useState<Group | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  if (!open) return null;

  const close = () => { setGroup(null); setReason(null); onClose(); };
  const back = () => { setGroup(null); setReason(null); };
  const submit = () => { if (group && reason) { onSubmit(reason, group.cat, group.key === "bought"); close(); } };
  const isSpam = group?.cat === "spam";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={close} />
      <div role="dialog" aria-modal="true" aria-label="Why is this lead lost" className="relative w-[460px] max-h-[85vh] flex flex-col rounded-lg border border-border bg-card shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center px-5 py-3.5 border-b border-border">
          {group && (
            <button aria-label="Back" onClick={back} className="p-1 -ml-1 mr-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none">
              <ChevronLeft className="w-[18px] h-[18px]" />
            </button>
          )}
          <div className="flex-1">
            <p className="font-bold text-[15px] text-foreground">{group ? group.title : "Why is this lead lost?"}</p>
            <p className="text-xs text-muted-foreground">{group ? `${group.subtitle} - pick the closest reason` : "Choose the outcome type."}</p>
          </div>
          <button aria-label="Close" onClick={close} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none">
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Step 1: type cards */}
        {!group ? (
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {GROUPS.map((g) => (
              <button key={g.key} onClick={() => setGroup(g)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/50 transition-colors text-left outline-none">
                <span className={cn("grid place-items-center w-9 h-9 rounded-lg shrink-0", g.cat === "spam" ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary")}>
                  {GROUP_ICON(g.key, "w-4.5 h-4.5")}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-bold text-foreground">{g.title}</span>
                  <span className="block text-[12px] text-muted-foreground">{g.subtitle}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          /* Step 2: reasons for the chosen type */
          <div className="flex-1 overflow-auto p-4">
            <div className="flex flex-wrap gap-1.5">
              {group.reasons.map((r) => {
                const on = reason === r.value;
                return (
                  <button key={r.value} onClick={() => setReason(r.value)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-md border text-xs font-semibold transition-colors outline-none",
                      on
                        ? (isSpam ? "bg-red-50 border-red-500 text-red-600" : "bg-primary/10 border-primary text-primary")
                        : "bg-card border-border text-foreground/70 hover:bg-muted",
                    )}>
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={group ? back : close} className="px-3 py-1.5 rounded-md text-sm font-semibold text-foreground/70 hover:bg-muted outline-none">
            {group ? "Back" : "Cancel"}
          </button>
          {group && (
            <button onClick={submit} disabled={!reason}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-semibold text-white outline-none disabled:opacity-50 transition-colors",
                isSpam ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary-dark",
              )}>
              {isSpam ? "Mark as Spam" : "Mark as Lost"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
