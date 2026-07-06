"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Coins, Sparkles, BarChart3, Database, Upload, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import { cn, fmtDuration } from "@/lib/utils";
import type { CampaignDetail, CampaignAnalyticsRow, CatalogItem } from "@/lib/types";
import { useToast, PageBody, FieldLabel, INPUT_CLASS, PrimaryButton } from "../../_shared";

const SEGMENTS = ["Automotive", "Property / Real Estate", "Finance", "Insurance", "Retail / FMCG", "Education", "Healthcare", "Travel & Hospitality", "Food & Beverage", "Services", "Other"];
type Tab = "overview" | "credits" | "ai" | "catalog";

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { notify, ToastHost } = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCampaign(id).then(setCampaign).catch((e) => notify(String(e), "error")).finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { key: Tab; label: string; Icon: typeof Coins }[] = [
    { key: "overview", label: "Overview", Icon: BarChart3 },
    { key: "credits", label: "Credits & Usage", Icon: Coins },
    { key: "ai", label: "AI Assistant", Icon: Sparkles },
    { key: "catalog", label: "Catalog & Pricing", Icon: Database },
  ];

  return (
    <PageBody>
      {ToastHost}
      <div className="max-w-[900px] mx-auto w-full px-6 py-6">
        <button onClick={() => router.push("/settings/campaigns")} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground mb-3 outline-none">
          <ArrowLeft className="w-4 h-4" /> Campaigns
        </button>
        {loading ? (
          <div className="grid place-items-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : !campaign ? (
          <p className="text-muted-foreground">Campaign not found.</p>
        ) : (
          <>
            <h1 className="text-xl font-bold text-foreground">{campaign.name}</h1>
            {campaign.dealer_name && <p className="text-[13px] text-muted-foreground">{campaign.dealer_name}</p>}
            <div className="flex gap-1 mt-5 border-b border-border">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={cn("inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors outline-none",
                    tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  <t.Icon className="w-4 h-4" /> {t.label}
                </button>
              ))}
            </div>
            <div className="mt-5">
              {tab === "overview" && <OverviewTab id={id} />}
              {tab === "credits" && <CreditsTab id={id} notify={notify} />}
              {tab === "ai" && <AITab campaign={campaign} onSaved={(c) => { setCampaign(c); notify("AI settings saved"); }} onError={(m) => notify(m, "error")} />}
              {tab === "catalog" && <CatalogTab id={id} segment={campaign.segment ?? undefined} notify={notify} />}
            </div>
          </>
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

function OverviewTab({ id }: { id: string }) {
  const [row, setRow] = useState<CampaignAnalyticsRow | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.getCampaignAnalytics().then((rows) => setRow(rows.find((r) => r.id === id) ?? null)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);
  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  if (!row) return <p className="text-[13px] text-muted-foreground">No data yet for this campaign.</p>;
  const stats = [
    { label: "Leads", value: row.leads },
    { label: "Replied", value: row.replied },
    { label: "Avg 1st response", value: row.avg_rt_min > 0 ? fmtDuration(row.avg_rt_min) : "-" },
    { label: "Within 5 min", value: `${Math.round(row.within_5_pct)}%` },
    { label: "Call attempts", value: row.call_attempts },
    { label: "Qualified", value: row.qualified },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} />)}
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
        <PrimaryButton onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Save allocation</PrimaryButton>
        <p className="text-[11.5px] text-muted-foreground">1 credit = 1 Simpuler (AI) reply. Broadcasts and agent messages are not counted.</p>
      </div>

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
  const [segment, setSegment] = useState(campaign.segment ?? "");
  const [brand, setBrand] = useState(campaign.brand ?? "");
  const [autoReply, setAutoReply] = useState(campaign.ai_auto_reply ?? false);
  const [lang, setLang] = useState(campaign.ai_language ?? "id");
  const [dynLang, setDynLang] = useState(campaign.ai_dynamic_language ?? true);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.updateCampaign(campaign.id, { segment, brand: brand.trim(), ai_auto_reply: autoReply, ai_language: lang, ai_dynamic_language: dynLang });
      onSaved({ ...campaign, segment, brand: brand.trim(), ai_auto_reply: autoReply, ai_language: lang, ai_dynamic_language: dynLang });
    } catch (e) { onError(String(e)); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-4 max-w-[560px]">
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <p className="text-[13.5px] font-semibold text-foreground">Auto-reply</p>
          <p className="text-[12px] text-muted-foreground">When on, the AI replies automatically and hands off to an agent once details are collected.</p>
        </div>
        <Toggle on={autoReply} onToggle={() => setAutoReply((v) => !v)} />
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
      <PrimaryButton onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Save AI settings</PrimaryButton>
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
  const fileRef = useRef<HTMLInputElement>(null);

  function load() { api.getCampaignCatalog(id).then(setRows).catch(() => setRows([])); }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const lower = file.name.toLowerCase();
      const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");
      const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls") || file.type.includes("spreadsheet") || file.type.includes("excel");
      let parsed: CatalogRowInput[];
      if (isPdf) {
        notify("Extracting from PDF, this can take up to a minute...", "success");
        const res = await api.extractCatalogPdf(id, { pdf_base64: fileToBase64(await file.arrayBuffer()), segment });
        if (res.error) { notify(`Extraction failed: ${res.error}`, "error"); return; }
        if (res.warning === "scanned") { notify("This looks like a scanned PDF (no readable text). Use a text PDF or a CSV.", "error"); return; }
        parsed = res.rows || [];
      } else if (isExcel) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        parsed = parseCatalogRows(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as (string | number | null)[][]);
      } else {
        parsed = parseCatalogCsv(await file.text());
      }
      if (parsed.length === 0) { notify("No rows found in the file.", "error"); return; }
      const month = new Date().toISOString().slice(0, 7);
      const res = await api.uploadCampaignCatalog(id, { replace: true, segment, source_ref: file.name, effective_month: month, rows: parsed });
      notify(`Imported ${res.inserted} item${res.inserted === 1 ? "" : "s"}${isPdf ? " from PDF" : ""}`);
      load();
    } catch (err) { notify(String(err), "error"); } finally { setBusy(false); }
  }

  async function clearAll() {
    if (!confirm("Remove all catalog rows for this campaign? The bot will fall back to the shared pricing table.")) return;
    setBusy(true);
    try { await api.clearCampaignCatalog(id); notify("Catalog cleared"); load(); }
    catch (e) { notify(String(e), "error"); } finally { setBusy(false); }
  }

  if (rows === null) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  const fmtPrice = (v: number | null) => v == null ? "" : "Rp " + Math.round(v).toLocaleString("id-ID");

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-dashed border-border p-5 text-center">
        <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary grid place-items-center mx-auto mb-3"><Upload className="w-5 h-5" /></div>
        <p className="text-[13.5px] font-semibold text-foreground mb-3">Upload a pricelist (CSV, Excel, or PDF)</p>
        <input ref={fileRef} type="file" accept=".csv,text/csv,.pdf,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onFile} />
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="inline-flex items-center gap-2 px-3.5 h-9 mt-3 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Choose file
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{rows.length}</span> item{rows.length === 1 ? "" : "s"} in this campaign&apos;s catalog</p>
        {rows.length > 0 && (
          <button onClick={clearAll} disabled={busy} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-red-500 hover:text-red-600 outline-none disabled:opacity-50">
            <Trash2 className="w-4 h-4" />Clear all
          </button>
        )}
      </div>

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
                  <tr key={r.id} className="border-b border-border/60">
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
    </div>
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
