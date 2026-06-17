"use client";
import { useEffect, useState } from "react";
import { Search, Plus, Pencil, Trash2, Megaphone, Loader2, X, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import type { Campaign, UserAccount, Channel } from "@/lib/types";
import MultiSelectFilter from "@/app/(app)/inbox/components/MultiSelectFilter";
import { Select } from "@/components/Select";

type Toast = { msg: string; sev: "success" | "error" } | null;

export default function CampaignsPage() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [dlg, setDlg] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  async function load() {
    setLoading(true);
    try {
      const [c, u, ch] = await Promise.all([api.listCampaigns(), api.listUsers().catch(() => []), api.listChannels().catch(() => [])]);
      setRows(c); setUsers(u as UserAccount[]); setChannels(ch as Channel[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(c: Campaign) {
    if (!confirm(`Delete campaign "${c.name}"? Conversations stay but lose their campaign tag.`)) return;
    try { await api.deleteCampaign(c.id); setToast({ msg: "Campaign deleted", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }

  const filtered = rows.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || (c.dealer_name ?? "").toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  useEffect(() => { setPage(0); }, [search]);

  return (
    <div className="px-6 pt-6 pb-6 max-w-[1180px] mx-auto">
      <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden">
        <div className="p-3 flex items-center gap-3 border-b border-border flex-wrap">
          <div className="relative w-[320px] max-w-[45vw]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Search campaigns or dealers" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex-1" />
          <button onClick={() => setDlg({ open: true, id: null })}
            className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm hover:shadow-brand-md transition-all outline-none">
            <Plus className="w-4 h-4" />New campaign
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Campaign", "Status", "Channel", "Agents", "Chats", "Leads", "Attribution", "Routing", ""].map((h) => (
                  <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", ["Agents", "Chats", "Leads"].includes(h) ? "text-right" : h === "" ? "text-right w-20" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-16">
                  <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3"><Megaphone className="w-6 h-6 text-muted-foreground/50" /></div>
                  <p className="font-semibold text-foreground mb-0.5">{search ? "No matching campaigns" : "No campaigns yet"}</p>
                  <p className="text-[13px] text-muted-foreground">Create a campaign for a dealer to start routing their leads.</p>
                </td></tr>
              ) : paged.map((c) => (
                <tr key={c.id} className={cn("border-b border-border/60 hover:bg-muted/50 transition-colors", c.status !== "active" && "opacity-65")}>
                  <td className="px-4 py-2.5">
                    <p className="text-[13px] font-semibold text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.dealer_name || "No dealer set"}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold capitalize", c.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{c.status}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.channel_name
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary">{c.channel_name}</span>
                      : <span className="text-[12px] text-amber-600">Not set</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[13px] text-foreground tabular-nums">{c.agent_count}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[13px] tabular-nums">{c.conversations}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[13px] tabular-nums">{c.lead_count}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {(c.ad_source_ids ?? []).map((s) => <span key={s} className="inline-flex px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px]">ad: {s}</span>)}
                      {(c.keywords ?? []).map((k) => <span key={k} className="inline-flex px-1.5 py-0.5 rounded-md bg-teal-50 text-teal-700 text-[10px]">kw: {k}</span>)}
                      {((c.ad_source_ids?.length ?? 0) + (c.keywords?.length ?? 0)) === 0 && <span className="text-[11.5px] text-muted-foreground">None</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground capitalize">{c.routing_strategy.replace("_", " ")}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Tip label="Edit"><button onClick={() => setDlg({ open: true, id: c.id })} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors text-muted-foreground hover:text-foreground"><Pencil className="w-[17px] h-[17px]" /></button></Tip>
                    <Tip label="Delete"><button onClick={() => remove(c)} className="p-1.5 rounded-md hover:bg-red-50 outline-none transition-colors text-red-500"><Trash2 className="w-[17px] h-[17px]" /></button></Tip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm">
          <span className="text-muted-foreground tabular-nums">{filtered.length} total</span>
          <div className="flex items-center gap-2">
            <Select
              value={String(rowsPerPage)}
              onChange={(v) => { setRowsPerPage(Number(v)); setPage(0); }}
              options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))}
              className="w-[72px]"
              align="right"
            />
            <span className="text-muted-foreground mx-2 tabular-nums">Page {page + 1} of {totalPages}</span>
            <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none">Prev</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none">Next</button>
          </div>
        </div>
      </div>

      <CampaignDialog dlg={dlg} users={users} channels={channels}
        onClose={() => setDlg({ open: false, id: null })}
        onSaved={(m) => { setDlg({ open: false, id: null }); setToast({ msg: m, sev: "success" }); load(); }}
        onError={(m) => setToast({ msg: m, sev: "error" })} />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] animate-scale-in">
          <div className={cn("flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-xl text-sm font-semibold text-white", toast.sev === "error" ? "bg-[#DC2626]" : "bg-[#2D8B73]")}>
            {toast.msg}<button onClick={() => setToast(null)} className="p-0.5 outline-none"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignDialog({ dlg, users, channels, onClose, onSaved, onError }: {
  dlg: { open: boolean; id: string | null }; users: UserAccount[]; channels: Channel[];
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const isEdit = !!dlg.id;
  const [name, setName] = useState("");
  const [dealer, setDealer] = useState("");
  const [status, setStatus] = useState("active");
  const [routing, setRouting] = useState("round_robin");
  const [channelId, setChannelId] = useState("");
  const [adSources, setAdSources] = useState("");
  const [keywords, setKeywords] = useState("");
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dlg.open) return;
    if (dlg.id) {
      api.getCampaign(dlg.id).then((c) => {
        setName(c.name); setDealer(c.dealer_name ?? ""); setStatus(c.status); setRouting(c.routing_strategy);
        setChannelId(c.channel_id ?? "");
        setAdSources((c.ad_source_ids ?? []).join(", ")); setKeywords((c.keywords ?? []).join(", "));
        setAgentIds(c.agent_ids ?? []);
      }).catch((e) => onError(String(e)));
    } else { setName(""); setDealer(""); setStatus("active"); setRouting("round_robin"); setChannelId(""); setAdSources(""); setKeywords(""); setAgentIds([]); }
  }, [dlg.open, dlg.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function csv(s: string) { return s.split(",").map((x) => x.trim()).filter(Boolean); }

  async function save() {
    if (!name.trim()) { onError("Campaign name is required"); return; }
    setSaving(true);
    const payload = { name: name.trim(), dealer_name: dealer.trim(), status, routing_strategy: routing, channel_id: channelId, ad_source_ids: csv(adSources), keywords: csv(keywords), agent_ids: agentIds };
    try {
      if (isEdit) { await api.updateCampaign(dlg.id!, payload); onSaved("Campaign updated"); }
      else { await api.createCampaign(payload); onSaved("Campaign created"); }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  if (!dlg.open) return null;

  const agentOptions = users.map((u) => ({ value: u.id, label: u.full_name }));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative bg-card rounded-lg border border-border shadow-2xl w-full max-w-lg animate-scale-in">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-[15px] font-bold text-foreground">{isEdit ? "Edit campaign" : "New campaign"}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none"><X className="w-[18px] h-[18px]" /></button>
        </div>
        <div className="px-5 py-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="flex gap-4">
            <Field label="Campaign name" className="flex-1"><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Honda Brio - Jakarta" autoFocus className={INPUT} /></Field>
            <Field label="Dealer" className="flex-1"><input type="text" value={dealer} onChange={(e) => setDealer(e.target.value)} placeholder="Dealer name" className={INPUT} /></Field>
          </div>
          <div className="flex gap-4">
            <Field label="Status" className="flex-1">
              <Select value={status} onChange={setStatus} options={[{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }]} />
            </Field>
            <Field label="Routing" className="flex-1">
              <Select value={routing} onChange={setRouting} options={[{ value: "round_robin", label: "Round-robin" }, { value: "manual", label: "Manual" }]} />
            </Field>
          </div>

          {/* Channel — the campaign's leads flow through this channel (dependency) */}
          <Field label="Channel">
            <Select
              value={channelId}
              onChange={setChannelId}
              placeholder="No channel"
              options={[{ value: "", label: "No channel" }, ...channels.map((ch) => ({ value: ch.id, label: ch.name + (ch.calling_enabled ? "  (calling enabled)" : "") }))]}
            />
            {channelId && channels.find((c) => c.id === channelId)?.calling_enabled && (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-success font-medium"><Phone className="w-3 h-3" /> WhatsApp calling available on this channel</p>
            )}
            {!channelId && <p className="mt-1 text-[11px] text-amber-600">No channel set. Leads won't route until a channel is assigned.</p>}
          </Field>

          {/* Agents — multi-select dropdown with search */}
          <Field label="Agents">
            <MultiSelectFilter label="Select agents" options={agentOptions} selected={agentIds} onChange={setAgentIds} />
            {agentIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {agentIds.map((id) => {
                  const u = users.find((x) => x.id === id);
                  if (!u) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-medium">
                      {u.full_name}
                      <button onClick={() => setAgentIds((p) => p.filter((x) => x !== id))} className="hover:text-primary-dark outline-none"><X className="w-3 h-3" /></button>
                    </span>
                  );
                })}
              </div>
            )}
          </Field>

          <div className="border-t border-border pt-3"><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Attribution</p></div>
          <Field label="CTWA ad source IDs (comma separated)"><input type="text" value={adSources} onChange={(e) => setAdSources(e.target.value)} placeholder="ad_honda_brio_2026" className={INPUT} /></Field>
          <Field label="Keywords in first message (comma separated)"><input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="brio, honda" className={INPUT} /></Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-semibold text-foreground/70 hover:bg-muted transition-colors outline-none">Cancel</button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 transition-colors outline-none">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT = "w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[12px] font-bold text-foreground/80 mb-1">{label}</label>
      {children}
    </div>
  );
}
