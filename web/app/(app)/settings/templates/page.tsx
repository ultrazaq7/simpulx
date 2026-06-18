"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Pencil, Trash2, Send, RefreshCw, Loader2, X, ChevronLeft, Megaphone, Bell, ShieldCheck, LayoutGrid, ShoppingBag, ClipboardList, Phone, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import { MultiSelect } from "@/components/ui/multi-select";
import { fmtDate, cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import type { Template, TemplateButton, Channel, Campaign } from "@/lib/types";
import { TEMPLATE_LIBRARY, TEMPLATE_TYPES, TYPES_BY_CATEGORY, type TemplateType, type LibraryTemplate } from "./library";
import { useToast, PageBody, SettingsCard, FieldLabel, INPUT_CLASS, PrimaryButton, GhostButton } from "../_shared";

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: "#F1F5F9", fg: "#64748B" }, PENDING: { bg: "#FEF3C7", fg: "#B45309" },
  APPROVED: { bg: "#DCFCE7", fg: "#15803D" }, REJECTED: { bg: "#FEE2E2", fg: "#B91C1C" },
};
const CAT_COLOR: Record<string, string> = { MARKETING: "#2563EB", UTILITY: "#0891B2", AUTHENTICATION: "#7C3AED" };
const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
const CAT_ICON: Record<string, typeof Megaphone> = { MARKETING: Megaphone, UTILITY: Bell, AUTHENTICATION: ShieldCheck };
const TYPE_ICON: Record<TemplateType, typeof LayoutGrid> = { default: LayoutGrid, catalog: ShoppingBag, flows: ClipboardList, calling_permission: Phone };
const LANGS = ["en", "id", "es", "pt_BR", "ar"];

function renderBody(body: string, vars: string[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] || `{{${n}}}`);
}

export default function TemplatesPage() {
  const { notify, ToastHost } = useToast();
  const [rows, setRows] = useState<Template[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setRows(await api.listTemplates({ channel_id: channelFilter || undefined, campaign_id: campaignFilter || undefined }));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [channelFilter, campaignFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.listChannels().then(setChannels).catch(() => {});
    api.listCampaigns().then(setCampaigns).catch(() => {});
  }, []);

  const channelName = (id: string | null) => channels.find((c) => c.id === id)?.name ?? null;
  // Campaigns shown in the filter are scoped to the chosen channel (if any).
  const filterCampaigns = useMemo(
    () => campaigns.filter((c) => !channelFilter || c.channel_id === channelFilter),
    [campaigns, channelFilter],
  );

  const filtered = useMemo(() => rows.filter((t) =>
    (!query || t.name.toLowerCase().includes(query.toLowerCase())) &&
    (!statusFilter || t.status === statusFilter)
  ), [rows, query, statusFilter]);

  async function submit(t: Template) {
    try { const r = await api.submitTemplate(t.id); notify(r.simulated ? "Submitted - auto-approved (mock mode)" : "Submitted to Meta for review"); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function remove(t: Template) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try { await api.deleteTemplate(t.id); notify("Template deleted"); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  return (
    <PageBody>
      {ToastHost}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input type="text" placeholder="Search templates" value={query} onChange={(e) => setQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-card text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary" />
        </div>
        <Select value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" className="min-w-[140px]"
          options={[{ value: "", label: "All statuses" }, ...Object.keys(STATUS_COLOR).map((s) => ({ value: s, label: s }))]} />
        <Select value={channelFilter} onChange={(v) => { setChannelFilter(v); setCampaignFilter(""); }} placeholder="All channels" className="min-w-[150px]"
          options={[{ value: "", label: "All channels" }, ...channels.map((c) => ({ value: c.id, label: c.name }))]} />
        <Select value={campaignFilter} onChange={setCampaignFilter} placeholder="All campaigns" className="min-w-[160px]"
          options={[{ value: "", label: "All campaigns" }, ...filterCampaigns.map((c) => ({ value: c.id, label: c.name }))]} />
        <Tip label="Refresh"><button onClick={load} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><RefreshCw className="w-[18px] h-[18px] text-muted-foreground" /></button></Tip>
        <div className="flex-1" />
        <PrimaryButton onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="w-4 h-4" />New template
        </PrimaryButton>
      </div>

      <SettingsCard className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["Name", "Category", "Scope", "Language", "Status", "Updated", "Actions"].map((h) => (
                <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", h === "Actions" ? "text-right" : "text-left")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? [0, 1, 2].map((i) => (
              <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-7 rounded-md skeleton" /></td></tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12">
                <p className="font-semibold text-foreground mb-1">No templates yet</p>
                <p className="text-xs text-muted-foreground">Create a WhatsApp template and submit it for approval.</p>
              </td></tr>
            ) : filtered.map((t) => {
              const sc = STATUS_COLOR[t.status] ?? STATUS_COLOR.DRAFT;
              const cc = CAT_COLOR[t.category] ?? "#64748B";
              const nCamp = t.campaign_ids?.length ?? 0;
              return (
                <tr key={t.id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-[13px] text-foreground">{t.name}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate max-w-[240px]">{t.body.slice(0, 60)}{t.body.length > 60 ? "…" : ""}</p>
                  </td>
                  <td className="px-4 py-2.5"><span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ backgroundColor: cc + "1a", color: cc }}>{t.category}</span></td>
                  <td className="px-4 py-2.5">
                    <p className="text-[12px] text-foreground">{channelName(t.channel_id) ?? "All channels"}</p>
                    <p className="text-[11px] text-muted-foreground">{nCamp > 0 ? `${nCamp} campaign${nCamp > 1 ? "s" : ""}` : "All campaigns"}</p>
                  </td>
                  <td className="px-4 py-2.5 text-[12.5px] text-foreground">{t.language}</td>
                  <td className="px-4 py-2.5"><span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ backgroundColor: sc.bg, color: sc.fg }}>{t.status}</span></td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">{fmtDate(t.updated_at)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {(t.status === "DRAFT" || t.status === "REJECTED") && (
                      <Tip label="Submit to Meta"><button onClick={() => submit(t)} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><Send className="w-[17px] h-[17px] text-primary" /></button></Tip>
                    )}
                    <Tip label="Edit"><button onClick={() => { setEditing(t); setOpen(true); }} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><Pencil className="w-[17px] h-[17px] text-muted-foreground" /></button></Tip>
                    <Tip label="Delete"><button onClick={() => remove(t)} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><Trash2 className="w-[17px] h-[17px] text-destructive" /></button></Tip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SettingsCard>

      <TemplateDialog open={open} editing={editing} channels={channels} campaigns={campaigns}
        onClose={() => setOpen(false)}
        onSaved={(msg) => { setOpen(false); notify(msg); load(); }}
        onError={(msg) => notify(msg, "error")} />
    </PageBody>
  );
}

// ── Live WhatsApp bubble preview ─────────────────────────────────────────────
function Preview({ headerType, headerText, body, footer, buttons, vars }: {
  headerType: string; headerText: string; body: string; footer: string; buttons: TemplateButton[]; vars: string[];
}) {
  return (
    <div className="bg-[#E5DDD5] rounded-lg p-4 min-h-[200px]" style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.04) 1px,transparent 1px)", backgroundSize: "16px 16px" }}>
      <div className="bg-white rounded-lg rounded-tl-none p-2.5 shadow-sm max-w-[250px]">
        {headerType === "TEXT" && headerText && <p className="text-[13.5px] font-bold mb-1">{renderBody(headerText, vars)}</p>}
        {headerType !== "NONE" && headerType !== "TEXT" && (
          <div className="h-24 rounded-lg bg-[#D1D7DB] grid place-items-center mb-1.5 text-[#5A6B73] text-xs">{headerType}</div>
        )}
        <p className="text-[13.5px] whitespace-pre-wrap text-[#111B21]">{renderBody(body, vars) || "Your message body will appear here."}</p>
        {footer && <p className="text-[11px] text-[#667781] mt-1.5">{footer}</p>}
        <p className="text-[10px] text-[#8696A0] text-right mt-0.5">12:30 PM</p>
      </div>
      {buttons.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1 max-w-[250px]">
          {buttons.map((b, i) => (
            <div key={i} className="bg-white rounded-lg py-1.5 text-center text-[#1DA1F2] font-semibold text-[13px] shadow-sm flex items-center justify-center gap-1.5">
              {b.type === "PHONE_NUMBER" && <Phone className="w-3.5 h-3.5" />}{b.text || "Button"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateDialog({ open, editing, channels, campaigns, onClose, onSaved, onError }: {
  open: boolean; editing: Template | null; channels: Channel[]; campaigns: Campaign[];
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const isEdit = !!editing;
  const [step, setStep] = useState<1 | 2>(1);
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("MARKETING");
  const [ttype, setTtype] = useState<TemplateType>("default");
  const [libId, setLibId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [headerType, setHeaderType] = useState("NONE");
  const [headerText, setHeaderText] = useState("");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<TemplateButton[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [channelId, setChannelId] = useState("");
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const t = editing;
      setStep(2);
      setCategory((CATEGORIES.includes(t.category as typeof CATEGORIES[number]) ? t.category : "MARKETING") as typeof CATEGORIES[number]);
      setTtype("default"); setLibId(null);
      setName(t.name); setLanguage(t.language);
      setHeaderType(t.header_type ?? "NONE"); setHeaderText(t.header_text ?? "");
      setBody(t.body); setFooter(t.footer ?? "");
      setButtons(t.buttons ?? []); setVariables(t.variables ?? []);
      setChannelId(t.channel_id ?? ""); setCampaignIds(t.campaign_ids ?? []);
    } else {
      setStep(1); setCategory("MARKETING"); setTtype("default"); setLibId(null);
      setName(""); setLanguage("en"); setHeaderType("NONE"); setHeaderText("");
      setBody(""); setFooter(""); setButtons([]); setVariables([]);
      setChannelId(""); setCampaignIds([]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the category changes, keep the type valid for that category.
  useEffect(() => {
    const allowed = TYPES_BY_CATEGORY[category] ?? ["default"];
    if (!allowed.includes(ttype)) setTtype(allowed[0]);
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyLibrary(item: LibraryTemplate) {
    setLibId(item.id);
    setCategory(item.category);
    setTtype(item.type);
    setName(item.prefill.name);
    setHeaderType(item.prefill.header_type);
    setHeaderText(item.prefill.header_text ?? "");
    setBody(item.prefill.body);
    setFooter(item.prefill.footer ?? "");
    setButtons(item.prefill.buttons);
    setVariables(item.prefill.variables);
  }
  function startBlank() {
    setLibId(null);
    setName(""); setHeaderType("NONE"); setHeaderText(""); setBody(""); setFooter("");
    setButtons([]); setVariables([]);
  }

  const placeholderCount = useMemo(() => {
    const m = body.match(/\{\{(\d+)\}\}/g) ?? [];
    return m.reduce((max, p) => Math.max(max, Number(p.replace(/\D/g, ""))), 0);
  }, [body]);
  const vars = useMemo(() => Array.from({ length: placeholderCount }, (_, i) => variables[i] ?? ""), [placeholderCount, variables]);
  function setVar(i: number, v: string) { const next = [...vars]; next[i] = v; setVariables(next); }
  function addButton() { if (buttons.length < 3) setButtons([...buttons, { type: "QUICK_REPLY", text: "" }]); }
  function setButton(i: number, b: TemplateButton) { setButtons(buttons.map((x, idx) => (idx === i ? b : x))); }
  function removeButton(i: number) { setButtons(buttons.filter((_, idx) => idx !== i)); }

  // Campaigns selectable are scoped to the chosen channel (if any).
  const dialogCampaigns = useMemo(
    () => campaigns.filter((c) => !channelId || c.channel_id === channelId),
    [campaigns, channelId],
  );
  const libForCategory = useMemo(() => TEMPLATE_LIBRARY.filter((l) => l.category === category), [category]);

  async function save() {
    if (!name.trim() || !body.trim()) { onError("Name and body are required"); return; }
    if (!/^[a-z0-9_]+$/.test(name.trim())) { onError("Name must be lowercase letters, numbers and underscores"); return; }
    setSaving(true);
    const payload = {
      name: name.trim(), category, language, header_type: headerType,
      header_text: headerType === "TEXT" ? headerText : "", body, footer, buttons, variables: vars,
      channel_id: channelId, campaign_ids: campaignIds,
    };
    try {
      if (isEdit) { await api.updateTemplate(editing!.id, payload); onSaved("Template updated (back to draft)"); }
      else { await api.createTemplate(payload); onSaved("Template saved as draft"); }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative bg-card rounded-lg border border-border shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col animate-scale-in">
        {/* Header + steps */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-[15px] font-bold text-foreground">{isEdit ? "Edit template" : "New WhatsApp template"}</h2>
            {!isEdit && (
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <span className={cn("flex items-center gap-1.5", step === 1 ? "text-primary" : "text-muted-foreground")}>
                  <span className={cn("w-4 h-4 rounded-full grid place-items-center text-[9px] text-white", step === 1 ? "bg-primary" : "bg-muted-foreground/50")}>1</span>Set up
                </span>
                <span className="text-muted-foreground/40">/</span>
                <span className={cn("flex items-center gap-1.5", step === 2 ? "text-primary" : "text-muted-foreground")}>
                  <span className={cn("w-4 h-4 rounded-full grid place-items-center text-[9px] text-white", step === 2 ? "bg-primary" : "bg-muted-foreground/50")}>2</span>Edit
                </span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><X className="w-[18px] h-[18px]" /></button>
        </div>

        {/* ── STEP 1: category + type + library ── */}
        {step === 1 && !isEdit && (
          <div className="flex gap-5 px-5 py-5 overflow-y-auto flex-1 min-h-0">
            <div className="flex-1 flex flex-col gap-4 min-w-0">
              <div>
                <FieldLabel>Category</FieldLabel>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map((c) => {
                    const Icon = CAT_ICON[c]; const sel = category === c;
                    return (
                      <button key={c} onClick={() => setCategory(c)}
                        className={cn("flex items-center justify-center gap-2 h-10 rounded-md border text-[12.5px] font-semibold transition-colors outline-none",
                          sel ? "border-primary bg-primary/5 text-primary" : "border-input text-foreground hover:bg-muted")}>
                        <Icon className="w-4 h-4" />{c.charAt(0) + c.slice(1).toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <FieldLabel>Type of message</FieldLabel>
                <div className="flex flex-col gap-2">
                  {(TYPES_BY_CATEGORY[category] ?? ["default"]).map((tp) => {
                    const Icon = TYPE_ICON[tp]; const sel = ttype === tp;
                    return (
                      <button key={tp} onClick={() => setTtype(tp)}
                        className={cn("flex items-start gap-3 p-3 rounded-md border text-left transition-colors outline-none",
                          sel ? "border-primary bg-primary/5" : "border-input hover:bg-muted")}>
                        <span className={cn("mt-0.5 w-4 h-4 rounded-full border-2 grid place-items-center shrink-0", sel ? "border-primary" : "border-muted-foreground/40")}>
                          {sel && <span className="w-2 h-2 rounded-full bg-primary" />}
                        </span>
                        <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-foreground">{TEMPLATE_TYPES[tp].label}</p>
                          <p className="text-[11.5px] text-muted-foreground">{TEMPLATE_TYPES[tp].description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <FieldLabel>Start from the library or from scratch</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={startBlank}
                    className={cn("flex items-center gap-2 p-3 rounded-md border text-left transition-colors outline-none",
                      libId === null ? "border-primary bg-primary/5" : "border-input hover:bg-muted")}>
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div><p className="text-[12.5px] font-semibold text-foreground">Start from scratch</p><p className="text-[11px] text-muted-foreground">Blank template</p></div>
                  </button>
                  {libForCategory.map((item) => (
                    <button key={item.id} onClick={() => applyLibrary(item)}
                      className={cn("flex items-center gap-2 p-3 rounded-md border text-left transition-colors outline-none",
                        libId === item.id ? "border-primary bg-primary/5" : "border-input hover:bg-muted")}>
                      {(() => { const Icon = TYPE_ICON[item.type]; return <Icon className="w-4 h-4 text-muted-foreground shrink-0" />; })()}
                      <div className="min-w-0"><p className="text-[12.5px] font-semibold text-foreground truncate">{item.title}</p><p className="text-[11px] text-muted-foreground truncate">{item.description}</p></div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="w-[300px] shrink-0">
              <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase mb-2">Template preview</p>
              <Preview headerType={headerType} headerText={headerText} body={body} footer={footer} buttons={buttons} vars={vars} />
            </div>
          </div>
        )}

        {/* ── STEP 2: edit form ── */}
        {step === 2 && (
          <div className="flex gap-5 px-5 py-5 overflow-y-auto flex-1 min-h-0">
            <div className="flex-1 flex flex-col gap-4 min-w-0">
              <div className="flex gap-4">
                <L label="Name" className="flex-1"><input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="welcome_offer" disabled={isEdit} className={cn(INPUT_CLASS, "disabled:bg-muted disabled:text-muted-foreground")} /></L>
                <L label="Language" className="w-[110px]">
                  <Select value={language} onChange={setLanguage} options={LANGS.map((l) => ({ value: l, label: l }))} />
                </L>
              </div>
              <L label="Category">
                <Select value={category} onChange={(v) => setCategory(v as typeof CATEGORIES[number])} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
              </L>

              {/* Scope: channel + campaigns */}
              <div className="flex gap-4">
                <L label="Channel" className="flex-1">
                  <Select value={channelId} onChange={(v) => { setChannelId(v); setCampaignIds([]); }} placeholder="All channels"
                    options={[{ value: "", label: "All channels" }, ...channels.map((c) => ({ value: c.id, label: c.name }))]} />
                </L>
                <L label="Campaigns (empty = all)" className="flex-1">
                  <MultiSelect value={campaignIds} onChange={setCampaignIds} placeholder="All campaigns"
                    options={dialogCampaigns.map((c) => ({ value: c.id, label: c.name }))} />
                </L>
              </div>

              <div className="flex gap-4">
                <L label="Header" className="w-[150px]">
                  <Select value={headerType} onChange={setHeaderType} options={["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"].map((h) => ({ value: h, label: h }))} />
                </L>
                {headerType === "TEXT" && <L label="Header text" className="flex-1"><input type="text" value={headerText} onChange={(e) => setHeaderText(e.target.value)} className={INPUT_CLASS} /></L>}
              </div>
              <L label="Body (use {{1}}, {{2}} for variables)">
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Hi {{1}}, thanks for joining!"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm text-foreground outline-none resize-none transition-shadow focus:border-primary" />
              </L>
              {placeholderCount > 0 && (
                <L label="Sample values">
                  <div className="flex flex-col gap-2">
                    {vars.map((v, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-10 shrink-0">{`{{${i + 1}}}`}</span>
                        <input type="text" value={v} onChange={(e) => setVar(i, e.target.value)} className={cn(INPUT_CLASS, "h-8")} />
                      </div>
                    ))}
                  </div>
                </L>
              )}
              <L label="Footer"><input type="text" value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Reply STOP to opt out" className={INPUT_CLASS} /></L>
              <L label="Buttons">
                <div className="flex flex-col gap-2">
                  {buttons.map((b, i) => (
                    <div key={i} className="flex gap-2">
                      <Select value={b.type} onChange={(v) => setButton(i, { ...b, type: v as TemplateButton["type"] })} className="w-[150px]"
                        options={[{ value: "QUICK_REPLY", label: "Quick reply" }, { value: "URL", label: "Visit URL" }, { value: "PHONE_NUMBER", label: "Call phone" }]} />
                      <input type="text" placeholder="Button text" value={b.text} onChange={(e) => setButton(i, { ...b, text: e.target.value })} className={cn(INPUT_CLASS, "flex-1")} />
                      {b.type === "URL" && <input type="text" placeholder="https://..." value={b.url ?? ""} onChange={(e) => setButton(i, { ...b, url: e.target.value })} className={cn(INPUT_CLASS, "flex-1")} />}
                      {b.type === "PHONE_NUMBER" && <input type="text" placeholder="+62..." value={b.phone ?? ""} onChange={(e) => setButton(i, { ...b, phone: e.target.value })} className={cn(INPUT_CLASS, "flex-1")} />}
                      <button onClick={() => removeButton(i)} className="p-1.5 rounded-md hover:bg-muted outline-none text-destructive transition-colors"><Trash2 className="w-[18px] h-[18px]" /></button>
                    </div>
                  ))}
                  {buttons.length < 3 && (
                    <button onClick={addButton} className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline outline-none self-start">
                      <Plus className="w-4 h-4" />Add button
                    </button>
                  )}
                </div>
              </L>
            </div>

            <div className="w-[300px] shrink-0">
              <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase mb-2">Preview</p>
              <Preview headerType={headerType} headerText={headerText} body={body} footer={footer} buttons={buttons} vars={vars} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between gap-2 px-5 py-3.5 border-t border-border shrink-0">
          <div>
            {step === 2 && !isEdit && (
              <GhostButton onClick={() => setStep(1)}><ChevronLeft className="w-4 h-4" />Back</GhostButton>
            )}
          </div>
          <div className="flex gap-2">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            {step === 1 && !isEdit ? (
              <PrimaryButton onClick={() => setStep(2)}>Next</PrimaryButton>
            ) : (
              <PrimaryButton onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{isEdit ? "Save draft" : "Create draft"}
              </PrimaryButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function L({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}
