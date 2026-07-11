"use client";
// Campaign detail = SETUP only (Credits, AI Assistant, Catalog). All reporting
// lives on the Dashboard, so this page has no report/PDF anymore.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Coins, Sparkles, Database, Upload, Trash2, X } from "lucide-react";
import * as XLSX from "xlsx";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import { cn } from "@/lib/utils";
import type { CampaignDetail, CatalogItem, Template } from "@/lib/types";
import { useToast, PageBody, FieldLabel, INPUT_CLASS } from "../../_shared";
import { useConfirm } from "@/components/ConfirmDialog";
import UnsavedBar from "@/components/UnsavedBar";

const SEGMENTS = ["Automotive", "Property / Real Estate", "Finance", "Insurance", "Retail / FMCG", "Education", "Healthcare", "Travel & Hospitality", "Food & Beverage", "Services", "Other"];
type Tab = "credits" | "ai" | "catalog";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notify, ToastHost } = useToast();
  // Persist the active tab in the URL so a refresh keeps you on the same page.
  const TAB_KEYS: Tab[] = ["credits", "ai", "catalog"];
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
  ];

  return (
    <PageBody wide>
      {ToastHost}
      <div className="max-w-[1040px]">
        <button onClick={() => router.push("/settings/campaigns")} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground mb-3 outline-none">
          <ArrowLeft className="w-4 h-4" /> Campaigns
        </button>
        {loading ? (
          <div className="grid place-items-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !campaign ? (
          <p className="text-muted-foreground">Campaign not found.</p>
        ) : (
          <div className="bg-card border border-border rounded-xl shadow-xs p-6 sm:p-8">
            <h1 className="text-xl font-bold text-foreground">{campaign.name}</h1>
            {campaign.dealer_name && <p className="text-[13px] text-muted-foreground">{campaign.dealer_name}</p>}
            <div className="flex gap-1 mt-5 border-b border-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={cn("inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors outline-none shrink-0 whitespace-nowrap",
                    tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  <t.Icon className="w-4 h-4 shrink-0" /> {t.label}
                </button>
              ))}
            </div>
            <div className="mt-6">
              {tab === "credits" && <CreditsTab id={id} notify={notify} />}
              {tab === "ai" && <AITab campaign={campaign} onSaved={(c) => { setCampaign(c); notify("AI settings saved"); }} onError={(m) => notify(m, "error")} />}
              {tab === "catalog" && <CatalogTab id={id} segment={campaign.segment ?? undefined} notify={notify} />}
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
  const [credits, setCredits] = useState<{ allocated_credits: number; used_credits: number; remaining_credits: number; low_balance_threshold: number } | null>(null);
  const [usage, setUsage] = useState<{ day: string; credits: number }[]>([]);
  const [alloc, setAlloc] = useState("");
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);
  function load() {
    api.getCampaignCredits(id).then((c) => { setCredits(c); setAlloc(String(c.allocated_credits)); setThreshold(String(c.low_balance_threshold)); }).catch(() => {});
    api.getCampaignUsage(id).then(setUsage).catch(() => {});
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setSaving(true);
    try {
      await api.allocateCampaignCredits(id, { allocated_credits: Number(alloc) || 0, low_balance_threshold: Number(threshold) || 0 });
      notify("Credits updated"); load();
    } catch (e) { notify(String(e), "error"); } finally { setSaving(false); }
  }
  if (!credits) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  const allocChangedCount = (Number(alloc) !== credits.allocated_credits ? 1 : 0) + (Number(threshold) !== credits.low_balance_threshold ? 1 : 0);
  const resetAlloc = () => { setAlloc(String(credits.allocated_credits)); setThreshold(String(credits.low_balance_threshold)); };
  const low = credits.allocated_credits > 0 && credits.remaining_credits <= credits.low_balance_threshold;
  const maxUsage = Math.max(1, ...usage.map((u) => u.credits));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Allocated" value={credits.allocated_credits} />
        <Stat label="Used" value={credits.used_credits} />
        <Stat label="Remaining" value={credits.remaining_credits} accent={low ? "text-amber-600" : undefined} />
      </div>
      {low && <p className="text-[13px] text-amber-600 font-medium">Low balance. Top up before the AI stands down on this campaign.</p>}
      {credits.allocated_credits === 0 && <p className="text-[13px] text-muted-foreground">No allocation set: AI replies aren&apos;t capped. Set a cap below to meter this campaign.</p>}

      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-[13px] font-semibold text-foreground">Allocation</p>
        <div className="grid grid-cols-2 gap-3">
          <div><FieldLabel>Allocated credits</FieldLabel><input type="number" min={0} value={alloc} onChange={(e) => setAlloc(e.target.value)} className={INPUT_CLASS} /></div>
          <div><FieldLabel>Low-balance alert at</FieldLabel><input type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} className={INPUT_CLASS} /></div>
        </div>
      </div>
      <UnsavedBar count={allocChangedCount} saving={saving} onSave={save} onCancel={resetAlloc} saveLabel="Save allocation" />

      <div className="rounded-lg border border-border p-4">
        <p className="text-[13px] font-semibold text-foreground mb-3">Usage (last 30 days)</p>
        {usage.length === 0 ? <p className="text-[13px] text-muted-foreground">No AI replies yet.</p> : (
          <div className="flex items-end gap-1 h-24">
            {usage.map((u) => (
              <div key={u.day} className="flex-1 min-w-[3px] rounded-t bg-primary/70" style={{ height: `${Math.max(4, (u.credits / maxUsage) * 100)}%` }} title={`${u.day}: ${u.credits}`} />
            ))}
          </div>
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

function AITab({ campaign, onSaved, onError }: { campaign: CampaignDetail; onSaved: (c: CampaignDetail) => void; onError: (m: string) => void }) {
  const init = {
    segment: campaign.segment ?? "", brand: campaign.brand ?? "",
    autoReply: campaign.ai_auto_reply ?? false, lang: campaign.ai_language ?? "id",
    dynLang: campaign.ai_dynamic_language ?? true, smartSummary: campaign.ai_smart_summary ?? true,
    followupTpl: campaign.followup_template_id ?? "",
  };
  const [segment, setSegment] = useState(init.segment);
  const [brand, setBrand] = useState(init.brand);
  const [autoReply, setAutoReply] = useState(init.autoReply);
  const [lang, setLang] = useState(init.lang);
  const [dynLang, setDynLang] = useState(init.dynLang);
  const [smartSummary, setSmartSummary] = useState(init.smartSummary);
  const [followupTpl, setFollowupTpl] = useState(init.followupTpl);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);

  // Only APPROVED templates can be sent outside the 24h window.
  useEffect(() => {
    api.listTemplates({ campaign_id: campaign.id })
      .then((t) => setTemplates((t || []).filter((x) => x.status === "APPROVED")))
      .catch(() => setTemplates([]));
  }, [campaign.id]);

  const changedCount = [segment !== init.segment, brand.trim() !== init.brand, autoReply !== init.autoReply, lang !== init.lang, dynLang !== init.dynLang, smartSummary !== init.smartSummary, followupTpl !== init.followupTpl].filter(Boolean).length;
  function reset() { setSegment(init.segment); setBrand(init.brand); setAutoReply(init.autoReply); setLang(init.lang); setDynLang(init.dynLang); setSmartSummary(init.smartSummary); setFollowupTpl(init.followupTpl); }

  async function save() {
    setSaving(true);
    try {
      const patch = { segment, brand: brand.trim(), ai_auto_reply: autoReply, ai_language: lang, ai_dynamic_language: dynLang, ai_smart_summary: smartSummary, followup_template_id: followupTpl || "none" };
      await api.updateCampaign(campaign.id, patch);
      onSaved({ ...campaign, segment, brand: brand.trim(), ai_auto_reply: autoReply, ai_language: lang, ai_dynamic_language: dynLang, ai_smart_summary: smartSummary, followup_template_id: followupTpl || null });
    } catch (e) { onError(String(e)); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-4 max-w-[560px]">
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <p className="text-[13.5px] font-semibold text-foreground">Auto-reply</p>
        <Toggle on={autoReply} onToggle={() => setAutoReply((v) => !v)} />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <p className="text-[13.5px] font-semibold text-foreground">Smart Summary</p>
        <Toggle on={smartSummary} onToggle={() => setSmartSummary((v) => !v)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel>Segment</FieldLabel>
          <Select value={segment} onChange={setSegment} placeholder="Not set" searchable
            options={[{ value: "", label: "Not set" }, ...SEGMENTS.map((s) => ({ value: s, label: s }))]} /></div>
        <div><FieldLabel>Brand</FieldLabel><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Mitsubishi XFORCE" className={INPUT_CLASS} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><FieldLabel>Reply language</FieldLabel>
          <Select value={lang} onChange={setLang} searchable={false} options={[{ value: "id", label: "Indonesian" }, { value: "en", label: "English" }]} /></div>
        <div className="flex items-end">
          <div className="flex items-center justify-between gap-3 w-full rounded-lg border border-border p-3">
            <p className="text-[13px] font-medium text-foreground">Match contact&apos;s language</p>
            <Toggle on={dynLang} onToggle={() => setDynLang((v) => !v)} />
          </div>
        </div>
      </div>
      <div>
        <FieldLabel hint="Auto follow-up nudges a silent lead at 12h and 20h with free-form AI messages (inside WhatsApp's 24h window). Later touches at day 1, 3 and 7 fall outside the window, so they need an approved template. No template = those later touches are skipped; the lead is still auto-closed to Lost if there's no reply.">Follow-up template</FieldLabel>
        <Select value={followupTpl} onChange={setFollowupTpl}
          options={[{ value: "", label: "None (skip out-of-window follow-ups)" }, ...templates.map((t) => ({ value: t.id, label: `${t.name} (${t.language})` }))]} />
        {templates.length === 0 && (
          <p className="text-[11.5px] text-muted-foreground mt-1">No approved templates yet. Create one and get it approved under Templates to enable day 1/3/7 follow-ups.</p>
        )}
      </div>
      <UnsavedBar count={changedCount} saving={saving} onSave={save} onCancel={reset} saveLabel="Save AI settings" />
    </div>
  );
}

// ── Catalog & Pricing (WS-A) ────────────────────────────────────────────────
// Per-campaign pricelist the Simpuler bot grounds pricing answers on. Upload a
// CSV; recognized columns map to the spine (item/variant/location/price), the
// rest land in each row's attributes. A new upload replaces the campaign's rows.
type CatalogRowInput = { item_name: string; variant_name?: string; location_name?: string; category_type?: string; headline_price?: number | null; attributes?: Record<string, unknown> };

function CatalogTab({ id, segment, notify }: { id: string; segment?: string; notify: (m: string, s?: "success" | "error") => void }) {
  const [rows, setRows] = useState<CatalogItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null); // row open in the edit drawer
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
        const res = await api.extractCatalogPdf(id, { pdf_base64: b64, segment }, (info) => {
          if (info.rows && info.rows > 0) step(`Simpuler extracted ${info.rows} item${info.rows === 1 ? "" : "s"} so far...`);
        });
        if (res.error) { notify(`Extraction failed: ${res.error}`, "error"); return; }
        if (res.warning === "scanned") { notify("This looks like a scanned PDF (no readable text). Use a text PDF, or upload a CSV/Excel.", "error"); return; }
        if (res.warning === "no_llm") { notify("PDF extraction is not enabled on the server. Upload a CSV or Excel file instead.", "error"); return; }
        if (res.warning === "parse_failed") { notify("Could not read this PDF automatically. Try a cleaner text PDF, or upload a CSV/Excel.", "error"); return; }
        parsed = res.rows || [];
        if (parsed.length === 0) { notify("No pricing rows were found in this PDF. Try a CSV/Excel export instead.", "error"); return; }
      } else if (isExcel) {
        step("Reading your Excel file...");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        parsed = parseCatalogRows(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as (string | number | null)[][]);
      } else {
        step("Reading your CSV file...");
        parsed = parseCatalogCsv(await file.text());
      }
      if (parsed.length === 0) { notify("No rows found. Make sure the first row is a header (e.g. item_name, price).", "error"); return; }
      step(`Found ${parsed.length} item${parsed.length === 1 ? "" : "s"}. Saving to the catalog...`);
      const month = new Date().toISOString().slice(0, 7);
      const res = await api.uploadCampaignCatalog(id, { replace: true, segment, source_ref: file.name, effective_month: month, rows: parsed });
      notify(`Imported ${res.inserted} item${res.inserted === 1 ? "" : "s"}${isPdf ? " from PDF" : ""}`);
      load();
    } catch (err) { notify(String(err), "error"); } finally { setBusy(false); setProgress(null); }
  }

  async function clearAll() {
    if (!(await confirm({ title: "Clear catalog?", message: "Remove all catalog rows for this campaign? The bot will fall back to the shared pricing table.", danger: true, confirmLabel: "Clear" }))) return;
    setBusy(true);
    try { await api.clearCampaignCatalog(id); notify("Catalog cleared"); load(); }
    catch (e) { notify(String(e), "error"); } finally { setBusy(false); }
  }

  if (rows === null) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  const fmtPrice = (v: number | null) => v == null ? "" : "Rp " + Math.round(v).toLocaleString("id-ID");

  return (
    <div className="space-y-5">
      {ConfirmHost}
      {progress && (
        <div className="fixed bottom-6 right-6 z-[70] w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-2xl p-4 animate-slide-in-right">
          <div className="flex items-start gap-3">
            <Loader2 className="w-5 h-5 mt-0.5 shrink-0 animate-spin text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground leading-snug">{progress.phase}</p>
              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">{elapsed}s elapsed</p>
              <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full w-1/3 rounded-full bg-primary animate-indeterminate" />
              </div>
            </div>
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".csv,text/csv,.pdf,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFile} />
      {/* Upload dropzone only shows for an empty catalog; once populated it's replaced by a compact Replace/Clear header. */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-5 text-center">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto mb-3"><Upload className="w-5 h-5" /></div>
          <p className="text-[13.5px] font-semibold text-foreground mb-3">Upload a pricelist (CSV, Excel, or PDF)</p>
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="inline-flex items-center gap-2 px-3.5 h-9 mt-3 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Choose file
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-[13px] text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{rows.length}</span> item{rows.length === 1 ? "" : "s"} in this campaign&apos;s catalog. Click a row to edit.</p>
          <div className="flex items-center gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-[12.5px] font-semibold text-foreground hover:bg-muted outline-none disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Replace pricelist
            </button>
            <button onClick={clearAll} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[12.5px] font-semibold text-red-500 hover:bg-red-50 outline-none disabled:opacity-50">
              <Trash2 className="w-4 h-4" />Clear all
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm min-w-[640px] whitespace-nowrap">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="border-b border-border">
                  {["Item", "Variant", "Location", "Price", "Attributes"].map((h) => (
                    <th key={h} className={cn("px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", h === "Price" ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r) => (
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
          {rows.length > 200 && <p className="px-3 py-2 text-[11.5px] text-muted-foreground border-t border-border">Showing first 200 of {rows.length}.</p>}
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
    if (!item.trim()) { notify("Item name is required", "error"); return; }
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
      notify("Row updated"); onSaved();
    } catch (e) { notify(String(e), "error"); } finally { setSaving(false); }
  }
  async function remove() {
    setSaving(true);
    try { await api.deleteCatalogRow(campaignId, row.id); notify("Row deleted"); onSaved(); }
    catch (e) { notify(String(e), "error"); setSaving(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[61] w-[400px] max-w-[calc(100vw-2rem)] bg-card border-l border-border shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
          <p className="text-[14px] font-bold text-foreground">Edit catalog row</p>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted outline-none"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
          <div><FieldLabel>Item name</FieldLabel><input value={item} onChange={(e) => setItem(e.target.value)} className={INPUT_CLASS} /></div>
          <div><FieldLabel>Variant</FieldLabel><input value={variant} onChange={(e) => setVariant(e.target.value)} className={INPUT_CLASS} /></div>
          <div><FieldLabel>Location</FieldLabel><input value={location} onChange={(e) => setLocation(e.target.value)} className={INPUT_CLASS} /></div>
          <div><FieldLabel>Price (Rp)</FieldLabel><input value={price} inputMode="numeric" onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 420000000" className={INPUT_CLASS} /></div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <FieldLabel>Attributes</FieldLabel>
              <button onClick={() => setAttrs((a) => [...a, { k: "", v: "" }])} className="text-[12px] font-semibold text-primary hover:underline outline-none">+ Add</button>
            </div>
            <div className="space-y-2">
              {attrs.length === 0 && <p className="text-[12px] text-muted-foreground">No attributes (e.g. dp, tenor, emi).</p>}
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
          <button onClick={remove} disabled={saving} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[13px] font-semibold text-red-500 hover:bg-red-50 outline-none disabled:opacity-50"><Trash2 className="w-4 h-4" />Delete</button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="h-9 px-3.5 rounded-md border border-border text-[13px] font-medium hover:bg-muted outline-none">Cancel</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark disabled:opacity-50 outline-none">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Save</button>
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
