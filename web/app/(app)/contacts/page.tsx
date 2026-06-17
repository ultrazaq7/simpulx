"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, Download, Pencil, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, Users, X, Loader2, Tag as TagIcon } from "lucide-react";

import { api, getUser } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { initials, channelColor, interestColor, fmtDate, cn } from "@/lib/utils";
import type { Contact, Agent, Campaign } from "@/lib/types";
import { Tip } from "@/components/ui/tooltip";
import MultiSelectFilter from "@/app/(app)/inbox/components/MultiSelectFilter";
import { Select } from "@/components/Select";

type ModalState = { mode: "add" } | { mode: "edit"; contact: Contact } | null;

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterAgents, setFilterAgents] = useState<string[]>([]);
  const [filterCampaigns, setFilterCampaigns] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { can } = usePermissions();
  const role = getUser()?.role;
  const showAgentFilter = role !== "agent";
  const showCampaignFilter = role === "admin" || role === "owner";
  const canCreate = can("create_contacts");
  const canEdit = can("edit_contacts");
  const canExport = can("export_contacts");

  const reload = () => api.listContacts().then(setContacts).catch(() => {});
  useEffect(() => {
    Promise.all([
      api.listContacts().catch(() => []),
      showAgentFilter ? api.listAgents().catch(() => []) : Promise.resolve([]),
      showCampaignFilter ? api.listCampaigns().catch(() => []) : Promise.resolve([]),
    ]).then(([c, a, cm]) => { setContacts(c as Contact[]); setAgents(a as Agent[]); setCampaigns(cm as Campaign[]); setLoading(false); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2500); return () => clearTimeout(t); }, [toast]);

  // Filter options
  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort().map((t) => ({ value: t, label: t }));
  }, [contacts]);
  const agentOptions = useMemo(() => [{ value: "__unassigned__", label: "Unassigned" }, ...agents.map((a) => ({ value: a.id, label: a.full_name }))], [agents]);
  const campaignOptions = useMemo(() => campaigns.map((c) => ({ value: c.id, label: c.name })), [campaigns]);

  const filtered = useMemo(() => {
    let list = contacts;
    if (query) list = list.filter((c) => (c.full_name || c.phone || "").toLowerCase().includes(query.toLowerCase()));
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
    const head = ["Name", "Phone", "Channel", "Interest", "Stage", "Labels", "Created"];
    const lines = filtered.map((c) => [c.full_name, c.phone, c.source_channel, c.interest_level, c.stage_name, (c.tags || []).join("; "), c.created_at].map(esc).join(","));
    const csv = [head.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    setToast(`Exported ${filtered.length} contact${filtered.length === 1 ? "" : "s"}`);
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-3 flex items-center gap-3 border-b border-border">
          <div className="relative w-[320px] max-w-[45vw]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search name or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex-1" />
          {canExport && (
            <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 h-9 border border-border rounded-md text-sm font-semibold text-foreground/80 hover:bg-muted transition-colors outline-none">
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
          {canCreate && (
            <button onClick={() => setModal({ mode: "add" })} className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm hover:shadow-brand-md transition-all outline-none">
              <UserPlus className="w-4 h-4" />
              Add contact
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="px-3 py-2 flex items-center gap-1.5 flex-wrap border-b border-border/70 bg-muted/30">
          <MultiSelectFilter label="Labels" options={tagOptions} selected={filterTags} onChange={setFilterTags} />
          {showAgentFilter && <MultiSelectFilter label="Agent" options={agentOptions} selected={filterAgents} onChange={setFilterAgents} />}
          {showCampaignFilter && <MultiSelectFilter label="Campaign" options={campaignOptions} selected={filterCampaigns} onChange={setFilterCampaigns} />}
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="text-[11px] font-semibold text-primary hover:underline outline-none ml-1">Clear</button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="w-10 px-4 py-2.5"><input type="checkbox" className="rounded border-input accent-primary" /></th>
                {["Contact name", "Channel", "Phone", "Interest", "Stage", "Labels", ""].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array(6).fill(0).map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-2.5"><div className="h-9 skeleton rounded-md" /></td></tr>
              )) : paged.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3">
                      <Users className="w-6 h-6 text-muted-foreground/50" />
                    </div>
                    <p className="font-semibold text-foreground mb-0.5">No contacts found</p>
                    <p className="text-sm text-muted-foreground">{query || activeFilters ? "Try different filters." : "New contacts will appear here."}</p>
                  </td>
                </tr>
              ) : paged.map((c) => (
                <tr key={c.id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-2.5"><input type="checkbox" className="rounded border-input accent-primary" /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-full grid place-items-center text-xs font-bold ring-1 ring-inset ring-black/5"
                          style={{ backgroundColor: channelColor(c.source_channel) + "1A", color: channelColor(c.source_channel) }}>
                          {initials(c.full_name || c.phone)}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-card" style={{ backgroundColor: channelColor(c.source_channel) }} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-[13px] text-foreground truncate">{c.full_name || c.phone || "Unknown"}</p>
                        <p className="text-[11px] text-muted-foreground">{fmtDate(c.created_at)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize"
                      style={{ backgroundColor: channelColor(c.source_channel) + "15", color: channelColor(c.source_channel) }}>
                      {c.source_channel || "Unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-foreground/90 tabular-nums">{c.phone || "-"}</td>
                  <td className="px-4 py-2.5">
                    {c.interest_level ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: interestColor(c.interest_level) }} />
                        <span className="capitalize font-medium text-foreground/90">{c.interest_level}</span>
                      </div>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.stage_name ? (
                      <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary">{c.stage_name}</span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {(c.tags && c.tags.length) ? (
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {c.tags.slice(0, 3).map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-semibold"><TagIcon className="w-2.5 h-2.5" />{t}</span>
                        ))}
                        {c.tags.length > 3 && <span className="text-[10px] text-muted-foreground font-semibold">+{c.tags.length - 3}</span>}
                      </div>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {canEdit && (
                      <Tip label="Edit contact">
                        <button onClick={() => setModal({ mode: "edit", contact: c })} className="p-1.5 border border-border rounded-md hover:bg-muted transition-colors outline-none text-muted-foreground hover:text-foreground">
                          <Pencil className="w-4 h-4" />
                        </button>
                      </Tip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center py-3 px-4 border-t border-border">
          <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">{filtered.length} contact{filtered.length === 1 ? "" : "s"}</span>
          <div className="flex-1 flex justify-center items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage(1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronsLeft className="w-[18px] h-[18px]" /></button>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronLeft className="w-[18px] h-[18px]" /></button>
            <span className="px-3 py-1 rounded-md border border-primary/40 text-primary text-[13px] font-bold min-w-[32px] text-center tabular-nums">{page}</span>
            <span className="text-[13px] text-muted-foreground tabular-nums">/ {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronRight className="w-[18px] h-[18px]" /></button>
            <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed outline-none transition-colors"><ChevronsRight className="w-[18px] h-[18px]" /></button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Per page</span>
            <Select
              value={String(rowsPerPage)}
              onChange={(v) => { setRowsPerPage(Number(v)); setPage(1); }}
              options={[50, 100, 200].map((n) => ({ value: String(n), label: String(n) }))}
              className="w-[80px]"
              align="right"
            />
          </div>
        </div>
      </div>

      {modal && (
        <ContactModal state={modal} allTags={tagOptions.map((t) => t.value)}
          onClose={() => setModal(null)}
          onSaved={(msg) => { setModal(null); reload(); setToast(msg); }} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] animate-scale-in">
          <div className="px-4 py-2.5 rounded-lg bg-[#2D8B73] text-white text-sm font-semibold shadow-xl">{toast}</div>
        </div>
      )}
    </div>
  );
}

const INPUT_CLS = "w-full h-10 px-3 rounded-md border border-input bg-background text-[13.5px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

function ContactModal({ state, allTags, onClose, onSaved }: {
  state: Exclude<ModalState, null>;
  allTags: string[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const editing = state.mode === "edit";
  const [name, setName] = useState(editing ? state.contact.full_name ?? "" : "");
  const [phone, setPhone] = useState(editing ? state.contact.phone ?? "" : "");
  const [tags, setTags] = useState<string[]>(editing ? state.contact.tags ?? [] : []);
  const [tagDraft, setTagDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,$/, "");
    if (t && !tags.includes(t)) setTags((p) => [...p, t]);
    setTagDraft("");
  };
  const suggestions = allTags.filter((t) => !tags.includes(t) && t.toLowerCase().includes(tagDraft.toLowerCase()) && tagDraft.trim()).slice(0, 6);

  async function save() {
    if (!name.trim() && !phone.trim()) { setErr("Enter a name or phone."); return; }
    setSaving(true); setErr("");
    try {
      if (editing) { await api.updateContact(state.contact.id, { full_name: name.trim(), phone: phone.trim(), tags }); onSaved("Contact updated"); }
      else { await api.createContact({ full_name: name.trim(), phone: phone.trim(), tags }); onSaved("Contact added"); }
    } catch (e: any) { setErr(e?.message || "Save failed"); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative w-[440px] rounded-lg border border-border bg-card shadow-2xl animate-scale-in">
        <div className="flex items-center px-5 py-3.5 border-b border-border">
          <p className="font-bold text-[15px] text-foreground flex-1">{editing ? "Edit contact" : "Add contact"}</p>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="p-5 space-y-4">
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
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold">
                  <TagIcon className="w-3 h-3" />{t}
                  <button onClick={() => setTags((p) => p.filter((x) => x !== t))} className="hover:text-amber-900 outline-none"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === ",") && tagDraft.trim()) { e.preventDefault(); addTag(tagDraft); }
                  else if (e.key === "Backspace" && !tagDraft && tags.length) setTags((p) => p.slice(0, -1));
                }}
                placeholder={tags.length ? "" : "Add a label and press Enter"}
                className="flex-1 min-w-[100px] h-6 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/70 outline-none"
              />
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => addTag(s)} className="px-2 py-0.5 rounded-md border border-border text-[11px] text-foreground/70 hover:bg-muted outline-none">{s}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm font-semibold text-foreground/70 hover:bg-muted outline-none">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-1.5 rounded-md text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-60 outline-none inline-flex items-center gap-2 transition-colors">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? "Save changes" : "Add contact"}
          </button>
        </div>
      </div>
    </div>
  );
}
