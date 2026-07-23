"use client";
// Manage Ads: the Meta Ads Manager-like editing surface. One hierarchy table
// (campaign > ad set > ad) where every row can be toggled, renamed, and (per
// level) edited: ad set budget/schedule in a drawer, ads deletable, previews
// via Meta's official iframe. Semantics match Meta: a toggle flips ONLY that
// entity's configured status (no cascade) and the Delivery chip shows the
// effective status, so "ON under a paused parent" reads exactly like Ads
// Manager. The Performance tab stays the reporting truth; this is the wrench.
import { Fragment, useEffect, useState } from "react";
import {
  Loader2, ChevronDown, ChevronRight, Megaphone, Layers, Image as ImageIcon,
  Pencil, Trash2, Eye, X, RefreshCw, Wallet, AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ConfirmDialog";
import type { AdsManageTree, ManageAdset, ManageMetrics } from "@/lib/types";

type Level = "campaign" | "adset" | "ad";

const rp = (v: number) => "Rp " + Math.round(v).toLocaleString("id-ID");
const nf = (v: number) => v.toLocaleString("id-ID");

function DeliveryChip({ status }: { status: string }) {
  const cls =
    status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-600"
      : status === "PENDING_REVIEW" || status === "IN_PROCESS" ? "bg-blue-500/10 text-blue-600"
        : status === "DISAPPROVED" || status === "WITH_ISSUES" ? "bg-red-500/10 text-red-600"
          : "bg-amber-500/10 text-amber-600";
  return (
    <span className={cn("inline-flex px-1.5 py-px rounded text-[9.5px] font-bold uppercase whitespace-nowrap", cls)}>
      {(status || "unknown").toLowerCase().replaceAll("_", " ")}
    </span>
  );
}

function MetricCells({ m }: { m: ManageMetrics }) {
  return (
    <>
      <td className="px-2 py-2 text-right tabular-nums">{m.leads > 0 ? nf(m.leads) : "-"}</td>
      <td className="px-2 py-2 text-right tabular-nums hidden lg:table-cell">{m.impressions > 0 ? nf(m.impressions) : "-"}</td>
      <td className="px-2 py-2 text-right tabular-nums hidden lg:table-cell">{m.clicks > 0 ? nf(m.clicks) : "-"}</td>
      <td className="px-2 py-2 text-right tabular-nums hidden md:table-cell">{m.ctr > 0 ? m.ctr.toFixed(2) + "%" : "-"}</td>
      <td className="px-2 py-2 text-right tabular-nums font-medium">{m.spend > 0 ? rp(m.spend) : "-"}</td>
      <td className="px-2 py-2 text-right tabular-nums hidden md:table-cell">{m.cpl > 0 ? rp(m.cpl) : "-"}</td>
    </>
  );
}

// Small on/off switch in Meta's style: reflects CONFIGURED status.
function StatusToggle({ on, busy, disabled, onFlip }: {
  on: boolean; busy: boolean; disabled: boolean; onFlip: () => void;
}) {
  return (
    <button onClick={onFlip} disabled={busy || disabled} aria-label={on ? "On" : "Off"}
      className={cn("relative w-8 h-[18px] rounded-full transition-colors outline-none shrink-0",
        on ? "bg-emerald-600" : "bg-gray-300 dark:bg-gray-600",
        (busy || disabled) && "opacity-60 cursor-not-allowed")}>
      {busy
        ? <Loader2 className="w-3 h-3 animate-spin text-white absolute top-[3px] left-1/2 -translate-x-1/2" />
        : <span className={cn("absolute top-0.5 w-[14px] h-[14px] rounded-full bg-white shadow transition-all", on ? "left-[16px]" : "left-0.5")} />}
    </button>
  );
}

export default function ManageAdsPanel({ id, notify }: {
  id: string; notify: (m: string, s?: "success" | "error") => void;
}) {
  const { t } = useI18n();
  const { confirm, ConfirmHost } = useConfirm();
  const [tree, setTree] = useState<AdsManageTree | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Optimistic per-row state: authoritative until the background refetch lands.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ level: Level; id: string; name: string } | null>(null);
  const [drawer, setDrawer] = useState<{ adset: ManageAdset; cboLocked: boolean } | null>(null);
  const [adPreview, setAdPreview] = useState<{ adId: string; html?: string; error?: string } | null>(null);

  const canEdit = !!tree?.can_edit;

  function load(silent = false) {
    if (!silent) setRefreshing(true);
    setLoadErr(null);
    api.adsManageTree(id)
      .then(setTree)
      .catch((e) => setLoadErr(String(e)))
      .finally(() => setRefreshing(false));
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function flipCollapse(key: string) {
    setCollapsed((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  // Patch one entity's configured status in the local tree (optimistic merge).
  function patchStatus(level: Level, entityId: string, status: string) {
    setTree((tr) => {
      if (!tr) return tr;
      const next = structuredClone(tr) as AdsManageTree;
      for (const c of next.campaigns) {
        if (level === "campaign" && c.id === entityId) c.status = status;
        for (const s of c.adsets) {
          if (level === "adset" && s.id === entityId) s.status = status;
          for (const ad of s.ads) if (level === "ad" && ad.id === entityId) ad.status = status;
        }
      }
      return next;
    });
  }

  async function toggle(level: Level, entityId: string, name: string, cur: string) {
    const toStatus = cur === "ACTIVE" ? "PAUSED" : "ACTIVE";
    // Spend guards: turning ON a campaign/adset or OFF a campaign gets a confirm;
    // flipping a single ad is routine, exactly like Meta.
    if (level !== "ad") {
      const activating = toStatus === "ACTIVE";
      const okd = await confirm({
        title: activating ? t("ads.turnOnTitle", { name }) : t("ads.turnOffTitle", { name }),
        message: activating ? t("ads.turnOnMsg") : t("ads.turnOffMsg"),
        danger: !activating && level === "campaign",
      });
      if (!okd) return;
    }
    setPending((p) => ({ ...p, [entityId]: true }));
    patchStatus(level, entityId, toStatus);
    try {
      await api.setAdsEntityStatus(id, level, entityId, toStatus);
      notify(t("ads.statusUpdated"), "success");
      load(true); // pick up descendants' effective_status
    } catch (e) {
      patchStatus(level, entityId, cur); // revert
      notify(String(e), "error");
    } finally {
      setPending((p) => { const n = { ...p }; delete n[entityId]; return n; });
    }
  }

  async function saveRename() {
    if (!editing) return;
    const { level, id: entityId, name } = editing;
    if (!name.trim()) { setEditing(null); return; }
    setPending((p) => ({ ...p, [entityId]: true }));
    try {
      await api.renameAdsEntity(id, level, entityId, name.trim());
      notify(t("ads.renamed"), "success");
      setEditing(null);
      load(true);
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setPending((p) => { const n = { ...p }; delete n[entityId]; return n; });
    }
  }

  async function deleteAd(adId: string, name: string) {
    const okd = await confirm({
      title: t("ads.deleteAdTitle"),
      message: `${name} - ${t("ads.deleteAdMsg")}`,
      danger: true, confirmLabel: t("common.delete"),
    });
    if (!okd) return;
    setPending((p) => ({ ...p, [adId]: true }));
    try {
      await api.deleteMetaAd(id, adId);
      notify(t("ads.adDeleted"), "success");
      load(true);
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setPending((p) => { const n = { ...p }; delete n[adId]; return n; });
    }
  }

  async function openAdPreview(adId: string) {
    setAdPreview({ adId });
    try { const r = await api.adPreviewHTML(id, adId); setAdPreview({ adId, html: r.html }); }
    catch (e) { setAdPreview({ adId, error: String(e) }); }
  }

  // Name cell: chevron + type icon + name (inline editable) + hover actions.
  function NameCell({ level, entityId, name, depth, hasChildren, childKey, thumb, extraActions }: {
    level: Level; entityId: string; name: string; depth: number;
    hasChildren?: boolean; childKey?: string; thumb?: string;
    extraActions?: React.ReactNode;
  }) {
    const Icon = level === "campaign" ? Megaphone : level === "adset" ? Layers : ImageIcon;
    const isEditing = editing?.id === entityId;
    return (
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1.5 min-w-0 group" style={{ paddingLeft: depth * 18 }}>
          {hasChildren && childKey ? (
            <button onClick={() => flipCollapse(childKey)} className="p-0.5 rounded hover:bg-muted outline-none shrink-0">
              {collapsed.has(childKey) ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          ) : <span className="w-[18px] shrink-0" />}
          {thumb
            ? <img src={thumb} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
            : <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          {isEditing ? (
            <input autoFocus value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditing(null); }}
              onBlur={() => setEditing(null)}
              className="h-6 px-1.5 rounded border border-input bg-background text-[12px] outline-none focus:border-primary min-w-0 w-full max-w-[260px]" />
          ) : (
            <span className="text-[12px] font-medium text-foreground truncate" title={name}>{name}</span>
          )}
          {canEdit && !isEditing && (
            <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
              <button onClick={() => setEditing({ level, id: entityId, name })}
                className="p-0.5 rounded hover:bg-muted outline-none" aria-label="Rename">
                <Pencil className="w-3 h-3 text-muted-foreground" />
              </button>
              {extraActions}
            </span>
          )}
        </div>
      </td>
    );
  }

  if (loadErr) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-[13px] text-destructive break-words">{t(loadErr)}</p>
        <button onClick={() => load()} className="mt-3 px-3 h-8 rounded-lg border border-border text-[12.5px] font-semibold hover:bg-muted outline-none">{t("ads.retry")}</button>
      </div>
    );
  }
  if (!tree) {
    return <div className="rounded-xl border border-border bg-card p-10 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  if (tree.campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Megaphone className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-[13px] text-muted-foreground">{t("ads.manageEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ConfirmHost}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground truncate">{tree.account_name}</p>
          <p className="text-[11.5px] text-muted-foreground">{t("ads.manageWindowNote")}{!canEdit && ` · ${t("ads.reportingOnly")}`}</p>
        </div>
        <button onClick={() => load()} disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border text-[12.5px] font-semibold hover:bg-muted outline-none disabled:opacity-60">
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} /> {t("common.refresh")}
        </button>
      </div>

      {tree.error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
          <span className="break-words">{t("ads.partialFetch", { err: tree.error })}</span>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-[12px] whitespace-nowrap">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/60 backdrop-blur text-left">
              <th className="px-2 py-2 w-10" />
              <th className="px-2 py-2 font-semibold text-[11px] uppercase text-muted-foreground">{t("ads.colName")}</th>
              <th className="px-2 py-2 font-semibold text-[11px] uppercase text-muted-foreground">{t("ads.colDelivery")}</th>
              <th className="px-2 py-2 font-semibold text-[11px] uppercase text-muted-foreground">{t("ads.colBudget")}</th>
              <th className="px-2 py-2 font-semibold text-[11px] uppercase text-muted-foreground text-right">{t("ads.colLeads")}</th>
              <th className="px-2 py-2 font-semibold text-[11px] uppercase text-muted-foreground text-right hidden lg:table-cell">{t("ads.colImpressions")}</th>
              <th className="px-2 py-2 font-semibold text-[11px] uppercase text-muted-foreground text-right hidden lg:table-cell">{t("ads.colClicks")}</th>
              <th className="px-2 py-2 font-semibold text-[11px] uppercase text-muted-foreground text-right hidden md:table-cell">{t("ads.colCtr")}</th>
              <th className="px-2 py-2 font-semibold text-[11px] uppercase text-muted-foreground text-right">{t("ads.colSpend")}</th>
              <th className="px-2 py-2 font-semibold text-[11px] uppercase text-muted-foreground text-right hidden md:table-cell">{t("ads.colCpl")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {tree.campaigns.map((c) => (
              <Fragment key={c.id}>
                <tr className="bg-muted/30">
                  <td className="px-2 py-1.5">
                    <StatusToggle on={c.status === "ACTIVE"} busy={!!pending[c.id]} disabled={!canEdit}
                      onFlip={() => toggle("campaign", c.id, c.name, c.status)} />
                  </td>
                  <NameCell level="campaign" entityId={c.id} name={c.name} depth={0}
                    hasChildren childKey={`c:${c.id}`} />
                  <td className="px-2 py-1.5"><DeliveryChip status={c.effective_status} /></td>
                  <td className="px-2 py-1.5 text-[11.5px] text-muted-foreground">
                    {c.daily_budget > 0 ? `${rp(c.daily_budget)}${t("ads.perDay")} · ${t("ads.cboBudget")}` : "-"}
                  </td>
                  <MetricCells m={c.metrics} />
                </tr>
                {!collapsed.has(`c:${c.id}`) && c.adsets.map((s) => (
                  <Fragment key={s.id}>
                    <tr>
                      <td className="px-2 py-1.5">
                        <StatusToggle on={s.status === "ACTIVE"} busy={!!pending[s.id]} disabled={!canEdit}
                          onFlip={() => toggle("adset", s.id, s.name, s.status)} />
                      </td>
                      <NameCell level="adset" entityId={s.id} name={s.name} depth={1}
                        hasChildren childKey={`s:${s.id}`}
                        extraActions={
                          <button onClick={() => setDrawer({ adset: s, cboLocked: c.daily_budget > 0 })}
                            className="p-0.5 rounded hover:bg-muted outline-none" aria-label={t("ads.editAdset")}>
                            <Wallet className="w-3 h-3 text-muted-foreground" />
                          </button>
                        } />
                      <td className="px-2 py-1.5"><DeliveryChip status={s.effective_status} /></td>
                      <td className="px-2 py-1.5 text-[11.5px]">
                        {s.daily_budget > 0 ? `${rp(s.daily_budget)}${t("ads.perDay")}` : c.daily_budget > 0 ? t("ads.cboBudget") : "-"}
                        {s.end_time && <span className="text-muted-foreground"> · {new Date(s.end_time).toLocaleDateString("id-ID")}</span>}
                      </td>
                      <MetricCells m={s.metrics} />
                    </tr>
                    {!collapsed.has(`s:${s.id}`) && s.ads.map((ad) => (
                      <tr key={ad.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-2 py-1.5">
                          <StatusToggle on={ad.status === "ACTIVE"} busy={!!pending[ad.id]} disabled={!canEdit}
                            onFlip={() => toggle("ad", ad.id, ad.name, ad.status)} />
                        </td>
                        <NameCell level="ad" entityId={ad.id} name={ad.name} depth={2} thumb={ad.thumbnail}
                          extraActions={
                            <>
                              <button onClick={() => openAdPreview(ad.id)} className="p-0.5 rounded hover:bg-muted outline-none" aria-label={t("ads.preview")}>
                                <Eye className="w-3 h-3 text-muted-foreground" />
                              </button>
                              <button onClick={() => deleteAd(ad.id, ad.name)} className="p-0.5 rounded hover:bg-muted outline-none" aria-label={t("common.delete")}>
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </button>
                            </>
                          } />
                        <td className="px-2 py-1.5"><DeliveryChip status={ad.effective_status} /></td>
                        <td className="px-2 py-1.5 text-[11.5px] text-muted-foreground">-</td>
                        <MetricCells m={ad.metrics} />
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Ad set drawer: budget + schedule ── */}
      {drawer && (
        <AdsetDrawer campaignId={id} adset={drawer.adset} cboLocked={drawer.cboLocked}
          notify={notify} onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); load(true); }} />
      )}

      {/* ── Meta official ad preview ── */}
      {adPreview && (
        <div className="fixed inset-0 z-[80] bg-black/50 grid place-items-center p-4" onClick={() => setAdPreview(null)}>
          <div className="bg-card rounded-xl border border-border p-3 max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12.5px] font-semibold text-foreground">{t("ads.adPreview")}</p>
              <button onClick={() => setAdPreview(null)} className="p-1 rounded-md hover:bg-muted outline-none"><X className="w-4 h-4" /></button>
            </div>
            {adPreview.error ? (
              <p className="w-[340px] text-[12.5px] text-destructive break-words">{adPreview.error}</p>
            ) : adPreview.html ? (
              <div dangerouslySetInnerHTML={{ __html: adPreview.html }} />
            ) : (
              <div className="w-[340px] h-[420px] grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Right slide-in drawer for ad set budget + schedule. Sends only what changed;
// targeting deliberately has no home here (owned by Launch/apply).
function AdsetDrawer({ campaignId, adset, cboLocked, notify, onClose, onSaved }: {
  campaignId: string; adset: ManageAdset; cboLocked: boolean;
  notify: (m: string, s?: "success" | "error") => void;
  onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [budgetStr, setBudgetStr] = useState(adset.daily_budget > 0 ? String(adset.daily_budget) : "");
  const toLocal = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [start, setStart] = useState(toLocal(adset.start_time));
  const [end, setEnd] = useState(toLocal(adset.end_time));
  const [noEnd, setNoEnd] = useState(!adset.end_time);
  const [busy, setBusy] = useState(false);

  async function save() {
    const body: { daily_budget?: number; start_time?: string; end_time?: string; clear_end_time?: boolean } = {};
    const budget = parseInt(budgetStr, 10);
    if (!cboLocked && budget > 0 && budget !== adset.daily_budget) body.daily_budget = budget;
    if (start && toLocal(adset.start_time) !== start) body.start_time = new Date(start).toISOString();
    if (noEnd) {
      if (adset.end_time) body.clear_end_time = true;
    } else if (end && toLocal(adset.end_time) !== end) {
      body.end_time = new Date(end).toISOString();
    }
    if (Object.keys(body).length === 0) { onClose(); return; }
    setBusy(true);
    try {
      await api.updateAdsetSettings(campaignId, adset.id, body);
      notify(t("ads.settingsSaved"), "success");
      onSaved();
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-card border-l border-border shadow-xl p-5 overflow-y-auto animate-slide-in-right">
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-foreground truncate">{t("ads.editAdset")}</p>
            <p className="text-[11.5px] text-muted-foreground truncate">{adset.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted outline-none"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.dailyBudget")}</label>
            <input type="text" inputMode="numeric" value={budgetStr} disabled={cboLocked}
              onChange={(e) => setBudgetStr(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-[13px] outline-none focus:border-primary disabled:opacity-60" />
            {cboLocked && <p className="mt-1 text-[11px] text-muted-foreground">{t("ads.cboLockedNote")}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.startTime")}</label>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border border-input bg-background text-[12.5px] outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.endTime")}</label>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} disabled={noEnd}
                className="w-full h-9 px-2 rounded-lg border border-input bg-background text-[12.5px] outline-none focus:border-primary disabled:opacity-60" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-foreground">
            <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} className="rounded border-input accent-primary" />
            {t("ads.noEndDate")}
          </label>
          <p className="text-[11.5px] text-muted-foreground">{t("ads.learningNote")}</p>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
          <button onClick={onClose} className="px-3 h-9 rounded-lg border border-border text-[12.5px] font-semibold hover:bg-muted outline-none">{t("common.cancel")}</button>
          <button onClick={save} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 outline-none disabled:opacity-60">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
