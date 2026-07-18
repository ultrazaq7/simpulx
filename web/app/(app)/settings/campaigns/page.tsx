"use client";
import { useI18n } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Pencil, Trash2, Megaphone, Loader2, X, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";
import type { Campaign, UserAccount, Channel } from "@/lib/types";
import { Select } from "@/components/Select";
import { MultiSelect } from "@/components/ui/multi-select";
import { CampaignWizard } from "./CampaignWizard";
import { Toast as ToastView } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

type Toast = { msg: string; sev: "success" | "error" } | null;

export default function CampaignsPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [dlg, setDlg] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [toast, setToast] = useState<Toast>(null);
  const { confirm, ConfirmHost } = useConfirm();
  const router = useRouter();
  // Clone is a superadmin-only action, so the button only renders for them.
  const [isSuper, setIsSuper] = useState(false);
  useEffect(() => { api.platformAccess().then((r) => setIsSuper(!!r.super_admin)).catch(() => {}); }, []);

  async function load() {
    setLoading(true);
    try {
      const [c, u, ch] = await Promise.all([api.listCampaigns(), api.listUsers().catch(() => []), api.listChannels().catch(() => [])]);
      setRows(c); setUsers(u as UserAccount[]); setChannels(ch as Channel[]);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function remove(c: Campaign) {
    if (!(await confirm({ title: "Delete campaign?", message: `Delete "${c.name}"? Conversations stay but lose their campaign tag.`, danger: true, confirmLabel: "Delete" }))) return;
    try { await api.deleteCampaign(c.id); setToast({ msg: "Campaign deleted", sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }

  async function clone(c: Campaign) {
    try { await api.cloneCampaign(c.id); setToast({ msg: `Cloned "${c.name}"`, sev: "success" }); load(); }
    catch (e) { setToast({ msg: String(e), sev: "error" }); }
  }

  const filtered = rows.filter((c) =>
    (c.name.toLowerCase().includes(search.toLowerCase()) || (c.dealer_name ?? "").toLowerCase().includes(search.toLowerCase())) &&
    (!channelFilter.length || (!!c.channel_id && channelFilter.includes(c.channel_id))));
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  useEffect(() => { setPage(0); }, [search, channelFilter]);

  return (
    <div className="px-6 pt-6 pb-6 w-full h-full flex flex-col min-h-0">
      <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 flex items-center gap-3 border-b border-border flex-wrap shrink-0">
          <div className="relative w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder={t("settings.searchCampaigns")} value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <MultiSelect value={channelFilter} onChange={setChannelFilter} placeholder={t("common.allChannels")} className="min-w-[180px]"
            options={channels.map((c) => ({ value: c.id, label: c.name }))} />
          <div className="flex-1" />
          <button onClick={() => setDlg({ open: true, id: null })}
            className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm hover:shadow-brand-md transition-all outline-none">
            <Plus className="w-4 h-4" />{t("settings.newCampaign")}
          </button>
        </div>

        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm min-w-[920px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["Campaign", "Status", "Channel", "Agents", "Routing", "Created", "Updated", ""].map((h) => (
                  <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", h === "Agents" ? "text-right" : h === "" ? "text-right w-20" : "text-left")}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16">
                  <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3"><Megaphone className="w-6 h-6 text-muted-foreground/50" /></div>
                  <p className="font-semibold text-foreground mb-0.5">{search || channelFilter.length ? t("settings.noMatchingCampaigns") : t("settings.noCampaignsYet")}</p>
                  <p className="text-[13px] text-muted-foreground">{t("settings.createACampaignToStart")}</p>
                </td></tr>
              ) : paged.map((c) => (
                <tr key={c.id} className={cn("border-b border-border/60 hover:bg-muted/50 transition-colors", c.status !== "active" && "opacity-65")}>
                  <td className="px-4 py-2.5">
                    <button onClick={() => router.push(`/settings/campaigns/${c.id}`)} className="text-[13px] font-semibold text-foreground hover:text-primary truncate text-left outline-none">{c.name}</button>
                    <p className="text-xs text-muted-foreground truncate">{c.dealer_name || t("settings.noCompanySet")}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold capitalize", c.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{c.status}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.channel_name
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary">{c.channel_name}</span>
                      : <span className="text-[12px] text-amber-600">{t("settings.notSet")}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-[13px] text-foreground tabular-nums">{c.agent_count}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground capitalize">{c.routing_strategy.replace("_", " ")}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground whitespace-nowrap">{fmtDateTimeShort(c.created_at)}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground whitespace-nowrap">{fmtDateTimeShort(c.updated_at)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Tip label={t("common.edit")}><button onClick={() => setDlg({ open: true, id: c.id })} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors text-muted-foreground hover:text-foreground"><Pencil className="w-[17px] h-[17px]" /></button></Tip>
                    {isSuper && <Tip label="Clone"><button onClick={() => clone(c)} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors text-muted-foreground hover:text-foreground"><Copy className="w-[17px] h-[17px]" /></button></Tip>}
                    <Tip label={t("common.delete")}><button onClick={() => remove(c)} className="p-1.5 rounded-md hover:bg-red-50 outline-none transition-colors text-red-500"><Trash2 className="w-[17px] h-[17px]" /></button></Tip>
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
            <span className="text-muted-foreground mx-2 tabular-nums">{t("settings.page")} {page + 1} of {totalPages}</span>
            <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none">{t("settings.prev")}</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none">{t("settings.next")}</button>
          </div>
        </div>
      </div>

      {dlg.open && (
        <CampaignWizard campaignId={dlg.id} users={users} channels={channels}
          onClose={() => setDlg({ open: false, id: null })}
          onDone={(m) => { setDlg({ open: false, id: null }); setToast({ msg: m, sev: "success" }); load(); }}
          onError={(m) => setToast({ msg: m, sev: "error" })} />
      )}

      {toast && <ToastView msg={toast.msg} severity={toast.sev} onClose={() => setToast(null)} />}
      {ConfirmHost}
    </div>
  );
}
