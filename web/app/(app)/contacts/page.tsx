"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Search, UserPlus, Download, Pencil, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
  Users, User, X, XCircle, Loader2, Tag as TagIcon, MoreVertical, MessageSquare, Trash2, Upload, ChevronDown, Eye, Ban, Copy, Check, SlidersHorizontal, Send,
} from "lucide-react";

import { api, getUser } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { initials, channelColor, channelTextColor, channelLabel, avatarColor, fmtDate, fmtDateTimeShort, fmtExportTs, cn, stageLabelByName } from "@/lib/utils";
import type { Contact, Agent, Campaign, Message, Stage, Conversation, Disposition, CustomField } from "@/lib/types";
import { Tip } from "@/components/ui/tooltip";
import MessageBubble, { rewriteLocalMedia } from "@/app/(app)/inbox/components/MessageBubble";
import Composer from "@/app/(app)/inbox/components/Composer";
import { StageMenu, getDotColor } from "@/app/(app)/inbox/components/StageMenu";
import LostReasonDialog from "@/app/(app)/inbox/components/LostReasonDialog";
import { Select } from "@/components/Select";
import { MultiSelect } from "@/components/ui/multi-select";
import SidePanel from "@/components/SidePanel";
import { Toast } from "@/components/Toast";
import { useConfirm, usePrompt } from "@/components/ConfirmDialog";
import SendTemplateDrawer from "./components/SendTemplateDrawer";

type ModalState = { mode: "add" } | { mode: "edit"; contact: Contact } | null;

// Specific, not generic: a CTWA referral is always Meta by definition (WhatsApp
// click-to-chat is a Meta-only feature); a Web API lead uses its tagged
// platform. Kept in one place so Contacts, its CSV export, and any drill-in
// all read the same label.
const SOURCE_PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta Ads", tiktok: "TikTok Ads", google: "Google Ads", other: "Website",
};
function sourceLabel(c: Contact): string {
  if (c.source_id) return "Meta Ads";
  if (c.web_api_source_platform) return SOURCE_PLATFORM_LABELS[c.web_api_source_platform] ?? c.web_api_source_name ?? "Website";
  if (c.web_api_source_name) return c.web_api_source_name;
  return c.source_channel ? channelLabel(c.source_channel) : "Direct";
}

function interestColor(level?: string | null): string {
  return level === "hot" ? "#EF4444" : level === "warm" ? "#F59E0B" : level === "cold" ? "#3B82F6" : "#9CA3AF";
}

// Buy-potential heat: green (high) / amber (mid) / grey (low).
function scoreColor(n: number): string {
  return n >= 70 ? "#2D8B73" : n >= 40 ? "#F59E0B" : "#9CA3AF";
}

// Toggleable table columns (Name and Actions are always shown). The picker
// defaults to the lead-focused set; metadata columns start hidden. The choice
// persists per browser in localStorage.
type ColKey =
  | "phone" | "stage" | "interest" | "score" | "agent" | "campaign" | "source"
  | "source_id" | "source_url" | "labels" | "channel" | "created" | "updated" | "blacklisted";
const CONTACT_COLUMNS: { key: ColKey; label: string; def: boolean }[] = [
  { key: "phone", label: "Phone", def: true },
  { key: "stage", label: "Stage", def: true },
  { key: "interest", label: "Interest", def: true },
  { key: "score", label: "Lead score", def: true },
  { key: "agent", label: "Agent", def: true },
  { key: "campaign", label: "Campaign", def: true },
  { key: "source", label: "Source", def: true },
  { key: "source_id", label: "Source ID", def: false },
  { key: "source_url", label: "Source URL", def: false },
  { key: "labels", label: "Labels", def: true },
  { key: "channel", label: "Channel", def: false },
  { key: "created", label: "Created", def: true },
  { key: "updated", label: "Updated", def: false },
  { key: "blacklisted", label: "Blacklisted", def: false },
];
const CONTACT_COLS_KEY = "simpulx_contact_cols";
const DEFAULT_COLS = CONTACT_COLUMNS.filter((c) => c.def).map((c) => c.key);

import { useI18n } from "@/lib/i18n";

export default function ContactsPage() {
  const { t } = useI18n();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [outcomeFor, setOutcomeFor] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterAgents, setFilterAgents] = useState<string[]>([]);
  const [filterCampaigns, setFilterCampaigns] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [modal, setModal] = useState<ModalState>(null);
  const [chatContact, setChatContact] = useState<Contact | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { confirm, ConfirmHost } = useConfirm();
  const { prompt, PromptHost } = usePrompt();
  const [orgTz, setOrgTz] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Bulk edit is a right-side drawer ("Edit N contacts"): pick Stage / Interest /
  // Agent (Stage reuses the dotted picker + the lost-reason wizard), then Apply
  // to all selected. undefined = leave that field unchanged.
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bStage, setBStage] = useState<string | undefined>(undefined);
  const [bLost, setBLost] = useState<{ reason: string; category: "lost" | "spam" } | undefined>(undefined);
  const [bInterest, setBInterest] = useState<string | undefined>(undefined);
  const [bAgent, setBAgent] = useState<string | null | undefined>(undefined);
  const [bulkOutcomeOpen, setBulkOutcomeOpen] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [editRect, setEditRect] = useState<DOMRect | null>(null);
  const openBulkEdit = (rect: DOMRect) => { setBStage(undefined); setBLost(undefined); setBInterest(undefined); setBAgent(undefined); setEditRect(rect); setBulkEditOpen(true); };
  const [tplOpen, setTplOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => new Set(DEFAULT_COLS));
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const show = (k: ColKey) => visibleCols.has(k);
  const colCount = 3 + visibleCols.size; // select + name + actions are always shown
  const toggleCol = (k: ColKey) => setVisibleCols((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    try { localStorage.setItem(CONTACT_COLS_KEY, JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });

  const router = useRouter();
  const { can } = usePermissions();
  const role = getUser()?.role;
  const showAgentFilter = role !== "agent";
  const showCampaignFilter = role === "admin" || role === "owner";
  const canCreate = can("create_contacts");
  const canEdit = can("edit_contacts");
  const canDelete = can("delete_contacts");
  const canExport = can("export_contacts");
  const canInitiate = can("initiate_chats");

  const reload = () => api.listContacts().then(setContacts).catch(() => {});
  useEffect(() => {
    Promise.all([
      api.listContacts().catch(() => []),
      showAgentFilter ? api.listAgents().catch(() => []) : Promise.resolve([]),
      showCampaignFilter ? api.listCampaigns().catch(() => []) : Promise.resolve([]),
    ]).then(([c, a, cm]) => { setContacts(c as Contact[]); setAgents(a as Agent[]); setCampaigns(cm as Campaign[]); setLoading(false); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Realtime: refresh when a lead changes (new message / status / stage /
  // assignment / delete). Debounced so a burst of events triggers one refetch.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const onWs = (e: Event) => {
      const type = (e as CustomEvent).detail?.type;
      if (["message.persisted", "conversation.updated", "conversation.assigned", "conversation.closed", "contact.deleted"].includes(type)) {
        if (t) clearTimeout(t);
        t = setTimeout(reload, 800);
      }
    };
    window.addEventListener("ws_message", onWs);
    return () => { window.removeEventListener("ws_message", onWs); if (t) clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.getOrganization().then((o) => setOrgTz(((o.settings as Record<string, string>)?.timezone) || "")).catch(() => {}); }, []);
  useEffect(() => { api.listStages().then((s) => setStages(s || [])).catch(() => {}); }, []);
  useEffect(() => { api.listDispositions().then((d) => setDispositions(d || [])).catch(() => {}); }, []);

  // Lead edits go through updateContact, which routes to the contact's
  // conversation when it has one, else to the contact-level fallback columns
  // (migration 0078) - so manual leads without a conversation are editable too.
  // Inline edits apply immediately (optimistic + API), confirmed by a snackbar.
  async function setStage(c: Contact, stageId: string) {
    const name = stages.find((s) => s.id === stageId)?.name ?? null;
    const prevStageId = c.stage_id, prevName = c.stage_name;
    setContacts((p) => p.map((x) => (x.id === c.id ? { ...x, stage_id: stageId || null, stage_name: name } : x)));
    try {
      await api.updateContact(c.id, { stage_id: stageId });
      setToast(name ? `Stage updated to ${name}` : "Stage cleared");
    } catch {
      setContacts((p) => p.map((x) => (x.id === c.id ? { ...x, stage_id: prevStageId, stage_name: prevName } : x)));
      setToast("Could not update stage");
    }
  }
  async function setInterest(c: Contact, level: string) {
    const prev = c.interest_level;
    setContacts((p) => p.map((x) => (x.id === c.id ? { ...x, interest_level: level || null } : x)));
    try {
      await api.updateContact(c.id, { interest_level: level });
      setToast(level ? `Interest set to ${level}` : "Interest cleared");
    } catch {
      setContacts((p) => p.map((x) => (x.id === c.id ? { ...x, interest_level: prev } : x)));
      setToast("Could not update interest");
    }
  }
  async function reassignAgent(c: Contact, agentId: string | null) {
    const prevAgentId = c.assigned_agent_id, prevAgentName = c.agent_name;
    const newAgent = agentId ? agents.find((a) => a.id === agentId) : null;
    setContacts((p) => p.map((x) => (x.id === c.id ? { ...x, assigned_agent_id: agentId, agent_name: newAgent?.full_name || null } : x)));
    try {
      await api.updateContact(c.id, { assigned_agent_id: agentId || "" });
      setToast(agentId ? `Assigned to ${newAgent?.full_name || "agent"}` : "Unassigned");
    } catch {
      setContacts((p) => p.map((x) => (x.id === c.id ? { ...x, assigned_agent_id: prevAgentId, agent_name: prevAgentName } : x)));
      setToast("Could not reassign");
    }
  }
  // Lost / Spam are terminal outcomes (dispositions), mirroring the inbox stage menu.
  async function markOutcome(c: Contact, reason: string, category: "lost" | "spam", didPurchase = false) {
    if (!c.conversation_id) { setToast("No conversation yet for this contact"); return; }
    const disp = category === "spam"
      ? dispositions.find((d) => d.category === "spam")
      : (dispositions.find((d) => d.name?.toLowerCase() === "lost") || dispositions.find((d) => d.category === "lost"));
    // All outcomes (lost + spam) route to a terminal lost stage for consistency.
    const wantKey = (category === "lost" && didPurchase) ? "lost_purchase" : "lost_not_purchase";
    const lostStage = stages.find((s) => s.system_key === wantKey)
      || stages.find((s) => s.name?.toLowerCase().startsWith("lost"));
    const patch: Record<string, string> = { lost_reason: reason, status: "closed" };
    if (disp) patch.disposition_id = disp.id;
    if (lostStage) patch.stage_id = lostStage.id;
    try {
      await api.patchConversation(c.conversation_id, patch);
      setToast(category === "spam" ? "Marked as spam" : "Marked as lost");
      reload();
    } catch { setToast("Could not update"); }
  }
  // Close row / add / columns menus on outside click.
  useEffect(() => {
    // NB: bulkMenu is a portal with its own backdrop; don't close it here or the
    // opening click would immediately shut it (making items unclickable).
    const onDoc = () => { setMenuId(null); setAddMenuOpen(false); setColsMenuOpen(false); };
    window.addEventListener("click", onDoc);
    return () => window.removeEventListener("click", onDoc);
  }, []);

  // Restore the saved column visibility (client-only, so it never mismatches SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONTACT_COLS_KEY);
      if (raw) {
        const keys = (JSON.parse(raw) as string[]).filter((k) => CONTACT_COLUMNS.some((c) => c.key === k));
        setVisibleCols(new Set(keys));
      }
    } catch { /* ignore */ }
  }, []);

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort().map((t) => ({ value: t, label: t }));
  }, [contacts]);
  const agentOptions = useMemo(() => [{ value: "__unassigned__", label: t("common.unassigned") }, ...agents.map((a) => ({ value: a.id, label: a.full_name }))], [agents]);
  const campaignOptions = useMemo(() => campaigns.map((c) => ({ value: c.id, label: c.name })), [campaigns]);

  const filtered = useMemo(() => {
    let list = contacts;
    if (query) list = list.filter((c) => (c.full_name || c.phone || "").toLowerCase().includes(query.toLowerCase()) || (c.phone || "").includes(query));
    if (filterTags.length) list = list.filter((c) => (c.tags || []).some((t) => filterTags.includes(t)));
    if (filterAgents.length) list = list.filter((c) => filterAgents.includes(c.assigned_agent_id || "__unassigned__"));
    if (filterCampaigns.length) list = list.filter((c) => c.campaign_id && filterCampaigns.includes(c.campaign_id));
    return list;
  }, [contacts, query, filterTags, filterAgents, filterCampaigns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paged = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  useEffect(() => { setPage(1); }, [query, filterTags, filterAgents, filterCampaigns]);

  const activeFilters = filterTags.length + filterAgents.length + filterCampaigns.length;
  const clearFilters = () => { setFilterTags([]); setFilterAgents([]); setFilterCampaigns([]); };

  function exportCsv() {
    if (filtered.length === 0) { setToast("Nothing to export"); return; }
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Name", "Phone", "Channel", "Stage", "Interest level", "Lost reason", "Lead score", "Agent", "Campaign", "Source", "Source Id", "Source Url", "Labels", "Blacklisted", "Created", "Updated"];
    const lines = filtered.map((c) => [
      c.full_name, c.phone, c.channel_name, c.stage_name, c.interest_level, c.lost_reason,
      c.lead_score ?? "", c.agent_name, c.campaign_name, sourceLabel(c), c.source_id, c.source_url,
      (c.tags || []).join("; "), c.blacklisted ? "Yes" : "No",
      fmtExportTs(c.created_at, orgTz), fmtExportTs(c.updated_at, orgTz),
    ].map(esc).join(","));
    const csv = [head.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    setToast(`Exported ${filtered.length} contact${filtered.length === 1 ? "" : "s"}`);
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (rows.length === 0) { setToast("Empty file"); return; }
    // Detect header; map name/phone columns.
    const header = rows[0].toLowerCase();
    const hasHeader = /name|phone|nama|telepon|nomor/.test(header);
    const cols = hasHeader ? rows[0].split(",").map((h) => h.trim().toLowerCase()) : [];
    const nameIdx = cols.findIndex((h) => /name|nama/.test(h));
    const phoneIdx = cols.findIndex((h) => /phone|telepon|nomor|wa/.test(h));
    const dataRows = hasHeader ? rows.slice(1) : rows;
    let ok = 0;
    setToast("Importing...");
    for (const line of dataRows) {
      const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
      const full_name = nameIdx >= 0 ? parts[nameIdx] : (parts.length > 1 ? parts[0] : "");
      const phone = phoneIdx >= 0 ? parts[phoneIdx] : (parts.length > 1 ? parts[1] : parts[0]);
      if (!full_name && !phone) continue;
      try { await api.createContact({ full_name: full_name || undefined, phone: (phone || "").replace(/[^\d+]/g, "") || undefined }); ok++; } catch { /* skip dup/invalid */ }
    }
    await reload();
    setToast(`Imported ${ok} contact${ok === 1 ? "" : "s"}`);
  }

  async function remove(c: Contact) {
    if (!(await confirm({ title: "Delete contact?", message: `This removes "${c.full_name || c.phone}" and its conversations. This cannot be undone.`, danger: true, confirmLabel: "Delete" }))) return;
    try { await api.deleteContact(c.id); setContacts((p) => p.filter((x) => x.id !== c.id)); setToast("Contact deleted"); }
    catch (e: any) { setToast(e?.message || "Delete failed"); }
  }

  // ── Bulk actions ──
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSel = () => setSelected(new Set());
  async function bulkDelete() {
    if (!(await confirm({ title: `Delete ${selected.size} contact(s)?`, message: "This also removes their conversations. This cannot be undone.", danger: true, confirmLabel: "Delete" }))) return;
    setBulkBusy(true);
    const ids = [...selected];
    await Promise.allSettled(ids.map((id) => api.deleteContact(id)));
    setContacts((p) => p.filter((c) => !selected.has(c.id)));
    clearSel(); setBulkBusy(false); setToast(`${ids.length} contact(s) deleted`);
  }
  async function bulkBlacklist() {
    setBulkBusy(true);
    const ids = [...selected];
    await Promise.allSettled(ids.map((id) => api.updateContact(id, { blacklisted: true })));
    setContacts((p) => p.map((c) => (selected.has(c.id) ? { ...c, blacklisted: true } : c)));
    clearSel(); setBulkBusy(false); setToast(`${ids.length} contact(s) blacklisted`);
  }
  async function bulkLabel() {
    const label = await prompt({ title: "Add label", message: "Add a label to the selected contacts.", placeholder: "e.g. VIP, Follow-up", confirmLabel: "Add label" });
    if (!label || !label.trim()) return;
    const l = label.trim();
    setBulkBusy(true);
    const ids = [...selected];
    await Promise.allSettled(ids.map((id) => {
      const c = contacts.find((x) => x.id === id);
      const tags = Array.from(new Set([...((c?.tags as string[]) || []), l]));
      return api.updateContact(id, { tags });
    }));
    reload(); clearSel(); setBulkBusy(false); setToast(`Label "${l}" added to ${ids.length}`);
  }
  // Bulk stage / interest / agent via the dedicated endpoint, which routes each
  // change through the contact's conversation (attribution) when one exists.
  // Apply the drawer's picked fields to every selected contact. Stage/interest/
  // agent go through one bulk update; a lost/spam outcome is applied per contact
  // (it needs the conversation) with the chosen reason.
  const bulkEditDirty = bStage !== undefined || bLost !== undefined || bInterest !== undefined || bAgent !== undefined;
  const onStagePick = (v: string) => {
    if (v === "__lost__") { setBulkOutcomeOpen(true); return; }
    setBStage(v || undefined); setBLost(undefined);
  };
  async function applyBulkEdit() {
    if (!bulkEditDirty) return;
    const ids = [...selected];
    setBulkApplying(true);
    try {
      const set: { stage_id?: string; interest_level?: string; assigned_agent_id?: string } = {};
      if (bStage !== undefined) set.stage_id = bStage;
      if (bInterest !== undefined) set.interest_level = bInterest;
      if (bAgent !== undefined) set.assigned_agent_id = bAgent ?? "";
      if (Object.keys(set).length) await api.bulkUpdateContacts({ contact_ids: ids, set });
      if (bLost) {
        const disp = bLost.category === "spam"
          ? dispositions.find((d) => d.category === "spam")
          : (dispositions.find((d) => d.name?.toLowerCase() === "lost") || dispositions.find((d) => d.category === "lost"));
        const lostStage = stages.find((s) => s.system_key === "lost_not_purchase");
        const targets = contacts.filter((c) => selected.has(c.id) && c.conversation_id);
        await Promise.allSettled(targets.map((c) => {
          const patch: Record<string, string> = { lost_reason: bLost.reason, status: "closed" };
          if (disp) patch.disposition_id = disp.id;
          if (lostStage) patch.stage_id = lostStage.id;
          return api.patchConversation(c.conversation_id!, patch);
        }));
      }
      setToast(`Updated ${ids.length} contact${ids.length === 1 ? "" : "s"}`);
      setBulkEditOpen(false); clearSel(); reload();
    } catch {
      setToast("Could not update selection");
    } finally {
      setBulkApplying(false);
    }
  }
  async function toggleBlacklist(c: Contact) {
    const next = !c.blacklisted;
    setContacts((p) => p.map((x) => (x.id === c.id ? { ...x, blacklisted: next } : x)));
    try { await api.updateContact(c.id, { blacklisted: next }); setToast(next ? "Contact blacklisted" : "Removed from blacklist"); }
    catch { setContacts((p) => p.map((x) => (x.id === c.id ? { ...x, blacklisted: !next } : x))); setToast("Update failed"); }
  }

  const TH = ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    <th className={cn("px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap", className)}>{children}</th>;

  return (
    <div className="h-full flex flex-col px-4 pt-4 pb-4 min-h-0">
      <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden flex flex-col flex-1 min-h-0">
        {/* Toolbar */}
        <div className="p-3 flex items-center gap-2 border-b border-border shrink-0 flex-wrap">
          <div className="relative w-[280px] max-w-[45vw]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder={t("contacts.searchNameOrPhone")} value={query} onChange={(e) => setQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <MultiSelect value={filterTags} onChange={setFilterTags} placeholder={t("contacts.allLabels")} options={tagOptions} className="w-[150px]" />
          {showAgentFilter && <MultiSelect value={filterAgents} onChange={setFilterAgents} placeholder={t("common.allAgents")} options={agentOptions} className="w-[150px]" />}
          {showCampaignFilter && <MultiSelect value={filterCampaigns} onChange={setFilterCampaigns} placeholder={t("common.allCampaigns")} options={campaignOptions} className="w-[160px]" />}
          {activeFilters > 0 && <button onClick={clearFilters} className="text-[11px] font-semibold text-primary hover:underline outline-none">{t("common.clear")}</button>}
          <div className="flex-1" />
          <div className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setColsMenuOpen((o) => !o)} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border bg-background text-[13px] font-medium text-foreground hover:bg-muted outline-none transition-colors">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />Columns
            </button>
            {colsMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-popover border border-border rounded-lg shadow-xl z-50 py-1.5 animate-scale-in origin-top-right max-h-[70vh] overflow-auto">
                <div className="flex items-center justify-between px-3 py-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Columns</span>
                  <button onClick={() => { setVisibleCols(new Set(DEFAULT_COLS)); try { localStorage.setItem(CONTACT_COLS_KEY, JSON.stringify(DEFAULT_COLS)); } catch { /* ignore */ } }} className="text-[11px] font-semibold text-primary hover:underline outline-none">Reset</button>
                </div>
                {CONTACT_COLUMNS.map((col) => (
                  <button key={col.key} onClick={() => toggleCol(col.key)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-foreground hover:bg-muted outline-none">
                    <span className={cn("w-4 h-4 rounded border grid place-items-center shrink-0", show(col.key) ? "bg-primary border-primary text-white" : "border-input")}>
                      {show(col.key) && <Check className="w-3 h-3" />}
                    </span>
                    {col.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {canCreate && (
            <div className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setModal({ mode: "add" })} className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-l-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none">
                <UserPlus className="w-4 h-4" />{t("contacts.addContact")}
              </button>
              <button aria-label="More add options" onClick={() => setAddMenuOpen((o) => !o)} className="px-2 h-9 bg-primary text-white rounded-r-md border-l border-white/20 hover:bg-primary-dark outline-none transition-colors">
                <ChevronDown className="w-4 h-4" />
              </button>
              {addMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-popover border border-border rounded-lg shadow-xl z-50 py-1 animate-scale-in origin-top-right">
                  <button onClick={() => { setAddMenuOpen(false); importRef.current?.click(); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted outline-none">
                    <Upload className="w-4 h-4 text-muted-foreground" />{t("contacts.importCsv")}
                  </button>
                  {canExport && (
                    <button onClick={() => { setAddMenuOpen(false); exportCsv(); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted outline-none">
                      <Download className="w-4 h-4 text-muted-foreground" />{t("contacts.export")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
        </div>

        {/* Bulk action bar — floating, sticky at the bottom-center */}
        {selected.size > 0 && (
          <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 bottom-16">
            <div className="pointer-events-auto flex items-center gap-1 max-w-[calc(100vw-2rem)] overflow-x-auto rounded-xl border border-border bg-popover/95 backdrop-blur px-2 py-2 shadow-2xl ring-1 ring-black/5 animate-toast-in">
              <div className="flex items-center gap-2 pl-1.5 pr-2 shrink-0">
                <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary text-white text-[12px] font-bold tabular-nums">{selected.size}</span>
                <span className="text-[13px] font-semibold text-foreground whitespace-nowrap">{t("contacts.selected")}</span>
              </div>
              <div className="w-px h-6 bg-border mx-0.5 shrink-0" />
              {canEdit && <button onClick={(e) => openBulkEdit(e.currentTarget.getBoundingClientRect())} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-[13px] font-medium hover:bg-muted shrink-0"><Pencil className="w-3.5 h-3.5" />Edit</button>}
              {canInitiate && <button onClick={() => setTplOpen(true)} disabled={bulkBusy} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-[13px] font-medium hover:bg-muted disabled:opacity-50 shrink-0"><Send className="w-3.5 h-3.5" />Send Template</button>}
              {canEdit && <button onClick={bulkLabel} disabled={bulkBusy} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-[13px] font-medium hover:bg-muted disabled:opacity-50 shrink-0"><TagIcon className="w-3.5 h-3.5" />{t("contacts.addLabel")}</button>}
              {canEdit && <button onClick={bulkBlacklist} disabled={bulkBusy} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-border text-[13px] font-medium hover:bg-muted disabled:opacity-50 shrink-0"><Ban className="w-3.5 h-3.5" />{t("contacts.blacklist")}</button>}
              {canDelete && <button onClick={bulkDelete} disabled={bulkBusy} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-destructive/40 text-destructive text-[13px] font-medium hover:bg-destructive/10 disabled:opacity-50 shrink-0"><Trash2 className="w-3.5 h-3.5" />{t("common.delete")}</button>}
              <div className="w-px h-6 bg-border mx-0.5 shrink-0" />
              <button onClick={clearSel} aria-label="Clear selection" className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* Table (fills remaining height) */}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-[13px] whitespace-nowrap">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted">
                <TH className="w-10"><span className="sr-only">Select</span><input type="checkbox" aria-label="Select all contacts" className="rounded border-input accent-primary" checked={paged.length > 0 && paged.every((c) => selected.has(c.id))} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) paged.forEach((c) => n.add(c.id)); else paged.forEach((c) => n.delete(c.id)); return n; })} /></TH>
                <TH>{t("contacts.contactName")}</TH>
                {show("phone") && <TH>{t("contacts.phone")}</TH>}
                {show("stage") && <TH>{t("contacts.stage")}</TH>}
                {show("interest") && <TH>{t("contacts.interest")}</TH>}
                {show("score") && <TH>Lead score</TH>}
                {show("agent") && <TH>{t("contacts.agent")}</TH>}
                {show("campaign") && <TH>{t("settings.campaigns")}</TH>}
                {show("source") && <TH>{t("contacts.source")}</TH>}
                {show("source_id") && <TH>Source ID</TH>}
                {show("source_url") && <TH>Source URL</TH>}
                {show("labels") && <TH>Labels</TH>}
                {show("channel") && <TH>Channel</TH>}
                {show("created") && <TH>{t("contacts.created")}</TH>}
                {show("updated") && <TH>Updated</TH>}
                {show("blacklisted") && <TH>Blacklisted</TH>}
                <TH className="text-right">{t("common.actions")}</TH>
              </tr>
            </thead>
            <tbody>
              {loading ? Array(8).fill(0).map((_, i) => (
                <tr key={i}><td colSpan={colCount} className="px-3 py-2"><div className="h-9 skeleton rounded-md" /></td></tr>
              )) : paged.length === 0 ? (
                <tr><td colSpan={colCount} className="text-center py-16">
                  <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3"><Users className="w-6 h-6 text-muted-foreground/50" /></div>
                  <p className="font-semibold text-foreground mb-0.5">{t("contacts.noContactsFound")}</p>
                  <p className="text-sm text-muted-foreground">{query || activeFilters ? "Try different filters." : "New contacts will appear here."}</p>
                </td></tr>
              ) : paged.map((c) => (
                <tr key={c.id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${c.full_name || c.phone || "contact"}`} className="rounded border-input accent-primary" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: avatarColor(c.full_name || c.phone) }}>
                        {initials(c.full_name || c.phone)}
                      </div>
                      <button onClick={() => router.push(`/contacts/${c.id}`)} className="font-semibold text-[13px] text-foreground truncate max-w-[180px] text-left hover:text-primary hover:underline outline-none">{c.full_name || c.phone || "Unknown"}</button>
                    </div>
                  </td>
                  {show("phone") && <td className="px-3 py-2 font-medium text-foreground/90 tabular-nums whitespace-nowrap">{c.phone || "-"}</td>}
                  {show("stage") && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    {canEdit && c.conversation_id ? (
                      <div className="inline-flex items-center h-7 rounded-md border border-border bg-background overflow-hidden">
                        <StageMenu
                          stages={stages}
                          currentStageId={c.stage_id || null}
                          onSelect={(id) => setStage(c, id)}
                          onMarkOutcome={() => setOutcomeFor(c)}
                        />
                      </div>
                    ) : c.stage_name ? (
                      <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary">{stageLabelByName(t, stages, c.stage_name)}</span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                  )}
                  {show("interest") && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    {canEdit && c.conversation_id ? (
                      <Select value={c.interest_level || ""} searchable={false} onChange={(v) => setInterest(c, v)} className="w-[104px]"
                        options={[{ value: "", label: "Unset" }, { value: "hot", label: "Hot", dot: interestColor("hot") }, { value: "warm", label: "Warm", dot: interestColor("warm") }, { value: "cold", label: "Cold", dot: interestColor("cold") }]} />
                    ) : c.interest_level ? (
                      <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize"
                        style={{ backgroundColor: interestColor(c.interest_level) + "1A", color: interestColor(c.interest_level) }}>{c.interest_level}</span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                  )}
                  {show("score") && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    {typeof c.lead_score === "number" ? (
                      <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums"
                        style={{ backgroundColor: scoreColor(c.lead_score) + "1A", color: scoreColor(c.lead_score) }}>{c.lead_score}</span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                  )}
                  {show("agent") && (
                  <td className="px-3 py-2 text-foreground/80 whitespace-nowrap">
                    {showAgentFilter && c.conversation_id ? (
                      <AgentAssignCell
                        agentName={c.agent_name || null}
                        assignedAgentId={c.assigned_agent_id || null}
                        agents={agents}
                        onReassign={(agentId) => reassignAgent(c, agentId)}
                        onUnassign={() => reassignAgent(c, null)}
                      />
                    ) : (c.agent_name || <span className="text-muted-foreground">{t("common.unassigned")}</span>)}
                  </td>
                  )}
                  {show("campaign") && <td className="px-3 py-2 text-foreground/80 whitespace-nowrap">{c.campaign_name || <span className="text-muted-foreground">-</span>}</td>}
                  {show("source") && <td className="px-3 py-2 text-foreground/80 whitespace-nowrap">{sourceLabel(c)}</td>}
                  {show("source_id") && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.source_id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-[12px] text-foreground/80 max-w-[130px] truncate">{c.source_id}</span>
                        <button onClick={() => { navigator.clipboard?.writeText(c.source_id!); setToast(t("contacts.sourceIdCopied")); }} className="p-0.5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted" aria-label="Copy source id"><Copy className="w-3.5 h-3.5" /></button>
                      </span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                  )}
                  {show("source_url") && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.source_url ? <a href={c.source_url} target="_blank" rel="noreferrer" className="text-[12px] text-primary hover:underline">Link</a> : <span className="text-muted-foreground">-</span>}
                  </td>
                  )}
                  {show("labels") && (
                  <td className="px-3 py-2">
                    {(c.tags && c.tags.length) ? (
                      <div className="flex flex-wrap gap-1 max-w-[160px]">
                        {c.tags.slice(0, 2).map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-semibold"><TagIcon className="w-2.5 h-2.5" />{t}</span>
                        ))}
                        {c.tags.length > 2 && <span className="text-[10px] text-muted-foreground font-semibold">+{c.tags.length - 2}</span>}
                      </div>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                  )}
                  {show("channel") && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold"
                      style={{ backgroundColor: channelColor(c.source_channel) + "15", color: channelTextColor(c.source_channel) }}>
                      {c.channel_name || channelLabel(c.source_channel)}
                    </span>
                  </td>
                  )}
                  {show("created") && <td className="px-3 py-2 text-muted-foreground text-[12px] whitespace-nowrap">{fmtDateTimeShort(c.created_at)}</td>}
                  {show("updated") && <td className="px-3 py-2 text-muted-foreground text-[12px] whitespace-nowrap">{c.updated_at ? fmtDateTimeShort(c.updated_at) : "-"}</td>}
                  {show("blacklisted") && (
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold", c.blacklisted ? "bg-red-50 text-red-600" : "bg-muted text-muted-foreground")}>
                      {c.blacklisted ? t("common.yes") : t("common.no")}
                    </span>
                  </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                      <button aria-label="Contact actions" onClick={() => setMenuId(menuId === c.id ? null : c.id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground outline-none transition-colors"><MoreVertical className="w-4 h-4" /></button>
                      {menuId === c.id && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded-lg shadow-xl z-20 py-1 animate-scale-in origin-top-right">
                          <button onClick={() => { setMenuId(null); router.push(`/contacts/${c.id}`); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted outline-none"><Eye className="w-4 h-4 text-muted-foreground" />{t("contacts.viewDetails")}</button>
                          {canEdit && <button onClick={() => { setMenuId(null); setModal({ mode: "edit", contact: c }); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted outline-none"><Pencil className="w-4 h-4 text-muted-foreground" />{t("common.edit")}</button>}
                          <button disabled={!c.conversation_id} onClick={() => { setMenuId(null); setChatContact(c); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted outline-none disabled:opacity-40 disabled:cursor-not-allowed"><MessageSquare className="w-4 h-4 text-muted-foreground" />{t("contacts.chat")}</button>
                          {canEdit && <button onClick={() => { setMenuId(null); toggleBlacklist(c); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-muted outline-none"><Users className="w-4 h-4 text-muted-foreground" />{c.blacklisted ? t("contacts.unblacklist") : t("contacts.blacklist")}</button>}
                          {canDelete && <button onClick={() => { setMenuId(null); remove(c); }} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-destructive hover:bg-muted outline-none"><Trash2 className="w-4 h-4" />{t("common.delete")}</button>}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center gap-2 py-3 px-4 border-t border-border shrink-0">
          <span className="text-[13px] font-semibold text-muted-foreground tabular-nums shrink-0">{filtered.length} contact{filtered.length === 1 ? "" : "s"}</span>
          <div className="flex-1 flex justify-center items-center gap-1 min-w-[160px]">
            <button aria-label="First page" disabled={page <= 1} onClick={() => setPage(1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 outline-none"><ChevronsLeft className="w-[18px] h-[18px]" /></button>
            <button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 outline-none"><ChevronLeft className="w-[18px] h-[18px]" /></button>
            <span className="px-3 py-1 rounded-md border border-primary/40 text-primary text-[13px] font-bold min-w-[32px] text-center tabular-nums">{page}</span>
            <span className="text-[13px] text-muted-foreground tabular-nums">/ {totalPages}</span>
            <button aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 outline-none"><ChevronRight className="w-[18px] h-[18px]" /></button>
            <button aria-label="Last page" disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="p-1 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30 outline-none"><ChevronsRight className="w-[18px] h-[18px]" /></button>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Per page</span>
            <Select value={String(rowsPerPage)} onChange={(v) => { setRowsPerPage(Number(v)); setPage(1); }}
              options={[50, 100, 200, 500].map((n) => ({ value: String(n), label: String(n) }))} className="w-[88px]" align="right" searchable={false} />
          </div>
        </div>
      </div>

      {modal && (
        <ContactModal state={modal} allTags={tagOptions.map((t) => t.value)}
          onClose={() => setModal(null)} onSaved={(msg) => { setModal(null); reload(); setToast(msg); }} />
      )}
      {chatContact && <ChatPopup contact={chatContact} onClose={() => setChatContact(null)} notify={(m) => setToast(m)} />}
      <SendTemplateDrawer open={tplOpen} onClose={() => setTplOpen(false)} contactIds={[...selected]}
        onSent={(msg) => { setTplOpen(false); setToast(msg); clearSel(); reload(); }} />
      <LostReasonDialog
        open={!!outcomeFor}
        onClose={() => setOutcomeFor(null)}
        onSubmit={(reason, category) => { if (outcomeFor) markOutcome(outcomeFor, reason, category); setOutcomeFor(null); }}
      />

      {/* Bulk edit: a compact popover above the Edit button — Stage / Interest /
          Agent dropdowns + Apply. */}
      {bulkEditOpen && editRect && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setBulkEditOpen(false)} />
          <div className="fixed z-[71] w-[300px] bg-popover border border-border rounded-xl shadow-2xl p-3.5 animate-scale-in"
            style={{
              left: Math.min(Math.max(8, editRect.left + editRect.width / 2 - 150), window.innerWidth - 308),
              bottom: window.innerHeight - editRect.top + 8,
            }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-bold text-foreground">Edit {selected.size} contact{selected.size === 1 ? "" : "s"}</p>
              <button onClick={() => setBulkEditOpen(false)} className="p-0.5 rounded text-muted-foreground hover:text-foreground outline-none"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-col gap-3">
              {canEdit && stages.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Stage</label>
                  <Select value={bLost ? "__lost__" : (bStage ?? "")} onChange={onStagePick} placeholder="Leave unchanged"
                    options={[
                      ...stages.filter((s) => !(s.system_key || "").startsWith("lost") && !s.name.toLowerCase().startsWith("lost")).map((s) => ({ value: s.id, label: s.name, dot: getDotColor(s.name) })),
                      { value: "__lost__", label: "Mark as lost / spam", dot: "#DC2626" },
                    ]} />
                </div>
              )}
              {canEdit && (
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Interest</label>
                  <Select value={bInterest ?? ""} onChange={(v) => setBInterest(v || undefined)} placeholder="Leave unchanged"
                    options={[{ value: "hot", label: "Hot", dot: interestColor("hot") }, { value: "warm", label: "Warm", dot: interestColor("warm") }, { value: "cold", label: "Cold", dot: interestColor("cold") }]} />
                </div>
              )}
              {showAgentFilter && (
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Agent</label>
                  <Select value={bAgent === null ? "__unassign__" : (bAgent ?? "")} onChange={(v) => setBAgent(v === "__unassign__" ? null : (v || undefined))} placeholder="Leave unchanged"
                    options={[{ value: "__unassign__", label: "Unassign" }, ...agents.map((a) => ({ value: a.id, label: a.full_name }))]} />
                </div>
              )}
              {bLost && <p className="text-[11px] text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3" />Mark as lost: {bLost.reason}</p>}
              <button onClick={applyBulkEdit} disabled={!bulkEditDirty || bulkApplying}
                className="mt-0.5 w-full h-9 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark disabled:opacity-50 inline-flex items-center justify-center gap-1.5 outline-none">
                {bulkApplying && <Loader2 className="w-4 h-4 animate-spin" />}Apply to {selected.size}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
      {bulkOutcomeOpen && (
        <LostReasonDialog open onClose={() => setBulkOutcomeOpen(false)}
          onSubmit={(reason, category) => { setBLost({ reason, category }); setBStage(undefined); setBulkOutcomeOpen(false); }} />
      )}

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
      {ConfirmHost}
      {PromptHost}
    </div>
  );
}

// ── Full inbox-grade chat popup ─────────────────────────────────────────────
// Reuses the inbox MessageBubble + Composer and listens to the app-wide WebSocket
// so the contacts quick-chat behaves exactly like the inbox (media, voice, calls,
// AI assist, attachments, live updates) instead of a stripped-down clone.
function ChatPopup({ contact, onClose, notify }: {
  contact: Contact; onClose: () => void; notify: (m: string, s?: "success" | "info" | "warning" | "error") => void;
}) {
  const convId = contact.conversation_id!;
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<(string | null)[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const reload = () => api.getMessages(convId).then((m) => setMessages(m || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => {
    reload();
    api.listConversations().then((l) => setActive((l || []).find((c) => c.id === convId) ?? null)).catch(() => {});
  }, [convId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Live updates: the app-wide WebSocket (Shell) dispatches "ws_message" on the window.
  useEffect(() => {
    const onWS = (e: Event) => {
      const ev = (e as CustomEvent).detail; const data = ev?.data || ev;
      if (data?.conversation_id === convId || ev?.conversation_id === convId) reload();
    };
    window.addEventListener("ws_message", onWS);
    return () => window.removeEventListener("ws_message", onWS);
  }, [convId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages]);

  const activeConv = (active || ({ id: convId, contact_name: contact.full_name, contact_phone: contact.phone, channel: contact.source_channel, status: "open" } as unknown)) as Conversation;

  function fileTooBig(f: File): string | null {
    const mb = f.size / (1024 * 1024);
    let max = 100, label = "File";
    if (f.type.startsWith("image/")) { max = 5; label = "Image"; }
    else if (f.type.startsWith("video/")) { max = 16; label = "Video"; }
    else if (f.type.startsWith("audio/")) { max = 16; label = "Audio"; }
    return mb > max ? `${label} too large (${mb.toFixed(1)} MB). Max ${max} MB.` : null;
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;
    const ok: File[] = [];
    for (const f of files) { const t = fileTooBig(f); if (t) { notify(t, "warning"); continue; } ok.push(f); }
    if (!ok.length) return;
    setPendingFiles((p) => [...p, ...ok]);
    setPendingPreviews((p) => [...p, ...ok.map((f) => (f.type.startsWith("image/") || f.type.startsWith("video/")) ? URL.createObjectURL(f) : null)]);
  }
  function removePendingFile(i: number) {
    setPendingFiles((p) => p.filter((_, x) => x !== i));
    setPendingPreviews((p) => { const c = [...p]; if (c[i]) URL.revokeObjectURL(c[i]!); c.splice(i, 1); return c; });
  }
  function cancelSendFile() {
    pendingPreviews.forEach((p) => p && URL.revokeObjectURL(p));
    setPendingFiles([]); setPendingPreviews([]);
  }
  async function confirmSendFile() {
    if (!pendingFiles.length) return;
    setBusy(true); setUploadProgress(0);
    try {
      const ups: { url: string; type: string; name: string }[] = [];
      for (const f of pendingFiles) ups.push(await api.uploadFile(f, (pct) => setUploadProgress(pct)));
      for (let i = 0; i < ups.length; i++) await api.sendMedia(convId, ups[i].type, ups[i].url, i === 0 ? draft.trim() : "");
      pendingPreviews.forEach((p) => p && URL.revokeObjectURL(p));
      setDraft(""); setPendingFiles([]); setPendingPreviews([]); await reload();
    } catch (err) { notify(err instanceof Error ? err.message : "Upload failed", "error"); }
    finally { setBusy(false); setUploadProgress(null); }
  }
  async function submit() {
    if (pendingFiles.length) { await confirmSendFile(); return; }
    if (!draft.trim()) return;
    if (tab === 1) { try { await api.addNote(convId, draft.trim()); setDraft(""); notify("Note added"); } catch { notify("Could not add note", "error"); } return; }
    setBusy(true);
    try { await api.sendMessage(convId, draft.trim()); setDraft(""); await reload(); }
    catch { notify("Failed to send", "error"); } finally { setBusy(false); }
  }
  async function sendVoice(blob: Blob) {
    setBusy(true);
    try {
      const file = new File([blob], "voice_message.webm", { type: "audio/webm" });
      const up = await api.uploadFile(file);
      await api.sendMedia(convId, "audio", up.url, "");
      await reload();
    } catch (err) { notify("Voice error: " + (err instanceof Error ? err.message : "Unknown"), "error"); }
    finally { setBusy(false); }
  }

  const previewMsg = messages.find((m) => m.id === previewId);
  const previewUrl = previewMsg?.media_url ? rewriteLocalMedia(previewMsg.media_url) : "";
  const previewIsVideo = !!previewMsg && (previewMsg.type === "video" || /\.(mp4|mov|webm|avi|mkv)$/i.test(previewMsg.media_url || ""));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative w-[540px] max-w-full h-[660px] max-h-[90vh] rounded-xl border border-border bg-card shadow-2xl animate-scale-in flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold text-white"
            style={{ backgroundColor: avatarColor(contact.full_name || contact.phone) }}>
            {initials(contact.full_name || contact.phone)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-[14px] text-foreground truncate">{contact.full_name || contact.phone || "Unknown"}</p>
            <p className="text-[11.5px] text-muted-foreground tabular-nums">{contact.phone}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><X className="w-[18px] h-[18px]" /></button>
        </div>

        {/* Messages */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 py-3 bg-muted/30">
          {loading ? (
            <div className="h-full grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : messages.length === 0 ? (
            <p className="text-center text-[13px] text-muted-foreground py-8">No messages yet.</p>
          ) : (
            <div className="space-y-1">
              {messages.map((m) => (
                <MessageBubble key={m.id} m={m} active={activeConv} conversationId={convId}
                  onPreviewMedia={(id) => setPreviewId(id)}
                  onCopyText={(t) => { navigator.clipboard.writeText(t); notify("Copied to clipboard", "info"); }}
                  onUseInComposer={(t) => setDraft(t)} />
              ))}
            </div>
          )}
        </div>

        {/* Composer (the real inbox composer) */}
        <Composer
          draft={draft} setDraft={setDraft}
          tab={tab} setTab={setTab}
          quickReplies={[]}
          pendingFiles={pendingFiles} pendingPreviews={pendingPreviews}
          fileRef={fileRef} onFile={onFile} cancelSendFile={cancelSendFile} removePendingFile={removePendingFile}
          busy={busy} onSubmit={submit} onSendVoice={sendVoice} notify={notify}
          windowExpired={activeConv?.channel === "whatsapp" && !!activeConv?.last_message_at && (Date.now() - new Date(activeConv.last_message_at).getTime() > 24 * 60 * 60 * 1000)}
          phone={contact.phone} conversationId={convId}
          aiSummary={activeConv?.lead_summary}
          uploadProgress={uploadProgress}
          onAddNote={async (body) => { await api.addNote(convId, body); notify("Note added"); }}
        />
      </div>

      {/* Media preview */}
      {previewMsg && previewUrl && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 animate-fade-in" onClick={() => setPreviewId(null)}>
          {previewIsVideo
            ? <video src={previewUrl} controls autoPlay className="max-w-[90vw] max-h-[85vh] rounded-md" onClick={(e) => e.stopPropagation()} />
            : <img src={previewUrl} className="max-w-[90vw] max-h-[85vh] object-contain rounded-md" onClick={(e) => e.stopPropagation()} alt="" />}
        </div>
      )}
    </div>
  );
}

const INPUT_CLS = "w-full h-10 px-3 rounded-md border border-input bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

function ContactModal({ state, allTags, onClose, onSaved }: {
  state: Exclude<ModalState, null>; allTags: string[]; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const editing = state.mode === "edit";
  const [name, setName] = useState(editing ? state.contact.full_name ?? "" : "");
  const [phone, setPhone] = useState(editing ? state.contact.phone ?? "" : "");
  const [tags, setTags] = useState<string[]>(editing ? state.contact.tags ?? [] : []);
  const [tagDraft, setTagDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [fields, setFields] = useState<CustomField[]>([]);
  const [attrs, setAttrs] = useState<Record<string, string>>(() => {
    const src = (editing ? state.contact.attributes : null) ?? {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) out[k] = v == null ? "" : String(v);
    return out;
  });
  useEffect(() => { api.listCustomFields().then(setFields).catch(() => {}); }, []);

  const addTag = (raw: string) => { const t = raw.trim().replace(/,$/, ""); if (t && !tags.includes(t)) setTags((p) => [...p, t]); setTagDraft(""); };
  const suggestions = allTags.filter((t) => !tags.includes(t) && t.toLowerCase().includes(tagDraft.toLowerCase()) && tagDraft.trim()).slice(0, 6);

  async function save() {
    if (!name.trim() && !phone.trim()) { setErr("Enter a name or phone."); return; }
    setSaving(true); setErr("");
    const attributes: Record<string, string> = {};
    for (const f of fields) attributes[f.key] = (attrs[f.key] ?? "").trim();
    try {
      if (editing) { await api.updateContact(state.contact.id, { full_name: name.trim(), phone: phone.trim(), tags, attributes }); onSaved("Contact updated"); }
      else { await api.createContact({ full_name: name.trim(), phone: phone.trim(), tags, attributes }); onSaved("Contact added"); }
    } catch (e: any) { setErr(e?.message || "Save failed"); setSaving(false); }
  }

  return (
    <SidePanel
      open
      onClose={onClose}
      title={editing ? "Edit contact" : "Add contact"}
      width="sm"
      busy={saving}
      onApply={save}
      applyLabel={editing ? "Save changes" : "Add contact"}
    >
        <div className="space-y-4">
          {err && <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium">{err}</div>}
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-foreground/80">Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Budi Santoso" className={INPUT_CLS} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-foreground/80">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 628123456789" className={INPUT_CLS} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-foreground/80">Labels</label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-2">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold">
                  <TagIcon className="w-3 h-3" />{t}
                  <button onClick={() => setTags((p) => p.filter((x) => x !== t))} className="hover:text-amber-900 outline-none"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && tagDraft.trim()) { e.preventDefault(); addTag(tagDraft); } else if (e.key === "Backspace" && !tagDraft && tags.length) setTags((p) => p.slice(0, -1)); }}
                placeholder={tags.length ? "" : "Add a label and press Enter"} className="flex-1 min-w-[100px] h-6 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none" />
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {suggestions.map((s) => (<button key={s} onClick={() => addTag(s)} className="px-2 py-0.5 rounded-md border border-border text-[11px] text-foreground/70 hover:bg-muted outline-none">{s}</button>))}
              </div>
            )}
          </div>

          {fields.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-border/60">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Custom fields</p>
              {fields.map((f) => (
                <div key={f.id} className="space-y-1.5">
                  <label className="text-[12px] font-bold text-foreground/80">{f.label}</label>
                  {f.type === "select" ? (
                    <select value={attrs[f.key] ?? ""} onChange={(e) => setAttrs((p) => ({ ...p, [f.key]: e.target.value }))} className={INPUT_CLS}>
                      <option value="">—</option>
                      {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      value={attrs[f.key] ?? ""} onChange={(e) => setAttrs((p) => ({ ...p, [f.key]: e.target.value }))} className={INPUT_CLS} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </SidePanel>
  );
}

// ── Inline agent (re)assign dropdown for the contacts table ──────────────
function AgentAssignCell({ agentName, assignedAgentId, agents, onReassign, onUnassign }: {
  agentName: string | null;
  assignedAgentId: string | null;
  agents: Agent[];
  onReassign: (agentId: string) => void;
  onUnassign: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={cn(
          "inline-flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-semibold max-w-[160px] outline-none transition-colors",
          agentName ? "bg-muted text-muted-foreground hover:bg-muted/70" : "bg-amber-50 text-amber-700 hover:bg-amber-100",
        )}
      >
        <User className="w-3 h-3 shrink-0" />
        <span className="truncate">{agentName || "Unassigned"}</span>
        <ChevronDown className={cn("w-3 h-3 shrink-0 opacity-60 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 w-60 max-h-[300px] flex flex-col rounded-lg border border-border bg-popover shadow-xl animate-scale-in">
            <div className="p-2 border-b border-border shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agent..."
                  className="w-full h-8 pl-8 pr-2 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary" />
              </div>
            </div>
            <div className="overflow-auto py-1 flex-1 min-h-0">
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Assign to</p>
              {(() => {
                const q = query.trim().toLowerCase();
                const matches = agents.filter((ag) => ag.full_name.toLowerCase().includes(q) || (ag.email || "").toLowerCase().includes(q));
                if (matches.length === 0) return <p className="text-center text-xs text-muted-foreground py-3">No agents</p>;
                return matches.map((ag) => (
                  <button
                    key={ag.id}
                    type="button"
                    onClick={() => { onReassign(ag.id); setOpen(false); setQuery(""); }}
                    className={cn("w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-muted outline-none", ag.id === assignedAgentId ? "bg-primary/[0.04]" : "")}
                  >
                    <User className={cn("w-3.5 h-3.5 shrink-0", ag.id === assignedAgentId ? "text-primary" : "opacity-70")} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[13px] truncate", ag.id === assignedAgentId ? "text-primary font-semibold" : "text-foreground/90")}>{ag.full_name}</p>
                      {ag.email && <p className="text-[11px] text-muted-foreground truncate">{ag.email}</p>}
                    </div>
                    {ag.id === assignedAgentId && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
                  </button>
                ));
              })()}
              {assignedAgentId && (
                <>
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    onClick={() => { onUnassign(); setOpen(false); setQuery(""); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left text-amber-700 hover:bg-amber-50 outline-none"
                  >
                    <XCircle className="w-3.5 h-3.5 shrink-0" />Unassign
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
