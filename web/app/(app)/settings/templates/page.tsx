"use client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, Pencil, Trash2, Send, RefreshCw, Loader2, X, ChevronLeft,
  Phone, Bold, Italic, Strikethrough, Smile, Info, Image as ImageIcon, Video,
  UserRound, LibraryBig, Terminal, Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { Select } from "@/components/Select";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterButton, FilterDrawer, FilterField } from "@/components/FilterDrawer";
import { fmtDateTimeShort, cn } from "@/lib/utils";
import { useEscClose } from "@/lib/useEscClose";
import { Tip } from "@/components/ui/tooltip";
import type { Template, TemplateButton, CarouselCard, Channel, Campaign } from "@/lib/types";
import {
  TEMPLATE_LIBRARY, TEMPLATE_TYPES, TYPES_BY_CATEGORY, TEMPLATE_TOPICS, LIBRARY_LANGS, localizeLibrary,
  type TemplateType, type LibraryTemplate,
} from "./library";
import { useToast, PageBody, SettingsCard, FieldLabel, INPUT_CLASS, PrimaryButton, GhostButton } from "../_shared";

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: "#F1F5F9", fg: "#64748B" }, PENDING: { bg: "#FEF3C7", fg: "#B45309" },
  APPROVED: { bg: "#DCFCE7", fg: "#15803D" }, REJECTED: { bg: "#FEE2E2", fg: "#B91C1C" },
};
const CAT_COLOR: Record<string, string> = { MARKETING: "#2563EB", UTILITY: "#0891B2", AUTHENTICATION: "#7C3AED" };
const CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
const LANGS = [
  { value: "en", label: "English" }, { value: "id", label: "Indonesian" },
  { value: "es", label: "Spanish" }, { value: "pt_BR", label: "Portuguese (BR)" }, { value: "ar", label: "Arabic" },
];
const EMOJIS = ["😀", "😊", "👍", "🙏", "🎉", "🚗", "📞", "✅", "⭐", "🔥", "💬", "📍"];

function renderBody(body: string, vars: string[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] || `{{${n}}}`);
}
function maxPlaceholder(body: string) {
  const m = body.match(/\{\{(\d+)\}\}/g) ?? [];
  return m.reduce((mx, p) => Math.max(mx, Number(p.replace(/\D/g, ""))), 0);
}

export default function TemplatesPage() {
  const { t: tr } = useI18n();
  const { notify, confirm, ToastHost } = useToast();
  const { can } = usePermissions();
  const canManage = can("manage_templates"); // gates create / edit / delete / submit
  const [rows, setRows] = useState<Template[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilters = statusFilter.length + channelFilter.length + campaignFilter.length;
  const clearFilters = () => { setStatusFilter([]); setChannelFilter([]); setCampaignFilter([]); };
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Create/edit flow: "" | chooser | library | form
  const [flow, setFlow] = useState<"" | "chooser" | "library" | "form">("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [prefill, setPrefill] = useState<LibraryTemplate | null>(null);
  const [prefillLang, setPrefillLang] = useState("en");

  async function load() {
    setLoading(true);
    try {
      setRows(await api.listTemplates({}));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.listChannels().then(setChannels).catch(() => {});
    api.listCampaigns().then(setCampaigns).catch(() => {});
  }, []);

  const channelName = (id: string | null) => channels.find((c) => c.id === id)?.name ?? null;
  const filterCampaigns = useMemo(() => campaigns.filter((c) => !channelFilter.length || (!!c.channel_id && channelFilter.includes(c.channel_id))), [campaigns, channelFilter]);
  const filtered = useMemo(() => rows.filter((t) =>
    (!query || t.name.toLowerCase().includes(query.toLowerCase())) &&
    (!statusFilter.length || statusFilter.includes(t.status)) &&
    // Channel-less templates apply to every channel, so they always pass.
    (!channelFilter.length || !t.channel_id || channelFilter.includes(t.channel_id)) &&
    // Templates with no campaigns apply to all campaigns, so they always pass.
    (!campaignFilter.length || !(t.campaign_ids?.length) || t.campaign_ids.some((id) => campaignFilter.includes(id)))
  ), [rows, query, statusFilter, channelFilter, campaignFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  useEffect(() => { setPage(0); }, [query, statusFilter, channelFilter, campaignFilter]);

  async function submit(t: Template) {
    try { const r = await api.submitTemplate(t.id); notify(r.simulated ? tr("settings.submittedAutoApprovedMockMode") : tr("settings.submittedToMetaForReview")); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function remove(t: Template) {
    if (!(await confirm({ title: "Delete template?", message: `Delete "${t.name}"? This can't be undone.`, danger: true, confirmLabel: "Delete" }))) return;
    try { const r = await api.deleteTemplate(t.id); notify(r.warning || tr("settings.templateDeleted"), r.warning ? "info" : "success"); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  function openNew() { setEditing(null); setPrefill(null); setPrefillLang("en"); setFlow("chooser"); }
  function openEdit(t: Template) { setEditing(t); setPrefill(null); setFlow("form"); }
  function closeFlow() { setFlow(""); setEditing(null); setPrefill(null); }

  return (
    <PageBody fill>
      {ToastHost}
      <SettingsCard className="overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 flex items-center gap-3 border-b border-border flex-wrap shrink-0">
          <div className="relative w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder={tr("settings.searchTemplates")} value={query} onChange={(e) => setQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-muted text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary" />
          </div>
          <FilterButton count={activeFilters} onClick={() => setFilterOpen(true)} />
          {activeFilters > 0 && <button onClick={clearFilters} className="text-[11px] font-semibold text-primary hover:underline outline-none">{tr("common.clear")}</button>}
          <FilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} onClear={clearFilters} canClear={activeFilters > 0}>
            <FilterField label={tr("automation.status")}><MultiSelect value={statusFilter} onChange={setStatusFilter} placeholder={tr("settings.allStatuses")} className="w-full" options={Object.keys(STATUS_COLOR).map((s) => ({ value: s, label: s }))} /></FilterField>
            <FilterField label={tr("settings.channels")}><MultiSelect value={channelFilter} onChange={setChannelFilter} placeholder={tr("common.allChannels")} className="w-full" options={channels.map((c) => ({ value: c.id, label: c.name }))} /></FilterField>
            <FilterField label={tr("settings.campaigns")}><MultiSelect value={campaignFilter} onChange={setCampaignFilter} placeholder={tr("common.allCampaigns")} className="w-full" options={filterCampaigns.map((c) => ({ value: c.id, label: c.name }))} /></FilterField>
          </FilterDrawer>
          <Tip label={tr("broadcasts.refresh")}><button onClick={load} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><RefreshCw className="w-[18px] h-[18px] text-muted-foreground" /></button></Tip>
          <div className="flex-1" />
          {canManage && <PrimaryButton onClick={openNew}><Plus className="w-4 h-4" />{tr("settings.newTemplate")}</PrimaryButton>}
        </div>

        <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {["Name", "Category", "Scope", "Language", "Status", "Updated", "Actions"].map((h) => (
                <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", h === "Actions" ? "text-right" : "text-left")}>{tr(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? [0, 1, 2].map((i) => (
              <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-7 rounded-md skeleton" /></td></tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12">
                <p className="font-semibold text-foreground mb-1">{tr("settings.noTemplatesYet")}</p>
                <p className="text-xs text-muted-foreground">{tr("settings.createAWhatsappTemplateAnd")}</p>
              </td></tr>
            ) : paged.map((t) => {
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
                    <p className="text-[12px] text-foreground">{channelName(t.channel_id) ?? tr("common.allChannels")}</p>
                    <p className="text-[11px] text-muted-foreground">{nCamp > 0 ? `${nCamp} campaign${nCamp > 1 ? "s" : ""}` : tr("common.allCampaigns")}</p>
                  </td>
                  <td className="px-4 py-2.5 text-[12.5px] text-foreground">{t.language}</td>
                  <td className="px-4 py-2.5"><span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ backgroundColor: sc.bg, color: sc.fg }}>{t.status}</span></td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">{fmtDateTimeShort(t.updated_at)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canManage ? (<>
                    {(t.status === "DRAFT" || t.status === "REJECTED") && (
                      <Tip label={tr("settings.submitToMeta")}><button onClick={() => submit(t)} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><Send className="w-[17px] h-[17px] text-primary" /></button></Tip>
                    )}
                    <Tip label={tr("common.edit")}><button onClick={() => openEdit(t)} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><Pencil className="w-[17px] h-[17px] text-muted-foreground" /></button></Tip>
                    <Tip label={tr("common.delete")}><button onClick={() => remove(t)} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors"><Trash2 className="w-[17px] h-[17px] text-destructive" /></button></Tip>
                    </>) : <span className="text-muted-foreground/50">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm shrink-0">
          <span className="text-muted-foreground tabular-nums">{filtered.length} total</span>
          <div className="flex items-center gap-2">
            <Select value={String(rowsPerPage)} onChange={(v) => { setRowsPerPage(Number(v)); setPage(0); }} align="right" className="w-[72px]"
              options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))} />
            <span className="text-muted-foreground mx-2 tabular-nums">{tr("settings.page")} {page + 1} of {totalPages}</span>
            <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">{tr("settings.prev")}</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">{tr("settings.next")}</button>
          </div>
        </div>
      </SettingsCard>

      {flow === "chooser" && (
        <CreateChooser onClose={closeFlow} onBlank={() => { setPrefill(null); setFlow("form"); }} onLibrary={() => setFlow("library")} />
      )}
      {flow === "library" && (
        <TemplateLibrary onClose={closeFlow} onBack={() => setFlow("chooser")}
          onPick={(item, lang) => { setPrefill(item); setPrefillLang(lang); setFlow("form"); }} />
      )}
      {flow === "form" && (
        <TemplateForm editing={editing} prefill={prefill} prefillLang={prefillLang} channels={channels} campaigns={campaigns}
          onClose={closeFlow} onSaved={(m) => { closeFlow(); notify(m); load(); }} onError={(m) => notify(m, "error")} />
      )}
    </PageBody>
  );
}

// ─────────────────────────────── Phone preview ──────────────────────────────
function PhonePreview({ headerType, headerText, headerMediaUrl, body, footer, buttons, vars, cards, ttype }: {
  headerType: string; headerText: string; headerMediaUrl?: string; body: string; footer: string;
  buttons: TemplateButton[]; vars: string[]; cards: CarouselCard[]; ttype: TemplateType;
}) {
  const { t: tr } = useI18n();
  const effButtons = ttype === "call_permission" ? [{ type: "QUICK_REPLY", text: "Allow" } as TemplateButton, { type: "QUICK_REPLY", text: "Don't allow" } as TemplateButton]
    : ttype === "request_contact" ? [{ type: "QUICK_REPLY", text: "Share contact info" } as TemplateButton]
    : buttons;
  return (
    <div className="mx-auto w-[270px] rounded-[2rem] border-[6px] border-[#0B141A] bg-[#0B141A] shadow-xl overflow-hidden">
      <div className="h-9 bg-[#075E54]" />
      <div className="px-3 py-3 min-h-[360px] max-h-[440px] overflow-y-auto" style={{ backgroundColor: "#E5DDD5", backgroundImage: "radial-gradient(rgba(0,0,0,0.04) 1px,transparent 1px)", backgroundSize: "14px 14px" }}>
        <div className="bg-[#FFF6D6] rounded-lg px-2.5 py-1.5 text-[10.5px] text-[#54656F] text-center mb-3 shadow-sm">
          {tr("settings.thisBusinessUsesASecure")}
        </div>
        {ttype === "carousel" ? (
          <>
            <div className="bg-white rounded-lg rounded-tl-none p-2.5 shadow-sm max-w-[210px] mb-2">
              <p className="text-[13px] whitespace-pre-wrap text-[#111B21]">{renderBody(body, vars) || tr("settings.yourMessageBodyWillAppear")}</p>
              <p className="text-[10px] text-[#8696A0] text-right mt-0.5">16:42</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(cards.length ? cards : [{ media_type: "IMAGE", body: "", buttons: [] } as CarouselCard]).map((c, i) => (
                <div key={i} className="bg-white rounded-lg p-1.5 shadow-sm shrink-0 w-[150px]">
                  <div className="h-20 rounded-md bg-[#D1D7DB] grid place-items-center text-[#5A6B73] overflow-hidden">
                    {c.media_url && c.media_type === "IMAGE"
                      ? <img src={c.media_url} alt="" className="w-full h-full object-cover" />
                      : c.media_url && c.media_type === "VIDEO"
                      ? <video src={c.media_url} className="w-full h-full object-cover" />
                      : c.media_type === "VIDEO" ? <Video className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}
                  </div>
                  {c.body && <p className="text-[11.5px] text-[#111B21] mt-1 whitespace-pre-wrap">{renderBody(c.body, vars)}</p>}
                  {c.buttons?.map((b, j) => (
                    <div key={j} className="mt-1 border-t border-[#E9EDEF] pt-1 text-center text-[#1DA1F2] font-semibold text-[12px]">{b.text || tr("settings.button")}</div>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="bg-white rounded-lg rounded-tl-none p-2.5 shadow-sm max-w-[210px]">
              {headerType === "TEXT" && headerText && <p className="text-[13px] font-bold mb-1">{renderBody(headerText, vars)}</p>}
              {headerType !== "NONE" && headerType !== "TEXT" && (
                <div className="h-20 rounded-md bg-[#D1D7DB] grid place-items-center mb-1.5 text-[#5A6B73] text-[11px] overflow-hidden">
                  {headerMediaUrl && headerType === "IMAGE" ? <img src={headerMediaUrl} alt="" className="w-full h-full object-cover" />
                    : headerMediaUrl && headerType === "VIDEO" ? <video src={headerMediaUrl} className="w-full h-full object-cover" />
                    : headerType}
                </div>
              )}
              <p className="text-[13px] whitespace-pre-wrap text-[#111B21]">{renderBody(body, vars) || tr("settings.yourMessageBodyWillAppear")}</p>
              {footer && <p className="text-[10.5px] text-[#667781] mt-1.5">{footer}</p>}
              <p className="text-[10px] text-[#8696A0] text-right mt-0.5">16:42</p>
            </div>
            {effButtons.length > 0 && (
              <div className="mt-1.5 flex flex-col gap-1 max-w-[210px]">
                {effButtons.map((b, i) => (
                  <div key={i} className="bg-white rounded-lg py-1.5 text-center text-[#1DA1F2] font-semibold text-[12.5px] shadow-sm flex items-center justify-center gap-1.5">
                    {b.type === "PHONE_NUMBER" && <Phone className="w-3.5 h-3.5" />}{b.text || tr("settings.button")}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────── Step 0: create chooser ────────────────────────
function CreateChooser({ onClose, onBlank, onLibrary }: { onClose: () => void; onBlank: () => void; onLibrary: () => void }) {
  const { t: tr } = useI18n();
  return (
    <Modal onClose={onClose} title={tr("settings.createTemplate")} maxW="max-w-3xl">
      <div className="px-6 py-5">
        <p className="text-[13px] font-semibold text-foreground mb-4">{tr("settings.chooseHowToCreateA")}</p>
        <div className="grid grid-cols-2 gap-4">
          <ChooserCard onClick={onBlank} accent="#BAE0F2" Icon={Pencil} title={tr("settings.useABlankTemplate")}
            desc={tr("settings.createYourTemplateFromScratch")}
            cta="Create new template" />
          <ChooserCard onClick={onLibrary} accent="#BBF7D0" Icon={LibraryBig} title={tr("settings.browseTheWhatsappTemplateLibrary")}
            desc={tr("settings.getStartedFasterWithPre")}
            cta="Browse templates" />
        </div>
      </div>
    </Modal>
  );
}
function ChooserCard({ onClick, accent, Icon, title, desc, cta }: { onClick: () => void; accent: string; Icon: typeof Pencil; title: string; desc: string; cta: string }) {
  return (
    <button onClick={onClick} className="text-left rounded-xl border border-border hover:border-primary hover:shadow-md transition-all overflow-hidden outline-none group">
      <div className="h-32 grid place-items-center" style={{ backgroundColor: accent }}>
        <Icon className="w-10 h-10 text-[#0B141A]/70" />
      </div>
      <div className="p-4">
        <p className="text-[15px] font-bold text-foreground mb-1.5">{title}</p>
        <p className="text-[12.5px] text-muted-foreground leading-snug mb-3">{desc}</p>
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary group-hover:underline">{cta}</span>
      </div>
    </button>
  );
}

// ──────────────────────────── Template library modal ────────────────────────
function TemplateLibrary({ onClose, onBack, onPick }: { onClose: () => void; onBack: () => void; onPick: (t: LibraryTemplate, lang: string) => void }) {
  const { t: tr } = useI18n();
  const [q, setQ] = useState("");
  const [lang, setLang] = useState("en");
  const [cats, setCats] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);

  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of TEMPLATE_LIBRARY) m[t.category] = (m[t.category] ?? 0) + 1;
    return m;
  }, []);
  const topicCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of TEMPLATE_LIBRARY) m[t.topic] = (m[t.topic] ?? 0) + 1;
    return m;
  }, []);

  const results = useMemo(() => TEMPLATE_LIBRARY.filter((t) =>
    (!q || t.name.toLowerCase().includes(q.toLowerCase()) || t.body.toLowerCase().includes(q.toLowerCase())) &&
    (cats.length === 0 || cats.includes(t.category)) &&
    (topics.length === 0 || topics.includes(t.topic))
  ), [q, cats, topics]);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <Modal onClose={onClose} maxW="max-w-5xl" noPad
      header={
        <div className="flex items-center gap-3 w-full">
          <button onClick={onBack} className="p-1 rounded-md text-muted-foreground hover:bg-muted outline-none"><ChevronLeft className="w-[18px] h-[18px]" /></button>
          <h2 className="text-[15px] font-bold text-foreground">{tr("settings.templateLibrary")}</h2>
          <div className="relative flex-1 max-w-[340px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("settings.searchTemplates2")}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm outline-none focus:border-primary" />
          </div>
          <div className="w-[150px]"><Select value={lang} onChange={setLang} options={LIBRARY_LANGS} /></div>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted outline-none"><X className="w-[18px] h-[18px]" /></button>
        </div>
      }
    >
      <div className="flex h-[60vh] min-h-[420px]">
        {/* Filters */}
        <div className="w-[230px] shrink-0 border-r border-border overflow-y-auto p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{tr("settings.category")}</p>
          <div className="flex flex-col gap-1.5 mb-5">
            {CATEGORIES.filter((c) => catCounts[c]).map((c) => (
              <label key={c} className="flex items-center gap-2 text-[13px] text-foreground cursor-pointer">
                <input type="checkbox" checked={cats.includes(c)} onChange={() => toggle(cats, setCats, c)} className="accent-primary" />
                {c} <span className="text-muted-foreground">({catCounts[c]})</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{tr("settings.topics")}</p>
          <div className="flex flex-col gap-1.5">
            {TEMPLATE_TOPICS.filter((t) => topicCounts[t]).map((t) => (
              <label key={t} className="flex items-center gap-2 text-[13px] text-foreground cursor-pointer">
                <input type="checkbox" checked={topics.includes(t)} onChange={() => toggle(topics, setTopics, t)} className="accent-primary" />
                <span className="truncate">{t}</span> <span className="text-muted-foreground">({topicCounts[t]})</span>
              </label>
            ))}
          </div>
        </div>
        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4" style={{ backgroundColor: "#F0F6F2" }}>
          <p className="text-[12.5px] text-muted-foreground mb-3">{tr("settings.showing")} {results.length} result{results.length !== 1 ? "s" : ""}</p>
          <div className="grid grid-cols-3 gap-3">
            {results.map((t) => {
              const lt = localizeLibrary(t, lang);
              return (
                <button key={t.id} onClick={() => onPick(lt, lang)} className="text-left bg-transparent outline-none group">
                  <div className="bg-[#E5DDD5] rounded-lg p-3 h-[150px] flex items-start" style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.04) 1px,transparent 1px)", backgroundSize: "12px 12px" }}>
                    <div className="bg-white rounded-lg rounded-tl-none p-2 shadow-sm w-full group-hover:shadow-md transition-shadow">
                      <p className="text-[11.5px] text-[#111B21] line-clamp-5 whitespace-pre-wrap">{lt.body}</p>
                      {lt.buttons[0] && <p className="text-[11px] text-[#1DA1F2] font-semibold mt-1 border-t border-[#E9EDEF] pt-1 text-center">{lt.buttons[0].text}</p>}
                    </div>
                  </div>
                  <p className="text-[12px] font-semibold text-foreground mt-1.5 truncate">{t.name}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────── Step: Create Message Template ──────────────────────
function TemplateForm({ editing, prefill, prefillLang, channels, campaigns, onClose, onSaved, onError }: {
  editing: Template | null; prefill: LibraryTemplate | null; prefillLang?: string; channels: Channel[]; campaigns: Campaign[];
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const { t: tr } = useI18n();
  const isEdit = !!editing;
  const init = editing ?? prefill;
  const [name, setName] = useState(init?.name ?? "");
  const [language, setLanguage] = useState((editing?.language) ?? prefillLang ?? "en");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>(
    (CATEGORIES.includes((init?.category ?? "") as typeof CATEGORIES[number]) ? init!.category : "UTILITY") as typeof CATEGORIES[number]);
  const [ttype, setTtype] = useState<TemplateType>((editing?.template_type as TemplateType) ?? prefill?.type ?? "standard");
  const [headerType, setHeaderType] = useState(init?.header_type ?? "NONE");
  const [headerText, setHeaderText] = useState((editing?.header_text) ?? prefill?.header_text ?? "");
  const [headerMediaUrl, setHeaderMediaUrl] = useState(editing?.header_media_url ?? "");
  const [body, setBody] = useState(init?.body ?? "");
  const [footer, setFooter] = useState((editing?.footer) ?? prefill?.footer ?? "");
  const [buttons, setButtons] = useState<TemplateButton[]>(init?.buttons ?? []);
  const [variables, setVariables] = useState<string[]>(init?.variables ?? []);
  const [cards, setCards] = useState<CarouselCard[]>(editing?.components?.cards ?? prefill?.cards ?? []);
  const [activeCard, setActiveCard] = useState(0);
  const [channelId, setChannelId] = useState(editing?.channel_id ?? "");
  const [campaignIds, setCampaignIds] = useState<string[]>(editing?.campaign_ids ?? []);
  const [saving, setSaving] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Keep type valid for the chosen category; ensure carousel has >=1 card.
  useEffect(() => {
    const allowed = TYPES_BY_CATEGORY[category] ?? ["standard"];
    if (!allowed.includes(ttype)) setTtype(allowed[0]);
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ttype === "carousel" && cards.length === 0) {
      setCards([{ media_type: "IMAGE", media_url: "", body: "", buttons: [] }]);
    }
  }, [ttype]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeholderCount = useMemo(() => maxPlaceholder(body), [body]);
  const vars = useMemo(() => Array.from({ length: placeholderCount }, (_, i) => variables[i] ?? ""), [placeholderCount, variables]);
  const setVar = (i: number, v: string) => { const next = [...vars]; next[i] = v; setVariables(next); };

  function surround(marker: string) {
    const el = bodyRef.current; if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = body.slice(s, e) || "text";
    const next = body.slice(0, s) + marker + sel + marker + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.selectionStart = s + marker.length; el.selectionEnd = s + marker.length + sel.length; });
  }
  function insertText(t: string) {
    const el = bodyRef.current; const s = el?.selectionStart ?? body.length;
    setBody(body.slice(0, s) + t + body.slice(s));
    requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = s + t.length; } });
  }
  const addVariable = () => insertText(`{{${maxPlaceholder(body) + 1}}}`);

  function addButton() { if (buttons.length < 3) setButtons([...buttons, { type: "QUICK_REPLY", text: "" }]); }
  const setButton = (i: number, b: TemplateButton) => setButtons(buttons.map((x, idx) => (idx === i ? b : x)));
  const removeButton = (i: number) => setButtons(buttons.filter((_, idx) => idx !== i));

  // Carousel card ops
  function addCard() { if (cards.length < 10) { setCards([...cards, { media_type: "IMAGE", media_url: "", body: "", buttons: [] }]); setActiveCard(cards.length); } }
  const setCard = (i: number, c: CarouselCard) => setCards(cards.map((x, idx) => (idx === i ? c : x)));
  function removeCard(i: number) { const next = cards.filter((_, idx) => idx !== i); setCards(next); setActiveCard(Math.max(0, Math.min(activeCard, next.length - 1))); }
  async function uploadCardMedia(i: number, file: File) {
    setUploading(true);
    try { const { url } = await api.uploadFile(file); setCard(i, { ...cards[i], media_url: url }); }
    catch (e) { onError(String(e)); }
    finally { setUploading(false); }
  }
  async function uploadHeaderMedia(file: File) {
    setUploading(true);
    try { const { url } = await api.uploadFile(file); setHeaderMediaUrl(url); }
    catch (e) { onError(String(e)); }
    finally { setUploading(false); }
  }

  const supportsButtons = ttype === "standard";
  const supportsHeader = ttype === "standard";

  function buildPayload() {
    const mediaHeader = supportsHeader && ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType);
    return {
      name: name.trim(), category, language, header_type: supportsHeader ? headerType : "NONE",
      header_text: supportsHeader && headerType === "TEXT" ? headerText : "",
      header_media_url: mediaHeader ? headerMediaUrl : "",
      body, footer, buttons: supportsButtons ? buttons : [], variables: vars,
      channel_id: channelId, campaign_ids: campaignIds,
      template_type: ttype, components: ttype === "carousel" ? { cards } : {},
    };
  }
  function validate() {
    if (!name.trim() || !body.trim()) { onError(tr("settings.nameAndBodyAreRequired")); return false; }
    if (!/^[a-z0-9_]+$/.test(name.trim())) { onError(tr("settings.nameMustBeLowercaseLetters")); return false; }
    return true;
  }
  async function save(thenSubmit: boolean) {
    if (!validate()) return;
    setSaving(true);
    try {
      let id = editing?.id;
      if (isEdit) await api.updateTemplate(editing!.id, buildPayload());
      else { const r = await api.createTemplate(buildPayload()); id = r.id; }
      if (thenSubmit && id) {
        const r = await api.submitTemplate(id);
        onSaved(r.simulated ? tr("settings.submittedAutoApprovedMockMode") : tr("settings.submittedToMetaForReview"));
      } else onSaved(isEdit ? tr("settings.templateUpdatedDraft") : tr("settings.templateSavedAsDraft"));
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }
  function copyCurl() {
    const payload = { name: name.trim() || "template_name", language, category, components: buildPayload() };
    const curl = `curl -X POST 'https://graph.facebook.com/v21.0/<WABA_ID>/message_templates' \\\n  -H 'Authorization: Bearer <TOKEN>' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(payload)}'`;
    navigator.clipboard?.writeText(curl).then(() => onSaved(tr("settings.curlCopiedToClipboard"))).catch(() => onError(tr("settings.copyFailed")));
  }

  const subTypes = TYPES_BY_CATEGORY[category] ?? ["standard"];

  return (
    <Modal onClose={onClose} maxW="max-w-5xl" noPad title={isEdit ? tr("settings.editMessageTemplate") : tr("settings.createMessageTemplate")}>
      <div className="flex flex-1 min-h-0">
        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4 min-w-0">
          <div className="flex gap-3">
            <div className="flex-1">
              <FieldLabel>{tr("inbox.name")}<Counter v={name.length} max={512} /></FieldLabel>
              <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} disabled={isEdit} maxLength={512}
                placeholder="template_name" className={cn(INPUT_CLASS, "disabled:bg-muted disabled:text-muted-foreground")} />
            </div>
            <div className="w-[180px]">
              <FieldLabel>{tr("settings.language")}</FieldLabel>
              <Select value={language} onChange={setLanguage} options={LANGS} />
            </div>
          </div>

          <div>
            <FieldLabel>{tr("settings.category")}</FieldLabel>
            <Select value={category} onChange={(v) => setCategory(v as typeof CATEGORIES[number])} options={CATEGORIES.map((c) => ({ value: c, label: c.charAt(0) + c.slice(1).toLowerCase() }))} />
          </div>

          {/* Simpulx scope */}
          <div className="flex gap-3">
            <div className="flex-1">
              <FieldLabel>{tr("components.channel")}</FieldLabel>
              <Select value={channelId} onChange={(v) => { setChannelId(v); setCampaignIds([]); }} placeholder={tr("common.allChannels")}
                options={[{ value: "", label: "All channels" }, ...channels.map((c) => ({ value: c.id, label: c.name }))]} />
            </div>
            <div className="flex-1">
              <FieldLabel>{tr("settings.campaignsEmptyAll")}</FieldLabel>
              <MultiSelect value={campaignIds} onChange={setCampaignIds} placeholder={tr("common.allCampaigns")}
                options={campaigns.filter((c) => !channelId || c.channel_id === channelId).map((c) => ({ value: c.id, label: c.name }))} />
            </div>
          </div>

          {/* Sub-type tabs */}
          {subTypes.length > 1 && (
            <div>
              <FieldLabel>{tr("contacts.select")} {category.charAt(0) + category.slice(1).toLowerCase()} {tr("broadcasts.template")}</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {subTypes.map((tp) => (
                  <button key={tp} onClick={() => setTtype(tp)}
                    className={cn("px-3 h-9 rounded-md border text-[12.5px] font-semibold transition-colors outline-none",
                      ttype === tp ? "border-primary bg-primary text-primary-foreground" : "border-input text-foreground hover:bg-muted")}>
                    {tr(TEMPLATE_TYPES[tp].label)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {supportsHeader && (
            <>
              <div className="flex gap-3">
                <div className="w-[160px]">
                  <FieldLabel>{tr("automation.header")}</FieldLabel>
                  <Select value={headerType} onChange={setHeaderType} options={["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"].map((h) => ({ value: h, label: h }))} />
                </div>
                {headerType === "TEXT" && <div className="flex-1"><FieldLabel>{tr("settings.headerText")}</FieldLabel><input value={headerText} onChange={(e) => setHeaderText(e.target.value)} className={INPUT_CLASS} /></div>}
              </div>
              {["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && (
                <div>
                  <FieldLabel>{tr("settings.sample")} {headerType.toLowerCase()} {tr("settings.requiredByMeta")}</FieldLabel>
                  <div className="flex items-center gap-2 mb-2">
                    <label className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-semibold cursor-pointer outline-none text-white", uploading ? "bg-primary/60" : "bg-primary hover:bg-primary/90")}>
                      {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {tr("settings.chooseFile")}
                      <input type="file" className="hidden"
                        accept={headerType === "VIDEO" ? "video/*" : headerType === "DOCUMENT" ? "application/pdf" : "image/*"}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadHeaderMedia(f); e.target.value = ""; }} />
                    </label>
                    {headerMediaUrl
                      ? <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-600 font-medium truncate max-w-[180px]"><ImageIcon className="w-3.5 h-3.5 shrink-0" />{tr("settings.uploaded")}</span>
                      : <span className="text-[11.5px] text-muted-foreground">{tr("settings.noSampleYet")}</span>}
                  </div>
                  <input value={headerMediaUrl} onChange={(e) => setHeaderMediaUrl(e.target.value)} placeholder={tr("settings.orPasteAMediaUrl")} className={cn(INPUT_CLASS, "h-8")} />
                </div>
              )}
            </>
          )}

          {/* Body + toolbar */}
          <div>
            <FieldLabel>{tr("automation.body")}<Counter v={body.length} max={1024} /></FieldLabel>
            <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={1024}
              placeholder={tr("settings.hi1")} className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm text-foreground outline-none resize-none transition-shadow focus:border-primary" />
            <div className="flex items-center gap-1 mt-1.5 relative">
              <ToolBtn onClick={() => surround("*")} title={tr("settings.bold")}><Bold className="w-4 h-4" /></ToolBtn>
              <ToolBtn onClick={() => surround("_")} title={tr("settings.italic")}><Italic className="w-4 h-4" /></ToolBtn>
              <ToolBtn onClick={() => surround("~")} title={tr("settings.strikethrough")}><Strikethrough className="w-4 h-4" /></ToolBtn>
              <ToolBtn onClick={() => setEmojiOpen((o) => !o)} title={tr("inbox.emoji")}><Smile className="w-4 h-4" /></ToolBtn>
              <Tip label={tr("settings.whatsappFormattingBoldItalicStrike")}><span className="p-1.5 text-muted-foreground"><Info className="w-4 h-4" /></span></Tip>
              <div className="flex-1" />
              <button onClick={addVariable} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-input text-[12.5px] font-semibold text-foreground hover:bg-muted outline-none">
                <Plus className="w-3.5 h-3.5" />{tr("settings.addVariable")}
              </button>
              {emojiOpen && (
                <div className="absolute top-9 left-0 z-10 bg-popover border border-border rounded-md shadow-lg p-2 grid grid-cols-6 gap-1">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => { insertText(e); setEmojiOpen(false); }} className="w-7 h-7 grid place-items-center hover:bg-muted rounded text-base outline-none">{e}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {placeholderCount > 0 && (
            <div>
              <FieldLabel>{tr("settings.sampleValues")}</FieldLabel>
              <div className="flex flex-col gap-2">
                {vars.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-10 shrink-0">{`{{${i + 1}}}`}</span>
                    <input value={v} onChange={(e) => setVar(i, e.target.value)} className={cn(INPUT_CLASS, "h-8")} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Carousel cards */}
          {ttype === "carousel" && (
            <div>
              <FieldLabel>{tr("settings.carouselCards")}</FieldLabel>
              <p className="text-[11.5px] text-muted-foreground mb-2">{tr("settings.displayYourProductsCreateA")}</p>
              <div className="flex gap-2 mb-3">
                {cards.map((c, i) => (
                  <button key={i} onClick={() => setActiveCard(i)}
                    className={cn("w-16 h-16 rounded-lg border-2 grid place-items-center text-muted-foreground", activeCard === i ? "border-primary bg-primary/5" : "border-input")}>
                    {c.media_type === "VIDEO" ? <Video className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                  </button>
                ))}
                {cards.length < 10 && (
                  <button onClick={addCard} className="w-16 h-16 rounded-lg bg-[#6D28D9] text-white grid place-items-center outline-none"><Plus className="w-5 h-5" /></button>
                )}
              </div>
              {cards[activeCard] && (
                <div className="rounded-lg border border-border p-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[12.5px] font-bold text-foreground">{tr("settings.editCardContent")}</p>
                    {cards.length > 1 && <button onClick={() => removeCard(activeCard)} className="p-1 text-destructive hover:bg-muted rounded outline-none"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-foreground mb-1">{tr("inbox.media")}</p>
                    <p className="text-[11px] text-muted-foreground mb-1.5">{tr("settings.uploadEitherAnImageOr")}</p>
                    <div className="flex items-center gap-4 mb-2 text-[12.5px]">
                      {(["IMAGE", "VIDEO"] as const).map((mt) => (
                        <label key={mt} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={cards[activeCard].media_type === mt} onChange={() => setCard(activeCard, { ...cards[activeCard], media_type: mt })} className="accent-primary" />
                          {mt.charAt(0) + mt.slice(1).toLowerCase()}
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <label className={cn("inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-semibold cursor-pointer outline-none text-white", uploading ? "bg-primary/60" : "bg-primary hover:bg-primary/90")}>
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {tr("settings.chooseFile")}
                        <input type="file" accept={cards[activeCard].media_type === "VIDEO" ? "video/*" : "image/*"} className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCardMedia(activeCard, f); e.target.value = ""; }} />
                      </label>
                      {cards[activeCard].media_url
                        ? <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-600 font-medium truncate max-w-[170px]"><ImageIcon className="w-3.5 h-3.5 shrink-0" />{tr("settings.uploaded")}</span>
                        : <span className="text-[11.5px] text-muted-foreground">{tr("settings.sample")} {cards[activeCard].media_type.toLowerCase()} required</span>}
                    </div>
                    <input value={cards[activeCard].media_url ?? ""} onChange={(e) => setCard(activeCard, { ...cards[activeCard], media_url: e.target.value })}
                      placeholder={tr("settings.orPasteAMediaUrl")} className={cn(INPUT_CLASS, "h-8")} />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-foreground mb-1">{tr("settings.cardContentOptional")}</p>
                    <textarea value={cards[activeCard].body} onChange={(e) => setCard(activeCard, { ...cards[activeCard], body: e.target.value })} rows={2}
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm outline-none resize-none focus:border-primary" />
                  </div>
                </div>
              )}
            </div>
          )}

          {ttype === "call_permission" && (
            <Locked icon={Phone} text={tr("settings.aCallPermissionRequestAdds")} />
          )}
          {ttype === "request_contact" && (
            <Locked icon={UserRound} text={tr("settings.aRequestContactInfoTemplate")} />
          )}

          {ttype !== "carousel" && (
            <div><FieldLabel>{tr("automation.footerOptional")}<Counter v={footer.length} max={60} /></FieldLabel>
              <input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60} placeholder={tr("settings.replyStopToOptOut")} className={INPUT_CLASS} /></div>
          )}

          {supportsButtons && (
            <div>
              <FieldLabel>{tr("settings.buttons")}</FieldLabel>
              <div className="flex flex-col gap-2">
                {buttons.map((b, i) => (
                  <div key={i} className="flex gap-2">
                    <Select value={b.type} onChange={(v) => setButton(i, { ...b, type: v as TemplateButton["type"] })} className="w-[150px]"
                      options={[{ value: "QUICK_REPLY", label: "Quick reply" }, { value: "URL", label: "Visit URL" }, { value: "PHONE_NUMBER", label: "Call phone" }]} />
                    <input placeholder={tr("settings.buttonText")} value={b.text} onChange={(e) => setButton(i, { ...b, text: e.target.value })} className={cn(INPUT_CLASS, "flex-1")} />
                    {b.type === "URL" && <input placeholder="https://..." value={b.url ?? ""} onChange={(e) => setButton(i, { ...b, url: e.target.value })} className={cn(INPUT_CLASS, "flex-1")} />}
                    {b.type === "PHONE_NUMBER" && <input placeholder="+62..." value={b.phone ?? ""} onChange={(e) => setButton(i, { ...b, phone: e.target.value })} className={cn(INPUT_CLASS, "flex-1")} />}
                    <button onClick={() => removeButton(i)} className="p-1.5 rounded-md hover:bg-muted outline-none text-destructive transition-colors"><Trash2 className="w-[18px] h-[18px]" /></button>
                  </div>
                ))}
                {buttons.length < 3 && (
                  <button onClick={addButton} className="inline-flex items-center gap-1 text-sm text-primary font-semibold hover:underline outline-none self-start">
                    <Plus className="w-4 h-4" />{tr("settings.addAButton")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="w-[320px] shrink-0 border-l border-border bg-muted/30 overflow-y-auto px-5 py-5">
          <p className="text-center text-[13px] font-bold text-foreground mb-3">{tr("broadcasts.preview")}</p>
          <PhonePreview headerType={headerType} headerText={headerText} headerMediaUrl={headerMediaUrl} body={body} footer={footer} buttons={buttons} vars={vars} cards={cards} ttype={ttype} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-border shrink-0">
        <GhostButton onClick={copyCurl}><Terminal className="w-4 h-4" />{tr("settings.copyAsCurl")}</GhostButton>
        <div className="flex gap-2">
          <GhostButton onClick={onClose}>{tr("common.cancel")}</GhostButton>
          <GhostButton onClick={() => save(false)}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{tr("broadcasts.saveAsDraft")}</GhostButton>
          <PrimaryButton onClick={() => save(true)} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{tr("settings.submitForApproval")}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────── small helpers ──────────────────────────────
// The HSM template builder is a wide two-column editor (form + live phone
// preview), so it stays a centered modal rather than a narrow drawer - but it
// still closes on Escape via useEscClose for consistency with the app.
function Modal({ children, onClose, title, header, maxW, noPad }: {
  children: React.ReactNode; onClose: () => void; title?: string; header?: React.ReactNode; maxW: string; noPad?: boolean;
}) {
  useEscClose(true, onClose);
  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={cn("absolute inset-y-0 right-0 bg-card border-l border-border shadow-2xl w-full flex flex-col animate-slide-in-right", maxW)}>
        {header ? (
          <div className="flex items-center px-4 py-3 border-b border-border shrink-0">{header}</div>
        ) : title ? (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
            <h2 className="text-[15px] font-bold text-foreground">{title}</h2>
            <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><X className="w-[18px] h-[18px]" /></button>
          </div>
        ) : null}
        <div className={cn("flex flex-col flex-1 min-h-0", !noPad && "")}>{children}</div>
      </div>
    </div>
  );
}
function Counter({ v, max }: { v: number; max: number }) {
  return <span className="float-right font-normal text-[10.5px] text-muted-foreground">{v}/{max}</span>;
}
function ToolBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return <Tip label={title}><button onClick={onClick} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors">{children}</button></Tip>;
}
function Locked({ icon: Icon, text }: { icon: typeof Phone; text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 p-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <p className="text-[12px] text-muted-foreground leading-snug">{text}</p>
    </div>
  );
}
