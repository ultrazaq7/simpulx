"use client";
import { useI18n } from "@/lib/i18n";
// Campaign detail = SETUP only (Credits, AI Assistant, Catalog). All reporting
// lives on the Dashboard, so this page has no report/PDF anymore.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Coins, Sparkles, Database, Upload, Trash2, X, Search, Download, Megaphone, Pause, Play, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import LaunchAdsPanel from "./LaunchAdsPanel";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import type { CampaignDetail, CatalogItem, Template, AIStyle, AdsMetricRow, AdsAlertRow } from "@/lib/types";
import { useToast, PageBody, FieldLabel, INPUT_CLASS } from "../../_shared";
import { Tip } from "@/components/ui/tooltip";
import { useConfirm } from "@/components/ConfirmDialog";
import UnsavedBar from "@/components/UnsavedBar";

const SEGMENTS = ["Automotive", "Property / Real Estate", "Finance", "Insurance", "Retail / FMCG", "Education", "Healthcare", "Travel & Hospitality", "Food & Beverage", "Services", "Other"];
type Tab = "credits" | "ai" | "catalog" | "ads";

// AI usage features in FIXED order (= stack order + legend order + color order).
// Palette validated with the dataviz skill: CVD-safe adjacency + >=3:1 contrast on
// BOTH the light and dark chart surface. nurture/followup are the credit-consuming
// customer replies; extract/summary are internal AI work (not billed to credits).
const USAGE_FEATURES = [
  { key: "nurture", label: "Nurture", color: "#0E9E70" },
  { key: "followup", label: "Follow-up", color: "#2563EB" },
  { key: "extract", label: "Extract", color: "#B8730E" },
  { key: "summary", label: "Summary", color: "#7C3AED" },
] as const;

// Custom chart tooltip: the day + per-feature counts + total, in text tokens (never
// the series colour) with a coloured swatch carrying identity.
function UsageTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-[12px]">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.filter((p) => p.value > 0).map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium tabular-nums text-foreground">{p.value}</span>
        </div>
      ))}
      <div className="mt-1 pt-1 border-t border-border flex justify-between gap-6">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold tabular-nums text-foreground">{total}</span>
      </div>
    </div>
  );
}

export default function CampaignDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify, ToastHost } = useToast();
  // Persist the active tab in the URL so a refresh keeps you on the same page.
  const TAB_KEYS: Tab[] = ["credits", "ai", "catalog", "ads"];
  const urlTab = searchParams.get("tab") as Tab | null;
  const [tab, setTabState] = useState<Tab>(urlTab && TAB_KEYS.includes(urlTab) ? urlTab : "credits");
  const setTab = (t: Tab) => {
    setTabState(t);
    router.replace(`/settings/campaigns/${id}?tab=${t}`, { scroll: false });
  };
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCampaign(id).then(setCampaign).catch((e) => notify(String(e), "error")).finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { key: Tab; label: string; Icon: typeof Coins }[] = [
    { key: "credits", label: "Credits & Usage", Icon: Coins },
    { key: "ai", label: "AI Assistant", Icon: Sparkles },
    { key: "catalog", label: "Catalog & Pricing", Icon: Database },
    { key: "ads", label: "Ads", Icon: Megaphone },
  ];

  return (
    <PageBody wide>
      {ToastHost}
      <div className="w-full">
        <button onClick={() => router.push("/settings/campaigns")} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground mb-3 outline-none">
          <ArrowLeft className="w-4 h-4" /> {t("settings.campaigns")}
        </button>
        {loading ? (
          <div className="grid place-items-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !campaign ? (
          <p className="text-muted-foreground">{t("settings.campaignNotFound")}</p>
        ) : (
          <div className="bg-card border border-border rounded-xl shadow-xs p-6 sm:p-8">
            <h1 className="text-xl font-bold text-foreground">{campaign.name}</h1>
            {campaign.dealer_name && <p className="text-[13px] text-muted-foreground">{campaign.dealer_name}</p>}
            <div className="flex gap-1 mt-5 border-b border-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((tb) => (
                <button key={tb.key} onClick={() => setTab(tb.key)}
                  className={cn("inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors outline-none shrink-0 whitespace-nowrap",
                    tab === tb.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  <tb.Icon className="w-4 h-4 shrink-0" /> {t(tb.label)}
                </button>
              ))}
            </div>
            <div className="mt-6">
              {tab === "credits" && <CreditsTab id={id} notify={notify} />}
              {tab === "ai" && <AITab campaign={campaign} onSaved={(c) => { setCampaign(c); notify(t("settings.aiSettingsSaved")); }} onError={(m) => notify(m, "error")} />}
              {tab === "catalog" && <CatalogTab id={id} segment={campaign.segment ?? undefined} cities={campaign.covered_cities ?? []} notify={notify} />}
              {tab === "ads" && <AdsTab id={id} notify={notify} />}
            </div>
          </div>
        )}
      </div>
    </PageBody>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className={cn("text-2xl font-bold tabular-nums", accent ?? "text-foreground")}>{value}</p>
      <p className="text-[12px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function CreditsTab({ id, notify }: { id: string; notify: (m: string, s?: "success" | "error") => void }) {
  const { t } = useI18n();
  const [credits, setCredits] = useState<{ allocated_credits: number; used_credits: number; remaining_credits: number; low_balance_threshold: number; org_total_credits: number; allocated_elsewhere: number } | null>(null);
  const [usageRows, setUsageRows] = useState<{ day: string; feature: string; count: number; cost_usd: string }[]>([]);
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [alloc, setAlloc] = useState("");
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);

  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const from = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - (rangeDays - 1)); return d.toISOString().slice(0, 10); }, [rangeDays]);

  function loadCredits() {
    api.getCampaignCredits(id).then((c) => { setCredits(c); setAlloc(String(c.allocated_credits)); setThreshold(String(c.low_balance_threshold)); }).catch(() => {});
  }
  useEffect(loadCredits, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.getCampaignUsage(id, { from, to }).then((r) => setUsageRows(r.rows || [])).catch(() => setUsageRows([])); }, [id, from, to]);

  async function save() {
    setSaving(true);
    try {
      await api.allocateCampaignCredits(id, { allocated_credits: Number(alloc) || 0, low_balance_threshold: Number(threshold) || 0 });
      notify(t("settings.creditsUpdated")); loadCredits();
    } catch (e) { notify(String(e), "error"); } finally { setSaving(false); }
  }

  // Fill every day in [from,to] so the time axis is continuous, then fold in the
  // per-feature counts for a stacked bar per day.
  const chartData = useMemo(() => {
    const days: string[] = [];
    // Iterate in UTC so the day keys match the server's date_trunc('day', ...)
    // UTC output. Using local-midnight Dates + toISOString() shifted every key
    // back a day in +UTC timezones (e.g. Jakarta), which dropped the most recent
    // days off the axis — so a campaign whose usage was all today rendered an
    // empty chart despite the "N operations" count being non-zero.
    const d = new Date(from + "T00:00:00Z"); const end = new Date(to + "T00:00:00Z");
    for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
    type FKey = "nurture" | "followup" | "extract" | "summary";
    const FKEYS: readonly FKey[] = ["nurture", "followup", "extract", "summary"];
    const byDay: Record<string, { day: string; nurture: number; followup: number; extract: number; summary: number }> = {};
    for (const day of days) byDay[day] = { day, nurture: 0, followup: 0, extract: 0, summary: 0 };
    for (const r of usageRows) {
      const row = byDay[r.day];
      if (row && (FKEYS as readonly string[]).includes(r.feature)) row[r.feature as FKey] += r.count || 0;
    }
    return days.map((day) => byDay[day]);
  }, [usageRows, from, to]);
  const periodTotal = usageRows.reduce((s, r) => s + (r.count || 0), 0);

  function exportCsv() {
    const head = ["date", "feature", "count", "cost_usd"];
    const lines = usageRows.map((r) => [r.day, r.feature, r.count, r.cost_usd].join(","));
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `usage_${from}_to_${to}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (!credits) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  // A campaign can only be allocated what the ORG pool still has free.
  const available = Math.max(0, credits.org_total_credits - credits.allocated_elsewhere);
  const overCap = (Number(alloc) || 0) > available;
  const allocChangedCount = ((Number(alloc) !== credits.allocated_credits ? 1 : 0) + (Number(threshold) !== credits.low_balance_threshold ? 1 : 0)) && !overCap ? 1 : 0;
  const resetAlloc = () => { setAlloc(String(credits.allocated_credits)); setThreshold(String(credits.low_balance_threshold)); };
  const low = credits.allocated_credits > 0 && credits.remaining_credits <= credits.low_balance_threshold;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("settings.allocated")} value={credits.allocated_credits} />
        <Stat label={t("settings.used")} value={credits.used_credits} />
        <Stat label={t("settings.remaining")} value={credits.remaining_credits} accent={low ? "text-amber-600" : undefined} />
      </div>
      {low && <p className="text-[13px] text-amber-600 font-medium">{t("settings.lowBalanceTopUpBefore")}</p>}
      {credits.allocated_credits === 0 && <p className="text-[13px] text-muted-foreground">{t("settings.noAllocationSetAiReplies")}</p>}

      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-[13px] font-semibold text-foreground">{t("settings.allocation")}</p>
        <p className="text-[12px] text-muted-foreground">
          Org pool: <span className="font-medium text-foreground tabular-nums">{available}</span> of {credits.org_total_credits} credits free
          {credits.allocated_elsewhere > 0 && <> · {credits.allocated_elsewhere} allocated to other campaigns</>}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>{t("settings.allocatedCredits")}</FieldLabel>
            <input type="number" min={0} max={available} value={alloc} onChange={(e) => setAlloc(e.target.value)} className={cn(INPUT_CLASS, overCap && "border-red-500 focus:border-red-500")} />
            {overCap && <p className="text-[11.5px] text-red-500 mt-1">Max {available} (org pool limit). Naikin pool di Superadmin dulu.</p>}
          </div>
          <div><FieldLabel>{t("settings.lowBalanceAlertAt")}</FieldLabel><input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} className={INPUT_CLASS} /></div>
        </div>
      </div>
      <UnsavedBar count={allocChangedCount} saving={saving} onSave={save} onCancel={resetAlloc} saveLabel="Save allocation" />

      {/* Usage — stacked by AI feature, with date range + CSV export */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <p className="text-[13px] font-semibold text-foreground">AI Usage</p>
            <p className="text-[11.5px] text-muted-foreground tabular-nums">{periodTotal} operations · {from} → {to}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-md border border-border overflow-hidden">
              {[7, 30, 90].map((n) => (
                <button key={n} onClick={() => setRangeDays(n as 7 | 30 | 90)}
                  className={cn("px-2.5 py-1 text-[12px] font-medium", rangeDays === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {n}d
                </button>
              ))}
            </div>
            <button onClick={exportCsv} disabled={usageRows.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>

        {/* legend — identity is never colour-alone */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
          {USAGE_FEATURES.map((f) => (
            <div key={f.key} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: f.color }} /> {f.label}
            </div>
          ))}
        </div>

        {periodTotal === 0 ? (
          <p className="text-[13px] text-muted-foreground py-10 text-center">{t("settings.noAiRepliesYet")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={22} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
              <RTooltip cursor={{ fill: "hsl(var(--muted))" }} content={<UsageTooltip />} />
              {USAGE_FEATURES.map((f, i) => (
                <Bar key={f.key} dataKey={f.key} stackId="u" fill={f.color} name={f.label}
                  radius={i === USAGE_FEATURES.length - 1 ? [3, 3, 0, 0] : 0} maxBarSize={26} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors outline-none", on ? "bg-primary" : "bg-muted")}>
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5", on ? "translate-x-[18px] ml-0.5" : "translate-x-0.5")} />
    </button>
  );
}

const TONE_OPTS = [
  { value: "friendly", label: "Ramah & santai" },
  { value: "professional", label: "Profesional" },
  { value: "consultative", label: "Konsultatif" },
] as const;
const LEN_OPTS = [
  { value: "short", label: "Pendek" },
  { value: "medium", label: "Sedang" },
] as const;

// Per-campaign AI response tuning. Self-contained (own state + save) so it doesn't
// tangle with the AI-settings form's save. Auto-generate asks Sonnet for a
// recommended style from the campaign setup; the preview runs the real nurture path.
function AIStyleSection({ campaignId, initial, onSaved, onError }: {
  campaignId: string; initial: AIStyle | null | undefined;
  onSaved: (s: AIStyle) => void; onError: (m: string) => void;
}) {
  const init: AIStyle = { persona: "", tone: "", length: "", goal: "", custom_rules: "", ...(initial || {}) };
  const [persona, setPersona] = useState(init.persona || "");
  const [tone, setTone] = useState<string>(init.tone || "");
  const [length, setLength] = useState<string>(init.length || "");
  const [goal, setGoal] = useState(init.goal || "");
  const [rules, setRules] = useState(init.custom_rules || "");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewMsg, setPreviewMsg] = useState("");
  const [previewReply, setPreviewReply] = useState("");
  const [previewing, setPreviewing] = useState(false);

  const buildStyle = (): AIStyle => ({ persona: persona.trim(), tone: tone as AIStyle["tone"], length: length as AIStyle["length"], goal: goal.trim(), custom_rules: rules.trim() });
  const changed = persona.trim() !== (init.persona || "") || tone !== (init.tone || "") || length !== (init.length || "") || goal.trim() !== (init.goal || "") || rules.trim() !== (init.custom_rules || "");

  async function generate() {
    setGenerating(true);
    try {
      const { style: s } = await api.suggestAIStyle(campaignId);
      setPersona(s.persona || ""); setTone(s.tone || ""); setLength(s.length || ""); setGoal(s.goal || ""); setRules(s.custom_rules || "");
    } catch (e) { onError(String(e)); } finally { setGenerating(false); }
  }
  async function preview() {
    setPreviewing(true); setPreviewReply("");
    try {
      const { reply } = await api.previewAIStyle(campaignId, buildStyle() as Record<string, string>, previewMsg);
      setPreviewReply(reply || "(kosong)");
    } catch (e) { onError(String(e)); } finally { setPreviewing(false); }
  }
  async function save() {
    setSaving(true);
    try { const s = buildStyle(); await api.updateCampaign(campaignId, { ai_style: s }); onSaved(s); }
    catch (e) { onError(String(e)); } finally { setSaving(false); }
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13.5px] font-semibold text-foreground flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" /> AI Response Style</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">Atur cara AI membalas lead di campaign ini. Makin spesifik, makin bagus konversinya.</p>
        </div>
        <button onClick={generate} disabled={generating}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[12.5px] font-semibold hover:bg-primary/15 disabled:opacity-50">
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Auto-generate
        </button>
      </div>

      <div className="grid xl:grid-cols-2 gap-4 items-start">
      <div className="space-y-4">
      <div>
        <FieldLabel>Nada bicara</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {TONE_OPTS.map((o) => (
            <button key={o.value} onClick={() => setTone(tone === o.value ? "" : o.value)}
              className={cn("px-3 py-1.5 rounded-full text-[12.5px] font-medium border", tone === o.value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground")}>{o.label}</button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Panjang balasan</FieldLabel>
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          {LEN_OPTS.map((o) => (
            <button key={o.value} onClick={() => setLength(length === o.value ? "" : o.value)}
              className={cn("px-4 py-1.5 text-[12.5px] font-medium", length === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{o.label}</button>
          ))}
        </div>
      </div>

      <div><FieldLabel hint="Siapa si AI di campaign ini">Persona</FieldLabel>
        <textarea value={persona} onChange={(e) => setPersona(e.target.value)} rows={2} placeholder="mis. Sales consultant Mitsubishi yang paham produk & simulasi kredit" className={cn(INPUT_CLASS, "h-auto py-2 leading-snug resize-y")} /></div>
      <div><FieldLabel hint="Tujuan utama percakapan">Goal</FieldLabel>
        {/* Textarea, not an input: a goal is often two clauses ("ajak simulasi
            kredit LALU jadwalkan test drive") and was being typed into a box that
            hid half of it. Resizable like Persona / Aturan khusus. */}
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="mis. Ajak lead simulasi kredit lalu jadwalkan test drive" className={cn(INPUT_CLASS, "h-auto py-2 leading-snug resize-y")} /></div>
      <div><FieldLabel hint="Do & don't khusus campaign ini">Aturan khusus</FieldLabel>
        <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={3} placeholder="mis. Selalu tawarkan simulasi cicilan. Jangan sebut brand kompetitor. Selalu tanya domisili." className={cn(INPUT_CLASS, "h-auto py-2 leading-snug resize-y")} /></div>

      </div>

      <div className="rounded-lg bg-muted/40 p-3 space-y-2">
        <p className="text-[12px] font-semibold text-foreground">Coba balasan</p>
        <div className="flex gap-2">
          <input value={previewMsg} onChange={(e) => setPreviewMsg(e.target.value)} placeholder="Ketik pesan customer... (mis. Harga Xforce berapa?)" className={cn(INPUT_CLASS, "flex-1")} />
          <button onClick={preview} disabled={previewing} className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-[12.5px] font-medium text-foreground hover:bg-background disabled:opacity-50">
            {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Coba"}</button>
        </div>
        {previewReply && <div className="rounded-lg bg-primary/10 text-foreground text-[13px] px-3 py-2 whitespace-pre-wrap">{previewReply}</div>}
      </div>
      </div>

      {changed && (
        <button onClick={save} disabled={saving} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save style</button>
      )}
    </div>
  );
}

function AITab({ campaign, onSaved, onError }: { campaign: CampaignDetail; onSaved: (c: CampaignDetail) => void; onError: (m: string) => void }) {
  const { t } = useI18n();
  const init = {
    segment: campaign.segment ?? "", brand: campaign.brand ?? "",
    autoReply: campaign.ai_auto_reply ?? false, lang: campaign.ai_language ?? "id",
    dynLang: campaign.ai_dynamic_language ?? true, smartSummary: campaign.ai_smart_summary ?? true,
    followupTpl: campaign.followup_template_id ?? "", intakeForm: campaign.intake_form_id ?? "",
    budget: campaign.monthly_budget != null ? String(campaign.monthly_budget) : "",
    avgDeal: campaign.avg_deal_value != null ? String(campaign.avg_deal_value) : "",
    followupFreq: campaign.followup_frequency ?? "normal",
  };
  const [segment, setSegment] = useState(init.segment);
  const [brand, setBrand] = useState(init.brand);
  const [autoReply, setAutoReply] = useState(init.autoReply);
  const [lang, setLang] = useState(init.lang);
  const [dynLang, setDynLang] = useState(init.dynLang);
  const [smartSummary, setSmartSummary] = useState(init.smartSummary);
  const [followupTpl, setFollowupTpl] = useState(init.followupTpl);
  const [intakeForm, setIntakeForm] = useState(init.intakeForm);
  const [budget, setBudget] = useState(init.budget);
  const [avgDeal, setAvgDeal] = useState(init.avgDeal);
  const [followupFreq, setFollowupFreq] = useState(init.followupFreq);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Only APPROVED templates can be sent outside the 24h window.
  useEffect(() => {
    api.listTemplates({ campaign_id: campaign.id })
      .then((t) => setTemplates((t || []).filter((x) => x.status === "APPROVED")))
      .catch(() => setTemplates([]));
    api.listFlows().then((fs) => setForms((fs || []).map((f) => ({ id: f.id, name: f.name })))).catch(() => setForms([]));
  }, [campaign.id]);

  const changedCount = [segment !== init.segment, brand.trim() !== init.brand, autoReply !== init.autoReply, lang !== init.lang, dynLang !== init.dynLang, smartSummary !== init.smartSummary, followupTpl !== init.followupTpl, intakeForm !== init.intakeForm, budget.trim() !== init.budget, avgDeal.trim() !== init.avgDeal, followupFreq !== init.followupFreq].filter(Boolean).length;
  function reset() { setSegment(init.segment); setBrand(init.brand); setAutoReply(init.autoReply); setLang(init.lang); setDynLang(init.dynLang); setSmartSummary(init.smartSummary); setFollowupTpl(init.followupTpl); setIntakeForm(init.intakeForm); setBudget(init.budget); setAvgDeal(init.avgDeal); setFollowupFreq(init.followupFreq); }

  async function save() {
    setSaving(true);
    try {
      const mb = budget.trim() === "" ? null : Number(budget.replace(/[^0-9.]/g, ""));
      const adv = avgDeal.trim() === "" ? null : Number(avgDeal.replace(/[^0-9.]/g, ""));
      const patch = { segment, brand: brand.trim(), ai_auto_reply: autoReply, ai_language: lang, ai_dynamic_language: dynLang, ai_smart_summary: smartSummary, followup_template_id: followupTpl || "none", intake_form_id: intakeForm || "none", monthly_budget: mb, avg_deal_value: adv, followup_frequency: followupFreq };
      await api.updateCampaign(campaign.id, patch);
      onSaved({ ...campaign, segment, brand: brand.trim(), ai_auto_reply: autoReply, ai_language: lang, ai_dynamic_language: dynLang, ai_smart_summary: smartSummary, followup_template_id: followupTpl || null, intake_form_id: intakeForm || null, monthly_budget: mb, avg_deal_value: adv, followup_frequency: followupFreq });
    } catch (e) { onError(String(e)); } finally { setSaving(false); }
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-6 items-start">
      {/* Left column: AI settings fields */}
      <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <p className="text-[13.5px] font-semibold text-foreground">{t("settings.autoReply")}</p>
        <Toggle on={autoReply} onToggle={() => setAutoReply((v) => !v)} />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <p className="text-[13.5px] font-semibold text-foreground">{t("inbox.smartSummary")}</p>
        <Toggle on={smartSummary} onToggle={() => setSmartSummary((v) => !v)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel>{t("settings.segment")}</FieldLabel>
          <Select value={segment} onChange={setSegment} placeholder={t("settings.notSet")} searchable
            options={[{ value: "", label: "Not set" }, ...SEGMENTS.map((s) => ({ value: s, label: s }))]} /></div>
        <div><FieldLabel>{t("components.brand")}</FieldLabel><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={t("settings.eGMitsubishiXforce")} className={INPUT_CLASS} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel>{t("settings.replyLanguage")}</FieldLabel>
          <Select value={lang} onChange={setLang} searchable={false} options={[{ value: "id", label: "Indonesian" }, { value: "en", label: "English" }]} /></div>
        <div className="flex items-end">
          <div className="flex items-center justify-between gap-3 w-full rounded-lg border border-border p-3">
            <p className="text-[13px] font-medium text-foreground">{t("settings.matchContactSLanguage")}</p>
            <Toggle on={dynLang} onToggle={() => setDynLang((v) => !v)} />
          </div>
        </div>
      </div>
      <div>
        <FieldLabel hint="Seberapa sering AI nge-follow-up lead yang diam">Follow-up frequency</FieldLabel>
        <Select value={followupFreq} onChange={setFollowupFreq} searchable={false}
          options={[
            { value: "off", label: "Off (tanpa follow-up)" },
            { value: "low", label: "Jarang (interval lebih panjang)" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "Sering (nge-follow-up lebih cepat)" },
          ]} />
      </div>
      <div>
        <FieldLabel hint={t("settings.autoFollowUpNudgesA")}>{t("settings.followUpTemplate")}</FieldLabel>
        <Select value={followupTpl} onChange={setFollowupTpl}
          options={[{ value: "", label: "None (skip out-of-window follow-ups)" }, ...templates.map((t) => ({ value: t.id, label: `${t.name} (${t.language})` }))]} />
        {templates.length === 0 && (
          <p className="text-[11.5px] text-muted-foreground mt-1">{t("settings.noApprovedTemplatesYetCreate")}</p>
        )}
      </div>
      <div>
        <FieldLabel hint={t("settings.theAiAutoSendsThis")}>{t("settings.intakeFormAutoSentOn")}</FieldLabel>
        <Select value={intakeForm} onChange={setIntakeForm} placeholder={t("settings.noForm")} searchable
          options={[{ value: "", label: "No form" }, ...forms.map((f) => ({ value: f.id, label: f.name }))]} />
      </div>
      <div>
        <FieldLabel hint={t("settings.totalAdBudgetForThis")}>{t("settings.totalBudgetRp")}</FieldLabel>
        <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="200000000" className={INPUT_CLASS} />
      </div>
      <div>
        <FieldLabel hint="Nilai deal rata-rata, dipakai buat Revenue Influenced kalau harga OTR katalog gak ke-match">Avg deal value (Rp)</FieldLabel>
        <input value={avgDeal} onChange={(e) => setAvgDeal(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="350000000" className={INPUT_CLASS} />
      </div>
      <UnsavedBar count={changedCount} saving={saving} onSave={save} onCancel={reset} saveLabel="Save AI settings" />
      </div>
      {/* Right column: AI response style (moved here from the top) */}
      <div className="lg:sticky lg:top-4">
        <AIStyleSection campaignId={campaign.id} initial={campaign.ai_style}
          onSaved={(s) => onSaved({ ...campaign, ai_style: s })} onError={onError} />
      </div>
    </div>
  );
}

// ── Catalog & Pricing (WS-A) ────────────────────────────────────────────────
// Per-campaign pricelist the Simpuler bot grounds pricing answers on. Upload a
// CSV; recognized columns map to the spine (item/variant/location/price), the
// rest land in each row's attributes. A new upload replaces the campaign's rows.
type CatalogRowInput = { item_name: string; variant_name?: string; location_name?: string; category_type?: string; headline_price?: number | null; attributes?: Record<string, unknown> };

function CatalogTab({ id, segment, cities, notify }: { id: string; segment?: string; cities: string[]; notify: (m: string, s?: "success" | "error") => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<CatalogItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null); // row open in the edit drawer
  const [catQuery, setCatQuery] = useState(""); // client-side filter over the catalog table
  // Service area comes from the CAMPAIGN now, not from chips living on this tab.
  // It used to be picked here per upload, which made the pricelist the de-facto
  // owner of the area: a campaign with no catalog could never have one, and a
  // re-upload silently rewrote it. Cities are edited once in campaign settings and
  // this tab just applies them.
  const locations = cities;
  const needsCity = locations.length === 0;
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, ConfirmHost } = useConfirm();
  // Live upload progress so the user sees WHAT the system is doing (not a blind spinner).
  const [progress, setProgress] = useState<{ phase: string; started: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!progress) { setElapsed(0); return; }
    setElapsed(Math.floor((Date.now() - progress.started) / 1000));
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - progress.started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [progress]);

  function load() { api.getCampaignCatalog(id).then(setRows).catch(() => setRows([])); }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    // Re-uploading over an existing catalog forces a fresh PDF extraction (skip the
    // server's content-addressed cache) so a stale/partial cached read can't keep
    // coming back on every retry. A first upload still benefits from the cache.
    const isReupload = (rows?.length ?? 0) > 0;
    const started = Date.now();
    const step = (phase: string) => setProgress((p) => ({ phase, started: p?.started ?? started }));
    setBusy(true);
    try {
      const lower = file.name.toLowerCase();
      const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");
      const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls") || file.type.includes("spreadsheet") || file.type.includes("excel");
      let parsed: CatalogRowInput[];
      if (isPdf) {
        step("Reading your PDF file...");
        const b64 = fileToBase64(await file.arrayBuffer());
        step("Simpuler is reading your pricelist...");
        const res = await api.extractCatalogPdf(id, { pdf_base64: b64, segment, force: isReupload }, (info) => {
          if (info.rows && info.rows > 0) step(`Simpuler extracted ${info.rows} item${info.rows === 1 ? "" : "s"} so far...`);
        });
        if (res.error) { notify(`Extraction failed: ${res.error}`, "error"); return; }
        if (res.warning === "scanned") { notify(t("settings.thisLooksLikeAScanned"), "error"); return; }
        if (res.warning === "no_llm") { notify(t("settings.pdfExtractionIsNotEnabled"), "error"); return; }
        if (res.warning === "parse_failed") { notify(t("settings.couldNotReadThisPdf"), "error"); return; }
        parsed = res.rows || [];
        if (parsed.length === 0) { notify(t("settings.noPricingRowsWereFound"), "error"); return; }
      } else if (isExcel) {
        step("Reading your Excel file...");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        parsed = parseCatalogRows(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as (string | number | null)[][]);
      } else {
        step("Reading your CSV file...");
        parsed = parseCatalogCsv(await file.text());
      }
      if (parsed.length === 0) { notify(t("settings.noRowsFoundMakeSure"), "error"); return; }
      // The chosen location chips OVERRIDE whatever location the file had: every row
      // is duplicated once per selected city so the pricelist covers each location.
      // Leave the chips empty to keep the file's own location column.
      const finalRows = locations.length === 0 ? parsed
        : parsed.flatMap((r) => locations.map((loc) => ({ ...r, location_name: loc })));
      step(`Found ${parsed.length} item${parsed.length === 1 ? "" : "s"}${locations.length ? ` x ${locations.length} location${locations.length === 1 ? "" : "s"}` : ""}. Saving to the catalog...`);
      const month = new Date().toISOString().slice(0, 7);
      const res = await api.uploadCampaignCatalog(id, { replace: true, segment, source_ref: file.name, effective_month: month, rows: finalRows });
      // Surface rows the server dropped for a missing name so a short/partial extraction
      // is visible instead of silently ending up with fewer items than the file had.
      const skippedNote = res.skipped > 0 ? ` (${res.skipped} skipped — missing name)` : "";
      notify(`Imported ${res.inserted} item${res.inserted === 1 ? "" : "s"}${isPdf ? " from PDF" : ""}${skippedNote}`, res.skipped > 0 ? "error" : "success");
      load();
    } catch (err) { notify(String(err), "error"); } finally { setBusy(false); setProgress(null); }
  }

  async function clearAll() {
    if (!(await confirm({ title: "Clear catalog?", message: "Remove all catalog rows for this campaign? The bot will fall back to the shared pricing table.", danger: true, confirmLabel: "Clear" }))) return;
    setBusy(true);
    try { await api.clearCampaignCatalog(id); notify(t("settings.catalogCleared")); load(); }
    catch (e) { notify(String(e), "error"); } finally { setBusy(false); }
  }

  if (rows === null) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  const fmtPrice = (v: number | null) => v == null ? "" : "Rp " + Math.round(v).toLocaleString("id-ID");


  // Client-side filter so a specific item stays findable in a big catalog: the table
  // only renders a slice and rows are alphabetical, so late letters (e.g. "X" for
  // XForce) would otherwise sit past the cap and never show.
  const catQ = catQuery.trim().toLowerCase();
  const filteredRows = catQ
    ? rows.filter((r) => (r.item_name || "").toLowerCase().includes(catQ)
        || (r.variant_name || "").toLowerCase().includes(catQ)
        || (r.location_name || "").toLowerCase().includes(catQ))
    : rows;

  return (
    <div className="space-y-5">
      {ConfirmHost}
      {progress && (
        <div className="fixed bottom-6 right-6 z-[70] w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-2xl p-4 animate-slide-in-right">
          <div className="flex items-start gap-3">
            <Loader2 className="w-5 h-5 mt-0.5 shrink-0 animate-spin text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground leading-snug">{progress.phase}</p>
              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">{elapsed}{t("settings.sElapsed")}</p>
              <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-primary animate-indeterminate" />
              </div>
            </div>
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".csv,text/csv,.pdf,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFile} />

      {/* No service area => no upload. Every row is fanned out per city, so with an
          empty area each row lands with location NULL: the bot cannot tell a Wamena
          lead from a Jakarta one and out-of-area never reaches a human. Blocked at the
          button rather than at submit, so the fix is obvious before picking a file. */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto mb-3"><Upload className="w-5 h-5" /></div>
          <p className="text-[13.5px] font-semibold text-foreground">{t("settings.uploadAPricelistCsvExcel")}</p>
          {/* Tip only renders its popup while needsCity (empty label => passthrough). A
              disabled button suppresses hover, so the button stays enabled and guards
              the click itself; the tooltip explains why nothing happens. */}
          <Tip label={needsCity ? t("settings.pickCityBeforeUpload") : ""}>
            <button onClick={() => { if (!needsCity) fileRef.current?.click(); }} disabled={busy}
              aria-disabled={needsCity}
              className={cn("inline-flex items-center gap-2 px-3.5 h-9 mt-4 rounded-md text-sm font-semibold shadow-sm transition-all outline-none disabled:opacity-50",
                needsCity ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-white hover:bg-primary-dark")}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{t("settings.chooseFile")}
            </button>
          </Tip>
        </div>
      ) : (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-[13px] text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{rows.length}</span> item{rows.length === 1 ? "" : "s"} {t("settings.inThisCampaignSCatalog")}</p>
          <div className="flex items-center gap-2">
            <Tip label={needsCity ? t("settings.pickCityBeforeUpload") : ""}>
            <button onClick={() => { if (!needsCity) fileRef.current?.click(); }} disabled={busy}
              aria-disabled={needsCity}
              className={cn("inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-[12.5px] font-semibold outline-none disabled:opacity-50",
                needsCity ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-background text-foreground hover:bg-muted")}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}{t("settings.replacePricelist")}
            </button>
            </Tip>
            <button onClick={clearAll} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[12.5px] font-semibold text-red-500 hover:bg-red-50 outline-none disabled:opacity-50">
              <Trash2 className="w-4 h-4" />{t("components.clearAll")}
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <input value={catQuery} onChange={(e) => setCatQuery(e.target.value)}
              placeholder={t("settings.searchCatalogItemVariantLocation")}
              className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground" />
            {catQuery && <button onClick={() => setCatQuery("")} className="rounded p-0.5 hover:bg-muted outline-none"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm min-w-[640px] whitespace-nowrap">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border">
                  {["Item", "Variant", "Location", "Price", "Attributes"].map((h) => (
                    <th key={h} className={cn("px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", h === "Price" ? "text-right" : "text-left")}>{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 1000).map((r) => (
                  <tr key={r.id} onClick={() => setEditing(r)} className="border-b border-border/60 cursor-pointer hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2 text-[13px] font-medium text-foreground">{r.item_name}</td>
                    <td className="px-3 py-2 text-[12.5px] text-muted-foreground">{r.variant_name || ""}</td>
                    <td className="px-3 py-2 text-[12.5px] text-muted-foreground">{r.location_name || ""}</td>
                    <td className="px-3 py-2 text-[12.5px] text-foreground text-right tabular-nums">{fmtPrice(r.headline_price)}</td>
                    <td className="px-3 py-2 text-[11.5px] text-muted-foreground max-w-[280px] truncate">{Object.entries(r.attributes || {}).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join("  •  ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-3 py-2 text-[11.5px] text-muted-foreground border-t border-border tabular-nums">
            {filteredRows.length === 0
              ? t("settings.noMatches")
              : `${Math.min(filteredRows.length, 1000).toLocaleString("id-ID")} / ${filteredRows.length.toLocaleString("id-ID")}${catQ ? ` · "${catQuery.trim()}"` : ""}`}
          </p>
        </div>
      )}

      {editing && (
        <CatalogRowDrawer campaignId={id} row={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} notify={notify} />
      )}
    </div>
  );
}

// Right-side edit drawer for one catalog row (item / variant / location / price +
// free-form attributes). Saves via PATCH, or deletes the row.
function CatalogRowDrawer({ campaignId, row, onClose, onSaved, notify }: {
  campaignId: string; row: CatalogItem; onClose: () => void; onSaved: () => void;
  notify: (m: string, s?: "success" | "error") => void;
}) {
  const { t } = useI18n();
  const [item, setItem] = useState(row.item_name);
  const [variant, setVariant] = useState(row.variant_name ?? "");
  const [location, setLocation] = useState(row.location_name ?? "");
  const [price, setPrice] = useState(row.headline_price != null ? String(row.headline_price) : "");
  const [attrs, setAttrs] = useState<{ k: string; v: string }[]>(
    Object.entries(row.attributes || {}).map(([k, v]) => ({ k, v: String(v ?? "") })),
  );
  const [saving, setSaving] = useState(false);
  const setAttr = (i: number, patch: Partial<{ k: string; v: string }>) =>
    setAttrs((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    if (!item.trim()) { notify(t("settings.itemNameIsRequired"), "error"); return; }
    setSaving(true);
    try {
      const attributes: Record<string, unknown> = {};
      attrs.forEach(({ k, v }) => { if (k.trim()) attributes[k.trim()] = v; });
      await api.updateCatalogRow(campaignId, row.id, {
        item_name: item.trim(), variant_name: variant.trim(), location_name: location.trim(),
        category_type: row.category_type ?? "",
        headline_price: price.trim() === "" ? null : Number(price.replace(/[^0-9.]/g, "")),
        attributes,
      });
      notify(t("settings.rowUpdated")); onSaved();
    } catch (e) { notify(String(e), "error"); } finally { setSaving(false); }
  }
  async function remove() {
    setSaving(true);
    try { await api.deleteCatalogRow(campaignId, row.id); notify(t("settings.rowDeleted")); onSaved(); }
    catch (e) { notify(String(e), "error"); setSaving(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[61] w-[400px] max-w-[calc(100vw-2rem)] bg-card border-l border-border shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
          <p className="text-[14px] font-bold text-foreground">{t("settings.editCatalogRow")}</p>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted outline-none"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
          <div><FieldLabel>{t("settings.itemName")}</FieldLabel><input value={item} onChange={(e) => setItem(e.target.value)} className={INPUT_CLASS} /></div>
          <div><FieldLabel>{t("settings.variant")}</FieldLabel><input value={variant} onChange={(e) => setVariant(e.target.value)} className={INPUT_CLASS} /></div>
          <div><FieldLabel>{t("components.location")}</FieldLabel><input value={location} onChange={(e) => setLocation(e.target.value)} className={INPUT_CLASS} /></div>
          <div><FieldLabel>{t("settings.priceRp")}</FieldLabel><input value={price} inputMode="numeric" onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 420000000" className={INPUT_CLASS} /></div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <FieldLabel>{t("settings.attributes")}</FieldLabel>
              <button onClick={() => setAttrs((a) => [...a, { k: "", v: "" }])} className="text-[12px] font-semibold text-primary hover:underline outline-none">{t("settings.add")}</button>
            </div>
            <div className="space-y-2">
              {attrs.length === 0 && <p className="text-[12px] text-muted-foreground">{t("settings.noAttributesEGDp")}</p>}
              {attrs.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={a.k} onChange={(e) => setAttr(i, { k: e.target.value })} placeholder="key" className={cn(INPUT_CLASS, "flex-1")} />
                  <input value={a.v} onChange={(e) => setAttr(i, { v: e.target.value })} placeholder="value" className={cn(INPUT_CLASS, "flex-1")} />
                  <button onClick={() => setAttrs((arr) => arr.filter((_, j) => j !== i))} className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 outline-none shrink-0"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-5 h-16 border-t border-border shrink-0">
          <button onClick={remove} disabled={saving} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[13px] font-semibold text-red-500 hover:bg-red-50 outline-none disabled:opacity-50"><Trash2 className="w-4 h-4" />{t("common.delete")}</button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="h-9 px-3.5 rounded-md border border-border text-[13px] font-medium hover:bg-muted outline-none">{t("common.cancel")}</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark disabled:opacity-50 outline-none">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t("common.save")}</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ArrayBuffer -> base64, chunked to avoid call-stack limits on large PDFs.
function fileToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Minimal CSV -> rows (handles quoted fields, escaped quotes, CRLF).
function csvToRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* skip */ }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// Map a header+rows grid to catalog rows: known headers -> spine, the rest ->
// attributes. Shared by CSV and Excel (both feed a string[][] with a header row).
function parseCatalogRows(grid: (string | number | null | undefined)[][]): CatalogRowInput[] {
  const raw = grid.filter((r) => r.some((c) => c != null && String(c).trim()));
  if (raw.length < 2) return [];
  const header = raw[0].map((h) => String(h ?? "").trim().toLowerCase());
  const idx = (names: string[]) => { for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; } return -1; };
  const iItem = idx(["item_name", "name", "product", "product_name"]);
  const iBrand = idx(["brand_name", "brand", "merk"]);
  const iModel = idx(["model_name", "model", "type", "tipe"]);
  const iVariant = idx(["variant_name", "variant", "varian", "trim"]);
  const iLoc = idx(["location_name", "city_name", "city", "kota", "location", "area"]);
  const iCat = idx(["category_type", "category", "kategori"]);
  const iPrice = idx(["headline_price", "otr_price", "price", "harga", "list_price"]);
  const known = new Set([iItem, iBrand, iModel, iVariant, iLoc, iCat, iPrice].filter((i) => i >= 0));
  const out: CatalogRowInput[] = [];
  for (let r = 1; r < raw.length; r++) {
    const cells = raw[r];
    const get = (i: number) => (i >= 0 ? String(cells[i] ?? "").trim() : "");
    let item = get(iItem);
    if (!item) item = [get(iBrand), get(iModel)].filter(Boolean).join(" ");
    if (!item) continue;
    const priceDigits = get(iPrice).replace(/\D/g, "");
    const attributes: Record<string, unknown> = {};
    header.forEach((h, i) => { if (h && !known.has(i)) { const v = get(i); if (v) attributes[h] = v; } });
    out.push({
      item_name: item,
      variant_name: get(iVariant) || undefined,
      location_name: get(iLoc) || undefined,
      category_type: get(iCat) || undefined,
      headline_price: priceDigits ? Number(priceDigits) : null,
      attributes,
    });
  }
  return out;
}

function parseCatalogCsv(text: string): CatalogRowInput[] { return parseCatalogRows(csvToRows(text)); }

// ── Ads ─────────────────────────────────────────────────────────────────────
// Delivery for this campaign plus the controls that act on it. Everything here
// is driven by ads-status rather than guessed client-side: whether an ad account
// is connected, what the client agreed to (read vs manage), and whether anything
// is actually linked. Offering a Pause button the API is going to refuse is worse
// than not offering one.
function AdsTab({ id, notify }: { id: string; notify: (m: string, s?: "success" | "error") => void }) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.campaignAdsStatus>> | null>(null);
  const [live, setLive] = useState<Awaited<ReturnType<typeof api.campaignAdsLive>> | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [rows, setRows] = useState<AdsMetricRow[] | null>(null);
  const [alerts, setAlerts] = useState<AdsAlertRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"performance" | "setup">("performance");
  // Modal preview iklan: pakai render resmi Meta (iframe), bukan thumbnail.
  const [adPreview, setAdPreview] = useState<{ adId: string; html?: string } | null>(null);
  const { confirm, ConfirmHost } = useConfirm();

  async function openAdPreview(adId: string) {
    setAdPreview({ adId });
    try { const r = await api.adPreviewHTML(id, adId); setAdPreview({ adId, html: r.html }); }
    catch (e) { notify(String(e), "error"); setAdPreview(null); }
  }

  function load() {
    setLoadErr(null);
    api.campaignAdsStatus(id).then((st) => {
      setStatus(st);
      // Land on setup when there is nothing to report yet, on performance once live.
      if (st && st.linked_ad_count === 0 && st.ads_status !== "active") setView("setup");
    }).catch((e) => { setStatus(null); setLoadErr(String(e)); });
    // Live per-ad state from Meta: drives the single pause/resume toggle and the
    // creative previews. Failure keeps it null and the UI falls back gracefully.
    api.campaignAdsLive(id).then(setLive).catch(() => setLive(null));
    api.campaignAdsMetrics(id).then((r) => setRows(r.rows)).catch(() => setRows([]));
    api.campaignAdsAlerts(id).then(setAlerts).catch(() => setAlerts([]));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function control(action: "pause" | "resume") {
    const pausing = action === "pause";
    if (!(await confirm({
      title: pausing ? "Pause ads?" : "Resume ads?",
      message: pausing
        ? "Delivery stops immediately in Meta and this campaign stops spending."
        : "Delivery restarts in Meta and this campaign starts spending again.",
      danger: pausing,
      confirmLabel: pausing ? "Pause" : "Resume",
    }))) return;
    setBusy(true);
    try {
      const r = pausing ? await api.pauseCampaignAds(id) : await api.resumeCampaignAds(id);
      // Report the partial case honestly: with several linked ad campaigns some
      // can fail while others succeed, and "done" would be a lie.
      notify(r.failed?.length
        ? `${r.applied}/${r.total} applied — ${r.failed.join("; ")}`
        : `Ads ${r.status}`, r.failed?.length ? "error" : "success");
      load();
    } catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }

  // An eternal spinner on failure is indistinguishable from loading, and that is
  // exactly how this surfaced: an expired session 401'd and the page just spun.
  if (loadErr) {
    return (
      <div className="rounded-lg border border-border p-6 text-center">
        <p className="text-[13px] text-foreground mb-1 font-semibold">Could not load ads status</p>
        <p className="text-[12.5px] text-muted-foreground mb-3 break-all">{loadErr}</p>
        <button onClick={load} className="px-3 h-8 rounded-md border border-border text-[12.5px] font-semibold hover:bg-muted outline-none">Retry</button>
      </div>
    );
  }
  if (!status) return <div className="h-40 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  if (!status.managed) {
    return <AdsAccountPicker id={id} notify={notify} onAttached={load} />;
  }

  const tot = (rows || []).reduce((a, r) => ({
    spend: a.spend + r.spend, leads: a.leads + r.leads,
    clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions,
  }), { spend: 0, leads: 0, clicks: 0, impressions: 0 });
  const cpl = tot.leads > 0 ? tot.spend / tot.leads : 0;
  const ctr = tot.impressions > 0 ? (tot.clicks / tot.impressions) * 100 : 0;
  const money = (v: number) => "Rp " + Math.round(v).toLocaleString("id-ID");

  return (
    <div className="flex flex-col gap-4">
      {ConfirmHost}

      {/* Dua sisi tab Ads: Performance (laporan + kontrol iklan yang jalan) dan
          Launch ads (workspace bikin campaign baru di Meta). Tanpa toggle ini
          LaunchAdsPanel tidak tercapai dari UI sama sekali. */}
      <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 w-fit">
        {([["performance", "Performance"], ["setup", "Launch ads"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={cn("px-3 h-7 rounded-md text-[12.5px] font-semibold outline-none transition-colors",
              view === v ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {view === "setup" ? <LaunchAdsPanel id={id} notify={notify} /> : (<>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[13px] text-muted-foreground">
          {status.account_name} &middot; {status.linked_ad_count} linked ad campaign{status.linked_ad_count === 1 ? "" : "s"}
        </span>
        {/* One truth for the current state, straight from Meta. */}
        {live?.status && (
          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase",
            live.status === "active" ? "bg-emerald-500/10 text-emerald-600"
              : live.status === "pending_review" ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600")}>
            {live.status === "pending_review" ? "In review" : live.status}
          </span>
        )}
        <div className="flex-1" />
        {status.can_control ? (
          // ONE toggle that mirrors the live state, not two permanent buttons the
          // user has to disambiguate. Unknown state (Meta unreachable, nothing
          // delivering yet) falls back to showing both, because guessing wrong
          // on a spend control is worse than asking.
          live?.status === "active" ? (
            <button disabled={busy} onClick={() => control("pause")}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold hover:bg-muted outline-none disabled:opacity-50">
              <Pause className="w-3.5 h-3.5" />Pause ads
            </button>
          ) : live?.status === "paused" || live?.status === "pending_review" ? (
            <button disabled={busy} onClick={() => control("resume")}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark outline-none disabled:opacity-50">
              <Play className="w-3.5 h-3.5" />Resume
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button disabled={busy} onClick={() => control("pause")}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold hover:bg-muted outline-none disabled:opacity-50">
                <Pause className="w-3.5 h-3.5" />Pause ads
              </button>
              <button disabled={busy} onClick={() => control("resume")}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark outline-none disabled:opacity-50">
                <Play className="w-3.5 h-3.5" />Resume
              </button>
            </div>
          )
        ) : (
          // Say WHY rather than hiding the controls with no explanation.
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <AlertTriangle className="w-3.5 h-3.5" />
            {status.access_mode !== "manage"
              ? "This ad account is connected for reporting only"
              : "No Meta campaign linked yet"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Spend (30d)", value: money(tot.spend) },
          { label: "Leads", value: String(tot.leads) },
          { label: "Cost per lead", value: tot.leads ? money(cpl) : "-" },
          { label: "CTR", value: ctr ? ctr.toFixed(2) + "%" : "-" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border p-3">
            <p className="text-[11.5px] text-muted-foreground mb-0.5">{c.label}</p>
            <p className="text-[18px] font-bold tabular-nums text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

      {/* The creatives as they run on Meta right now: thumbnail + per-ad state.
          Sebelum ini user cuma lihat angka agregat tanpa pernah lihat iklannya. */}
      {live && live.ads.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-[12.5px] font-semibold text-foreground mb-2">
            Ads &amp; creatives <span className="font-normal text-muted-foreground">— live from Meta</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {live.ads.map((ad) => (
              <button key={ad.id} onClick={() => openAdPreview(ad.id)}
                className="rounded-lg border border-border overflow-hidden text-left hover:border-primary/50 hover:shadow-sm transition-all outline-none group">
                <div className="aspect-square bg-muted/40 relative">
                  {(ad.image || ad.thumbnail)
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={ad.image || ad.thumbnail} alt={ad.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full grid place-items-center text-[11px] text-muted-foreground">no preview</div>}
                  <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/30 transition-colors">
                    <span className="opacity-0 group-hover:opacity-100 text-white text-[11px] font-semibold px-2 py-1 rounded bg-black/50 transition-opacity">Preview</span>
                  </span>
                </div>
                <div className="p-1.5">
                  <p className="text-[11.5px] font-medium text-foreground truncate" title={ad.name}>{ad.name}</p>
                  <span className={cn("inline-flex mt-0.5 px-1.5 py-px rounded text-[9.5px] font-bold uppercase",
                    ad.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-600"
                      : ad.status === "PENDING_REVIEW" || ad.status === "IN_PROCESS" ? "bg-blue-500/10 text-blue-600"
                        : "bg-amber-500/10 text-amber-600")}>
                    {ad.status.toLowerCase().replaceAll("_", " ")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-[12.5px] font-semibold text-foreground mb-2">Daily spend</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={rows} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              {/* Rows arrive as full ISO timestamps; slice(5) showed the raw
                  "06-30T00:00:00Z". Human date only: "30/06". */}
              <XAxis dataKey="date" tick={{ fontSize: 10 }}
                tickFormatter={(d: string) => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`} />
              <YAxis tick={{ fontSize: 10 }} />
              <RTooltip formatter={(v) => money(Number(v))}
                labelFormatter={(d) => String(d).slice(0, 10)} />
              <Bar dataKey="spend" fill="#0E5B54" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="rounded-lg border border-border">
        <p className="text-[12.5px] font-semibold text-foreground px-3 py-2 border-b border-border">Alert history</p>
        {alerts.length === 0 ? (
          <p className="text-[13px] text-muted-foreground text-center py-6">
            No alerts yet. The monitor sweeps every few hours and records anything it finds here.
          </p>
        ) : (
          <div className="divide-y divide-border/60 max-h-[320px] overflow-auto">
            {alerts.map((al) => (
              <div key={al.id} className="flex items-start gap-2.5 px-3 py-2.5">
                <span className="text-[15px] leading-none mt-0.5">
                  {al.action_taken === "flagged" || al.action_taken === "none" ? "\u{1F7E1}" : "\u{1F534}"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-foreground">{al.detail || al.alert_type}</p>
                  <p className="text-[11.5px] text-muted-foreground">{fmtDateTimeShort(al.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview iklan: render resmi Meta (iframe), sama seperti Ads Manager. */}
      {adPreview && (
        <div className="fixed inset-0 z-[80] bg-black/50 grid place-items-center p-4" onClick={() => setAdPreview(null)}>
          <div className="bg-card rounded-xl border border-border p-3 max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12.5px] font-semibold text-foreground">Ad preview</p>
              <button onClick={() => setAdPreview(null)} className="p-1 rounded-md hover:bg-muted outline-none"><X className="w-4 h-4" /></button>
            </div>
            {adPreview.html
              ? <div dangerouslySetInnerHTML={{ __html: adPreview.html }} />
              : <div className="w-[340px] h-[420px] grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

// Empty state tab Ads yang bisa langsung beres: kalau org sudah punya ad account
// yang connect, pilih di sini — tanpa ini satu-satunya jalan adalah dialog
// mapping, yang buntu untuk campaign baru (belum ada apa pun untuk di-map).
// Akun juga bisa dipilih sejak wizard New Campaign.
function AdsAccountPicker({ id, notify, onAttached }: {
  id: string; notify: (m: string, s?: "success" | "error") => void; onAttached: () => void;
}) {
  const [accounts, setAccounts] = useState<import("@/lib/types").AdAccount[] | null>(null);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.listAdAccounts().then(setAccounts).catch(() => setAccounts([])); }, []);

  async function attach() {
    setBusy(true);
    try { await api.setCampaignAdAccount(id, picked); notify("Ad account attached"); onAttached(); }
    catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <Megaphone className="w-9 h-9 text-muted-foreground/30 mx-auto mb-3" />
      <p className="font-semibold text-foreground mb-1">No ad account for this campaign</p>
      {accounts === null ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto mt-2" />
      ) : accounts.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Connect one in Settings &rarr; Channel &amp; Integrations &rarr; Advertising first.
        </p>
      ) : (
        <div className="max-w-xs mx-auto mt-3 flex flex-col gap-2">
          <Select value={picked} onChange={setPicked} placeholder="Pick a connected ad account"
            options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.platform})` }))} />
          <button onClick={attach} disabled={!picked || busy}
            className="inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark outline-none disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Use this account
          </button>
        </div>
      )}
    </div>
  );
}
