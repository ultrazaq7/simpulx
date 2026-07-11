"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, MoreHorizontal, User, Loader2, Eye, EyeOff, X, Plus, Activity, Clock, Timer, CalendarDays, Download } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { Select } from "@/components/Select";
import { MultiSelect } from "@/components/ui/multi-select";
import { FilterButton, FilterDrawer, FilterField } from "@/components/FilterDrawer";
import SidePanel from "@/components/SidePanel";
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;
import { fmtDate, fmtDateTimeShort, cn } from "@/lib/utils";
import type { UserAccount, UserActivity, Campaign, Channel } from "@/lib/types";
import { useToast, PageBody, SettingsCard, FieldLabel, INPUT_CLASS, PrimaryButton, GhostButton, ROLES, ROLE_COLOR, initials } from "../_shared";

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(iso);
}

export default function PeopleSettingsPage() {
  const { notify, confirm, ToastHost } = useToast();
  const [rows, setRows] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilters = roleFilter.length + campaignFilter.length + channelFilter.length + statusFilter.length;
  const clearFilters = () => { setRoleFilter([]); setCampaignFilter([]); setChannelFilter([]); setStatusFilter([]); };
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [dlg, setDlg] = useState<{ open: boolean; editing: UserAccount | null }>({ open: false, editing: null });
  const [menuUser, setMenuUser] = useState<UserAccount | null>(null);
  const [activityUser, setActivityUser] = useState<UserAccount | null>(null);

  const me = getUser();
  const isPrivileged = me?.role === "admin" || me?.role === "owner";

  async function load() {
    setLoading(true);
    try { setRows(await api.listUsers()); } catch { } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    api.listCampaigns().then((c) => setCampaigns(c || [])).catch(() => {});
    api.listChannels().then((c) => setChannels(c || [])).catch(() => {});
  }, []);

  async function remove(u: UserAccount) {
    if (!(await confirm({ title: `Remove ${u.full_name}?`, message: "This is permanent: they lose access and their open leads are reassigned. Past history stays for the record. To pause an account temporarily, use Deactivate instead.", danger: true, confirmLabel: "Remove" }))) return;
    try { await api.deleteUser(u.id); notify("User removed", "info"); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  async function toggleStatus(u: UserAccount) {
    const deactivating = u.status === "active";
    if (deactivating && !(await confirm({ title: "Deactivate account?", message: `${u.full_name} will lose access until reactivated. Their leads and history stay intact.`, danger: true, confirmLabel: "Deactivate" }))) return;
    try { await api.updateUser(u.id, { status: deactivating ? "inactive" : "active" }); notify(`User ${deactivating ? "deactivated" : "activated"}`); load(); }
    catch (e) { notify(String(e), "error"); }
  }
  const [exporting, setExporting] = useState(false);
  async function exportTeam() {
    setExporting(true);
    try { await api.downloadTeamCsv(); }
    catch (e) { notify(String(e), "error"); }
    finally { setExporting(false); }
  }

  // Users aren't tied to a channel directly, only to campaigns; map each campaign
  // name to its channel so a channel filter can match through campaign membership.
  const campNameToChannel = useMemo(() => {
    const m = new Map<string, string>();
    campaigns.forEach((c) => { if (c.channel_id) m.set(c.name, c.channel_id); });
    return m;
  }, [campaigns]);

  const filtered = useMemo(() => rows.filter((u) =>
    // The platform super admin is not a tenant team member — keep it out of the list.
    !u.is_super_admin &&
    (!roleFilter.length || roleFilter.includes(u.role)) &&
    (u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())) &&
    (!statusFilter.length || statusFilter.includes(u.status)) &&
    (!campaignFilter.length || (u.campaign_names || []).some((n) => campaignFilter.includes(n))) &&
    (!channelFilter.length || (u.campaign_names || []).some((n) => {
      const ch = campNameToChannel.get(n); return !!ch && channelFilter.includes(ch);
    }))
  ), [rows, search, roleFilter, statusFilter, campaignFilter, channelFilter, campNameToChannel]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paged = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  useEffect(() => { setPage(0); }, [search, roleFilter, statusFilter, campaignFilter, channelFilter]);

  return (
    <PageBody fill>
      {ToastHost}
      <SettingsCard className="overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="p-3 flex items-center gap-2.5 border-b border-border flex-wrap shrink-0">
          <div className="relative w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-muted text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary" />
          </div>
          <FilterButton count={activeFilters} onClick={() => setFilterOpen(true)} />
          {activeFilters > 0 && <button onClick={clearFilters} className="text-[11px] font-semibold text-primary hover:underline outline-none">Clear</button>}
          <FilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} onClear={clearFilters} canClear={activeFilters > 0}>
            <FilterField label="Roles"><MultiSelect value={roleFilter} onChange={setRoleFilter} placeholder="All roles" className="w-full" options={ROLES.map((r) => ({ value: r, label: cap(r) }))} /></FilterField>
            <FilterField label="Campaigns"><MultiSelect value={campaignFilter} onChange={setCampaignFilter} placeholder="All campaigns" className="w-full" options={campaigns.map((c) => ({ value: c.name, label: c.name }))} /></FilterField>
            <FilterField label="Channels"><MultiSelect value={channelFilter} onChange={setChannelFilter} placeholder="All channels" className="w-full" options={channels.map((c) => ({ value: c.id, label: c.name }))} /></FilterField>
            <FilterField label="Status"><MultiSelect value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" className="w-full" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></FilterField>
          </FilterDrawer>
          <div className="flex items-center gap-2 ml-auto">
            <GhostButton onClick={exportTeam} disabled={exporting}>
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Export
            </GhostButton>
            {isPrivileged && (
              <PrimaryButton onClick={() => setDlg({ open: true, editing: null })}>
                <Plus className="w-4 h-4" />Invite people
              </PrimaryButton>
            )}
          </div>
        </div>

        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm min-w-[920px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {["User", "Role", "Campaigns", "Status", "Last login", "Created", ""].map((h) => (
                  <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground", h === "" ? "text-right w-12" : "text-left")}>{h || <span className="sr-only">Actions</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-muted-foreground">No people found</td></tr>
              ) : paged.map((u) => {
                const rc = ROLE_COLOR[u.role] ?? "#64748B";
                return (
                  <tr key={u.id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-9 h-9 rounded-full grid place-items-center font-bold text-[13px]"
                            style={{ backgroundColor: rc + "1a", color: rc }}>
                            {initials(u.full_name) || <User className="w-[18px] h-[18px]" />}
                          </div>
                          {u.is_online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success border-2 border-card" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{u.full_name}{u.id === me?.id ? " (You)" : ""}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex px-2 py-0.5 rounded-md text-[10.5px] font-bold capitalize"
                        style={{ backgroundColor: rc + "1a", color: rc }}>{u.role}</span>
                    </td>
                    <td className="px-4 py-2.5"><CellChips items={u.campaign_names} empty="-" /></td>
                    <td className="px-4 py-2.5">
                      <div className="inline-flex items-center gap-1.5">
                        <span className={cn("w-[7px] h-[7px] rounded-full", u.status === "active" ? "bg-success" : "bg-muted-foreground/40")} />
                        <span className={cn("text-[12.5px] capitalize", u.status === "active" ? "text-foreground" : "text-muted-foreground")}>{u.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground whitespace-nowrap">{u.last_login_at ? fmtDateTimeShort(u.last_login_at) : "Never"}</td>
                    <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground whitespace-nowrap">{fmtDateTimeShort(u.created_at)}</td>
                    <td className="px-4 py-2.5 text-right relative">
                      <UserRowMenu
                        u={u}
                        isOpen={menuUser?.id === u.id}
                        onToggle={() => setMenuUser(menuUser?.id === u.id ? null : u)}
                        onClose={() => setMenuUser(null)}
                        onEdit={() => { setDlg({ open: true, editing: u }); setMenuUser(null); }}
                        onViewActivity={() => { setActivityUser(u); setMenuUser(null); }}
                        onToggleStatus={() => { toggleStatus(u); setMenuUser(null); }}
                        onRemove={() => { remove(u); setMenuUser(null); }}
                        isPrivileged={isPrivileged}
                        isMe={u.id === me?.id}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-sm">
          <span className="text-muted-foreground tabular-nums">{filtered.length} total</span>
          <div className="flex items-center gap-2">
            <Select value={String(rowsPerPage)} onChange={(v) => { setRowsPerPage(Number(v)); setPage(0); }} align="right" className="w-[72px]"
              options={[10, 25, 50].map((n) => ({ value: String(n), label: String(n) }))} />
            <span className="text-muted-foreground mx-2 tabular-nums">Page {page + 1} of {totalPages}</span>
            <button disabled={page <= 0} onClick={() => setPage(page - 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">Prev</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-2.5 h-7 rounded-md border border-border text-xs font-semibold disabled:opacity-30 hover:bg-muted outline-none transition-colors">Next</button>
          </div>
        </div>
      </SettingsCard>

      <UserDialog state={dlg} isPrivileged={isPrivileged} onClose={() => setDlg({ open: false, editing: null })}
        onSaved={(m) => { setDlg({ open: false, editing: null }); notify(m); load(); }}
        onError={(m) => notify(m, "error")} />

      <ActivityPanel user={activityUser} onClose={() => setActivityUser(null)} />
    </PageBody>
  );
}

function UserRowMenu({ u, isOpen, onToggle, onClose, onEdit, onViewActivity, onToggleStatus, onRemove, isPrivileged, isMe }: {
  u: UserAccount; isOpen: boolean; onToggle: () => void; onClose: () => void;
  onEdit: () => void; onViewActivity: () => void; onToggleStatus: () => void; onRemove: () => void;
  isPrivileged: boolean; isMe: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean }>({ top: 0, left: 0, flipUp: false });

  const handleToggle = () => {
    if (!isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < 160;
      setPos({
        top: flipUp ? rect.top : rect.bottom + 4,
        left: rect.right - 176, // 176 = w-44 = 11rem
        flipUp,
      });
    }
    onToggle();
  };

  return (
    <>
      <button ref={btnRef} aria-label="Member actions" onClick={handleToggle}
        className="p-1 border border-border rounded-md hover:bg-muted transition-colors outline-none">
        <MoreHorizontal className="w-[18px] h-[18px] text-muted-foreground" />
      </button>
      {isOpen && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={onClose} />
          <div
            className="fixed z-[70] w-44 bg-card rounded-lg border border-border shadow-lg py-1 animate-scale-in"
            style={pos.flipUp
              ? { bottom: window.innerHeight - pos.top, left: pos.left }
              : { top: pos.top, left: pos.left }
            }
          >
            <button onClick={onViewActivity} className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-muted outline-none transition-colors">
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />View activity
            </button>
            <button onClick={onEdit} className="w-full px-3 py-2 text-left text-[13px] text-foreground hover:bg-muted outline-none transition-colors">Edit user</button>
            {isPrivileged && !isMe && (
              <button onClick={onToggleStatus} className="w-full px-3 py-2 text-left text-[13px] text-foreground hover:bg-muted outline-none transition-colors">
                {u.status === "active" ? "Deactivate" : "Activate"}
              </button>
            )}
            {isPrivileged && !isMe && <div className="border-t border-border my-0.5" />}
            {isPrivileged && !isMe && (
              <button onClick={onRemove} className="w-full px-3 py-2 text-left text-[13px] text-destructive hover:bg-muted outline-none transition-colors">Remove</button>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

function CellChips({ items, empty }: { items: string[] | null; empty: string }) {
  if (!items || items.length === 0) return <span className="text-[12.5px] text-muted-foreground/60">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.slice(0, 2).map((n) => <span key={n} className="inline-flex px-1.5 py-0.5 rounded-md border border-border text-[10.5px] font-medium text-foreground">{n}</span>)}
      {items.length > 2 && <span className="inline-flex px-1.5 py-0.5 rounded-md bg-muted text-[10.5px] text-muted-foreground">+{items.length - 2}</span>}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-[20px] font-bold text-foreground leading-none tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function ActivityPanel({ user, onClose }: { user: UserAccount | null; onClose: () => void }) {
  const [range, setRange] = useState<"7d" | "30d" | "month">("30d");
  const [data, setData] = useState<UserActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) { setData(null); setError(""); return; }
    const to = new Date();
    const from = range === "7d" ? new Date(Date.now() - 7 * 86400000)
      : range === "30d" ? new Date(Date.now() - 30 * 86400000)
      : new Date(to.getFullYear(), to.getMonth(), 1);
    setLoading(true); setError("");
    api.getUserActivity(user.id, from.toISOString(), to.toISOString())
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [user, range]);

  if (!user) return null;
  const rc = ROLE_COLOR[user.role] ?? "#64748B";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative bg-card rounded-lg border border-border shadow-2xl w-full max-w-md animate-scale-in">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full grid place-items-center font-bold text-[13px] shrink-0" style={{ backgroundColor: rc + "1a", color: rc }}>
              {initials(user.full_name) || <User className="w-[18px] h-[18px]" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-foreground truncate">{user.full_name}</h2>
              <p className="text-xs text-muted-foreground truncate">Activity &amp; performance</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground outline-none transition-colors"><X className="w-[18px] h-[18px]" /></button>
        </div>

        <div className="px-5 pt-4 flex items-center gap-1.5">
          {([["7d", "Last 7 days"], ["30d", "Last 30 days"], ["month", "This month"]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setRange(val)}
              className={cn("px-2.5 h-7 rounded-md text-[12px] font-semibold transition-colors outline-none border",
                range === val ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:bg-muted")}>
              {label}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 min-h-[200px]">
          {loading ? (
            <div className="flex justify-center py-14"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <p className="text-center text-sm text-destructive py-14">{error}</p>
          ) : data ? (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className={cn("w-2 h-2 rounded-full", data.presence.currently_online ? "bg-success" : "bg-muted-foreground/40")} />
                <span className="text-[13px] font-medium text-foreground">{data.presence.currently_online ? "Online now" : "Offline"}</span>
                <span className="text-[12px] text-muted-foreground">· last online {relativeTime(data.presence.last_online_at)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard icon={Activity} label="Availability" value={`${data.presence.availability_pct}%`} sub="online time / period" />
                <MetricCard icon={Clock} label="Online time" value={`${data.presence.online_hours} h`} sub={`${data.presence.sessions} session${data.presence.sessions === 1 ? "" : "s"}`} />
                <MetricCard icon={Timer} label="Sessions" value={String(data.presence.sessions)} sub="online periods" />
                <MetricCard icon={CalendarDays} label="Active (billing)" value={`${data.billing.active_days} d`} sub={data.billing.is_deleted ? "deleted" : data.billing.is_inactive ? "inactive" : "active"} />
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-4 leading-snug">
                Presence powers performance metrics only; it does not affect lead distribution. Active days drive billing.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UserDialog({ state, isPrivileged, onClose, onSaved, onError }: {
  state: { open: boolean; editing: UserAccount | null }; isPrivileged: boolean;
  onClose: () => void; onSaved: (m: string) => void; onError: (m: string) => void;
}) {
  const isEdit = !!state.editing;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("agent");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    const u = state.editing;
    setEmail(u?.email ?? ""); setName(u?.full_name ?? ""); setRole(u?.role ?? "agent"); setPassword(""); setShowPw(false);
  }, [state.open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!name.trim() || (!isEdit && !email.trim())) { onError("Name and email are required"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const patch: { full_name: string; email?: string; role?: string; password?: string } = { full_name: name.trim() };
        if (isPrivileged) { patch.email = email.trim(); patch.role = role; if (password.trim()) patch.password = password.trim(); }
        await api.updateUser(state.editing!.id, patch);
        onSaved("User updated");
      } else {
        await api.createUser({ email: email.trim(), full_name: name.trim(), role, password: password.trim() || undefined });
        onSaved("User invited");
      }
    } catch (e) { onError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <SidePanel
      open={state.open}
      onClose={onClose}
      title={isEdit ? "Edit user" : "Invite people"}
      description={isEdit ? "Update this team member's details." : "Add a team member to the workspace."}
      width="sm"
      busy={saving}
      onApply={save}
      applyLabel={isEdit ? "Save" : "Invite"}
    >
      <div className="flex flex-col gap-4">
        <div>
          <FieldLabel>Full name</FieldLabel>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus className={INPUT_CLASS} />
        </div>
        <div>
          <FieldLabel>Email</FieldLabel>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isEdit && !isPrivileged}
            className={cn(INPUT_CLASS, "disabled:bg-muted disabled:text-muted-foreground")} />
          {isEdit && !isPrivileged && <p className="text-xs text-muted-foreground/70 mt-1">Only admins can change email</p>}
        </div>
        {(isPrivileged || !isEdit) && (
          <div>
            <FieldLabel>Role</FieldLabel>
            <Select value={role} onChange={setRole} disabled={isEdit && !isPrivileged}
              options={ROLES.map((r) => ({ value: r, label: cap(r) }))} />
          </div>
        )}
        {(isPrivileged || !isEdit) && (
          <div>
            <FieldLabel>{isEdit ? "Reset password (optional)" : "Temporary password (optional)"}</FieldLabel>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                className={cn(INPUT_CLASS, "pr-9")} />
              <button onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 outline-none text-muted-foreground hover:text-foreground transition-colors">
                {showPw ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground/70 mt-1">{isEdit ? "Leave blank to keep current password" : "Defaults to changeme123 if left blank"}</p>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
