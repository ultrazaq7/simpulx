"use client";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { X, ShoppingBag, XCircle, Ban, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Cat = "lost" | "spam";
interface Reason { value: string; label: string; }
interface Group { key: string; title: string; subtitle: string; cat: Cat; reasons: Reason[]; }

// ── Segment-aware lost-reason taxonomy · MIRRORS services/ai-agent/segments.py ──
// Each reason has a `group`: "bought" => did_purchase=true (lead bought, just not
// from us), "nobuy" => did_purchase=false. Generic reasons apply to EVERY segment;
// segment-specific extras are appended for the matching segment. Segment keys are
// the normalized (lowercased) campaign segment labels. Spam reasons are UNIVERSAL
// and live only in the SPAM_GROUP below (never segment-specific).
type LostGroupKey = "bought" | "nobuy";
interface LostReasonDef { value: string; group: LostGroupKey; label: string; }

const LOST_GENERIC: LostReasonDef[] = [
  { value: "bought_elsewhere", group: "bought", label: "Bought elsewhere" },
  { value: "competitor_promo", group: "bought", label: "Competitor promo" },
  { value: "price_too_high", group: "nobuy", label: "Price too high" },
  { value: "no_budget", group: "nobuy", label: "No budget" },
  { value: "postponed", group: "nobuy", label: "Postponed" },
  { value: "wrong_product", group: "nobuy", label: "Wrong product / spec" },
  { value: "changed_mind", group: "nobuy", label: "Changed mind" },
  { value: "out_of_area", group: "nobuy", label: "Out of area" },
];

const SEGMENT_LOST_EXTRA: Record<string, LostReasonDef[]> = {
  "automotive": [
    { value: "bought_other_brand", group: "bought", label: "Another brand" },
    { value: "bought_used_car", group: "bought", label: "A used car instead" },
    { value: "financing_rejected", group: "nobuy", label: "Financing rejected" },
    { value: "trade_in_issue", group: "nobuy", label: "Trade-in issue" },
  ],
  "property / real estate": [
    { value: "bought_other_unit", group: "bought", label: "Another property" },
    { value: "financing_rejected", group: "nobuy", label: "Financing rejected" },
    { value: "location_mismatch", group: "nobuy", label: "Location mismatch" },
  ],
  "finance": [
    { value: "financing_rejected", group: "nobuy", label: "Financing rejected" },
    { value: "rate_too_high", group: "nobuy", label: "Rate too high" },
    { value: "ineligible", group: "nobuy", label: "Not eligible" },
  ],
  "insurance": [
    { value: "already_insured", group: "bought", label: "Already insured" },
    { value: "premium_too_high", group: "nobuy", label: "Premium too high" },
    { value: "coverage_insufficient", group: "nobuy", label: "Coverage insufficient" },
  ],
  "retail / fmcg": [
    { value: "found_cheaper", group: "bought", label: "Found cheaper" },
    { value: "out_of_stock", group: "nobuy", label: "Out of stock" },
  ],
  "education": [
    { value: "enrolled_elsewhere", group: "bought", label: "Enrolled elsewhere" },
    { value: "program_unavailable", group: "nobuy", label: "Program unavailable" },
    { value: "schedule_conflict", group: "nobuy", label: "Schedule conflict" },
  ],
  "healthcare": [
    { value: "chose_other_provider", group: "bought", label: "Chose another provider" },
    { value: "schedule_conflict", group: "nobuy", label: "Schedule conflict" },
  ],
  "travel & hospitality": [
    { value: "booked_elsewhere", group: "bought", label: "Booked elsewhere" },
    { value: "dates_unavailable", group: "nobuy", label: "Dates unavailable" },
  ],
  "food & beverage": [
    { value: "chose_other_vendor", group: "bought", label: "Chose another vendor" },
    { value: "date_unavailable", group: "nobuy", label: "Date unavailable" },
  ],
  "services": [
    { value: "hired_elsewhere", group: "bought", label: "Hired elsewhere" },
    { value: "scope_mismatch", group: "nobuy", label: "Scope mismatch" },
  ],
};

const normSeg = (segment?: string | null) => (segment || "").trim().toLowerCase();

// Business lost-reasons valid for a segment (generic + segment extras). An
// empty/unset segment behaves as automotive (historical default); a non-empty
// UNKNOWN segment gets generic reasons only (no extras).
function lostReasonsForSegment(segment?: string | null): LostReasonDef[] {
  const key = normSeg(segment) || "automotive";
  return [...LOST_GENERIC, ...(SEGMENT_LOST_EXTRA[key] || [])];
}

// Spam/invalid group · UNIVERSAL, identical for every segment.
const SPAM_GROUP: Group = {
  key: "spam", cat: "spam", title: "Spam", subtitle: "Spam / invalid",
  reasons: [
    { value: "spam_junk", label: "Spam" },
    { value: "job_seeker", label: "Job seeker" },
    { value: "abusive", label: "Abusive" },
    { value: "wrong_number", label: "Wrong number" },
    { value: "duplicate", label: "Duplicate" },
  ],
};

// Wizard step-1 groups for a segment: Purchase (bought), Not Purchase (nobuy),
// Spam. did_purchase is DERIVED from the group key ("bought" => true).
function lostGroupsForSegment(segment?: string | null): Group[] {
  const reasons = lostReasonsForSegment(segment);
  const pick = (g: LostGroupKey): Reason[] =>
    reasons.filter((r) => r.group === g).map((r) => ({ value: r.value, label: r.label }));
  return [
    { key: "bought", cat: "lost", title: "Purchase", subtitle: "Bought elsewhere", reasons: pick("bought") },
    { key: "nobuy", cat: "lost", title: "Not Purchase", subtitle: "Didn't buy", reasons: pick("nobuy") },
    SPAM_GROUP,
  ];
}

const GROUP_ICON = (key: string, cls: string) =>
  key === "bought" ? <ShoppingBag className={cls} /> : key === "spam" ? <Ban className={cls} /> : <XCircle className={cls} />;

// Code -> proper label, reused by the dashboards / contact detail so saved lost
// reasons render nicely instead of raw enums. Built from the FULL taxonomy (all
// segments' reasons union) + the universal spam reasons, so any saved value
// (e.g. trade_in_issue, rate_too_high) resolves regardless of the lead's segment.
export const LOST_REASON_LABELS: Record<string, string> = Object.fromEntries([
  ...LOST_GENERIC.map((r) => [r.value, r.label] as const),
  ...Object.values(SEGMENT_LOST_EXTRA).flat().map((r) => [r.value, r.label] as const),
  ...SPAM_GROUP.reasons.map((r) => [r.value, r.label] as const),
]);
export function lostReasonLabel(value: string): string {
  return LOST_REASON_LABELS[value] || value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());
}

interface LostReasonDialogProps {
  open: boolean;
  onClose: () => void;
  // didPurchase is derived from the reason group ("bought" => true), so the
  // caller can route to the "Lost Purchase" vs "Lost Not Purchase" stage.
  onSubmit: (reason: string, category: Cat, didPurchase: boolean) => void;
  // Campaign segment of the active conversation · drives which business
  // lost-reasons are offered. Empty/unset => automotive (historical default).
  segment?: string | null;
}

export default function LostReasonDialog({ open, onClose, onSubmit, segment }: LostReasonDialogProps) {
  const { t } = useI18n();
  // Step 1: pick a type (group). Step 2: pick a specific reason within it.
  const [group, setGroup] = useState<Group | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const groups = lostGroupsForSegment(segment);
  if (!open) return null;

  const close = () => { setGroup(null); setReason(null); onClose(); };
  const back = () => { setGroup(null); setReason(null); };
  const submit = () => { if (group && reason) { onSubmit(reason, group.cat, group.key === "bought"); close(); } };
  const isSpam = group?.cat === "spam";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={close} />
      <div role="dialog" aria-modal="true" aria-label={t("inbox.whyIsThisLeadLost")} className="relative w-[460px] max-h-[85vh] flex flex-col rounded-lg border border-border bg-card shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center px-5 py-3.5 border-b border-border">
          {group && (
            <button aria-label={t("account.back")} onClick={back} className="p-1 -ml-1 mr-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none">
              <ChevronLeft className="w-[18px] h-[18px]" />
            </button>
          )}
          <div className="flex-1">
            <p className="font-bold text-[15px] text-foreground">{group ? group.title : t("inbox.whyIsThisLeadLost2")}</p>
            <p className="text-xs text-muted-foreground">{group ? `${t(group.subtitle)} - ${t("inbox.pickClosestReason")}` : t("inbox.chooseTheOutcomeType")}</p>
          </div>
          <button aria-label={t("components.close")} onClick={close} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none">
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Step 1: type cards */}
        {!group ? (
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {groups.map((g) => (
              <button key={g.key} onClick={() => setGroup(g)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/50 transition-colors text-left outline-none">
                <span className={cn("grid place-items-center w-9 h-9 rounded-lg shrink-0", g.cat === "spam" ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary")}>
                  {GROUP_ICON(g.key, "w-4.5 h-4.5")}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-bold text-foreground">{g.title}</span>
                  <span className="block text-[12px] text-muted-foreground">{t(g.subtitle)}</span>
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
                    {t(r.label)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={group ? back : close} className="px-3 py-1.5 rounded-md text-sm font-semibold text-foreground/70 hover:bg-muted outline-none">
            {group ? t("account.back") : t("common.cancel")}
          </button>
          {group && (
            <button onClick={submit} disabled={!reason}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-semibold text-white outline-none disabled:opacity-50 transition-colors",
                isSpam ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary-dark",
              )}>
              {isSpam ? t("inbox.markAsSpam") : t("inbox.markAsLost")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
