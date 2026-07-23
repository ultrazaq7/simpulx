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
  Pencil, Trash2, Eye, X, RefreshCw, AlertTriangle, Plus, Link2, Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ConfirmDialog";
import LaunchAdsPanel from "./LaunchAdsPanel";
import type { AdsManageTree, ManageAdset, ManageMetrics, CreativeRow } from "@/lib/types";

type Level = "campaign" | "adset" | "ad";

// Esc menutup overlay teratas. `enabled` mematikan listener saat ada overlay
// lain yang numpang di atasnya (mis. picker materi di atas drawer Edit ad),
// supaya satu Esc menutup SATU lapis, bukan semuanya sekaligus.
export function useEscClose(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, enabled]);
}

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
  const [drawer, setDrawer] = useState<{ adset: ManageAdset; cboLocked: boolean } | null>(null);
  const [campDrawer, setCampDrawer] = useState<import("@/lib/types").ManageCampaign | null>(null);
  const [adDrawer, setAdDrawer] = useState<import("@/lib/types").ManageAd | null>(null);
  const [adPreview, setAdPreview] = useState<{ adId: string; html?: string; error?: string } | null>(null);
  const [swapFor, setSwapFor] = useState<{ adId: string; name: string } | null>(null);
  // Wizard "+ Create ads": the whole launch workspace lives in this drawer, so
  // creating and managing ads share ONE home instead of two confusing tabs.
  const [createOpen, setCreateOpen] = useState(false);
  const [addIdOpen, setAddIdOpen] = useState(false);

  const canEdit = !!tree?.can_edit;
  useEscClose(() => setAdPreview(null), !!adPreview);

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

  async function deleteCampaign(metaCampaignId: string, name: string) {
    const okd = await confirm({
      title: t("ads.deleteCampaignTitle"),
      message: `${name} - ${t("ads.deleteCampaignMsg")}`,
      danger: true, confirmLabel: t("common.delete"),
    });
    if (!okd) return;
    setPending((p) => ({ ...p, [metaCampaignId]: true }));
    try {
      await api.deleteMetaCampaign(id, metaCampaignId);
      notify(t("ads.campaignDeleted"), "success");
      load(true);
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setPending((p) => { const n = { ...p }; delete n[metaCampaignId]; return n; });
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

  // Name cell: chevron + type icon + name + hover actions. Semua editing lewat
  // drawer per layer (klik pencil), bukan inline: full manage, satu pola.
  function NameCell({ level, name, depth, hasChildren, childKey, thumb, extraActions }: {
    level: Level; name: string; depth: number;
    hasChildren?: boolean; childKey?: string; thumb?: string;
    extraActions?: React.ReactNode;
  }) {
    const Icon = level === "campaign" ? Megaphone : level === "adset" ? Layers : ImageIcon;
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
          <span className="text-[12px] font-medium text-foreground truncate" title={name}>{name}</span>
          {canEdit && (
            <span className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
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
      <>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Megaphone className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-[13px] text-muted-foreground mb-4">{t("ads.manageEmpty")}</p>
          <button onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 outline-none">
            <Plus className="w-3.5 h-3.5" /> {t("ads.createAds")}
          </button>
        </div>
        {createOpen && (
          <CreateAdsDrawer id={id} notify={notify}
            onClose={() => { setCreateOpen(false); load(true); }} />
        )}
      </>
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
        <div className="flex items-center gap-2">
          <button onClick={() => load()} disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border text-[12.5px] font-semibold hover:bg-muted outline-none disabled:opacity-60">
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} /> {t("common.refresh")}
          </button>
          {canEdit && (
            <>
              <button onClick={() => setAddIdOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border text-[12.5px] font-semibold hover:bg-muted outline-none">
                <Link2 className="w-3.5 h-3.5" /> {t("ads.addAdId")}
              </button>
              <button onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 outline-none">
                <Plus className="w-3.5 h-3.5" /> {t("ads.createAds")}
              </button>
            </>
          )}
        </div>
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
                  <NameCell level="campaign" name={c.name} depth={0}
                    hasChildren childKey={`c:${c.id}`}
                    extraActions={
                      <>
                        <button onClick={() => setCampDrawer(c)} className="p-0.5 rounded hover:bg-muted outline-none" aria-label={t("ads.editCampaignMeta")}>
                          <Pencil className="w-3 h-3 text-muted-foreground" />
                        </button>
                        <button onClick={() => deleteCampaign(c.id, c.name)} className="p-0.5 rounded hover:bg-muted outline-none" aria-label={t("common.delete")}>
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      </>
                    } />
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
                      <NameCell level="adset" name={s.name} depth={1}
                        hasChildren childKey={`s:${s.id}`}
                        extraActions={
                          <button onClick={() => setDrawer({ adset: s, cboLocked: c.daily_budget > 0 })}
                            className="p-0.5 rounded hover:bg-muted outline-none" aria-label={t("ads.editAdset")}>
                            <Pencil className="w-3 h-3 text-muted-foreground" />
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
                        <NameCell level="ad" name={ad.name} depth={2} thumb={ad.thumbnail}
                          extraActions={
                            <>
                              <button onClick={() => setAdDrawer(ad)} className="p-0.5 rounded hover:bg-muted outline-none" aria-label={t("ads.editAd")}>
                                <Pencil className="w-3 h-3 text-muted-foreground" />
                              </button>
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

      {/* ── Drawer edit per layer ── */}
      {drawer && (
        <AdsetDrawer campaignId={id} adset={drawer.adset} cboLocked={drawer.cboLocked}
          notify={notify} onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); load(true); }} />
      )}
      {campDrawer && (
        <CampaignDrawer campaignId={id} c={campDrawer}
          notify={notify} onClose={() => setCampDrawer(null)} onSaved={() => { setCampDrawer(null); load(true); }} />
      )}
      {adDrawer && (
        <EditAdDrawer campaignId={id} ad={adDrawer}
          notify={notify} onClose={() => setAdDrawer(null)} onSaved={() => { setAdDrawer(null); load(true); }} />
      )}

      {/* ── "+ Create ads": the launch workspace as a right-side wizard ── */}
      {createOpen && (
        <CreateAdsDrawer id={id} notify={notify}
          onClose={() => { setCreateOpen(false); load(true); }} />
      )}

      {/* ── "+ Ad ID": register an externally created Meta ad for lead routing ── */}
      {addIdOpen && (
        <AddAdIdModal campaignId={id} notify={notify}
          onClose={() => setAddIdOpen(false)} />
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

// The launch workspace, rehomed as a right-side wizard drawer: geo, copy,
// audience, creatives, page, then Launch/Apply. Same component, one entry
// point, no separate tab to get lost in.
function CreateAdsDrawer({ id, notify, onClose }: {
  id: string; notify: (m: string, s?: "success" | "error") => void; onClose: () => void;
}) {
  const { t } = useI18n();
  useEscClose(onClose);
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-background border-l border-border shadow-xl overflow-y-auto animate-slide-in-right">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-background/95 backdrop-blur border-b border-border">
          <p className="text-[14px] font-bold text-foreground">{t("ads.createAds")}</p>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted outline-none"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">
          <LaunchAdsPanel id={id} notify={notify} createOnly />
        </div>
      </div>
    </div>
  );
}

// Small modal to register the Meta ad ID of an ad created OUTSIDE Simpulx, so
// its click-to-WhatsApp leads route into this campaign. Ads created through
// Simpulx register themselves automatically.
function AddAdIdModal({ campaignId, notify, onClose }: {
  campaignId: string; notify: (m: string, s?: "success" | "error") => void; onClose: () => void;
}) {
  const { t } = useI18n();
  useEscClose(onClose);
  const [idStr, setIdStr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    const adId = idStr.trim();
    if (!/^[0-9]{5,25}$/.test(adId)) { notify(t("ads.adIdInvalid"), "error"); return; }
    setBusy(true);
    try {
      const c = await api.getCampaign(campaignId);
      const cur = (c.ad_source_ids || []).filter(Boolean);
      if (!cur.includes(adId)) {
        await api.updateCampaign(campaignId, { ad_source_ids: [...cur, adId] });
      }
      notify(t("ads.adIdAdded"), "success");
      onClose();
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[80] bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[13px] font-semibold text-foreground">{t("ads.addAdId")}</p>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted outline-none"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[11.5px] text-muted-foreground mb-3">{t("ads.addAdIdHint")}</p>
        <input type="text" inputMode="numeric" value={idStr} autoFocus
          onChange={(e) => setIdStr(e.target.value.replace(/[^0-9]/g, "").slice(0, 25))}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          placeholder="120212345678900000"
          className="w-full h-9 px-3 rounded-lg border border-input bg-background text-[13px] outline-none focus:border-primary" />
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 h-8 rounded-lg border border-border text-[12.5px] font-semibold hover:bg-muted outline-none">{t("common.cancel")}</button>
          <button onClick={save} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 h-8 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 outline-none disabled:opacity-60">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Campaign layer: nama + budget CBO (kalau campaign-nya Advantage budget).
function CampaignDrawer({ campaignId, c, notify, onClose, onSaved }: {
  campaignId: string; c: import("@/lib/types").ManageCampaign;
  notify: (m: string, s?: "success" | "error") => void;
  onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  useEscClose(onClose);
  const [name, setName] = useState(c.name);
  const [budgetStr, setBudgetStr] = useState(c.daily_budget > 0 ? String(c.daily_budget) : "");
  const [busy, setBusy] = useState(false);
  async function save() {
    const body: { name?: string; daily_budget?: number } = {};
    if (name.trim() && name.trim() !== c.name) body.name = name.trim();
    const budget = parseInt(budgetStr, 10);
    if (c.daily_budget > 0 && budget > 0 && budget !== c.daily_budget) body.daily_budget = budget;
    if (Object.keys(body).length === 0) { onClose(); return; }
    setBusy(true);
    try {
      await api.updateAdsCampaignSettings(campaignId, c.id, body);
      notify(t("ads.settingsSaved"), "success");
      onSaved();
    } catch (e) {
      notify(String(e), "error");
    } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-card border-l border-border shadow-xl p-5 overflow-y-auto animate-slide-in-right">
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-foreground truncate">{t("ads.editCampaignMeta")}</p>
            <p className="text-[11.5px] text-muted-foreground truncate">{c.objective}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted outline-none"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.colName")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-[13px] outline-none focus:border-primary" />
          </div>
          {c.daily_budget > 0 ? (
            <div>
              <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.dailyBudget")}</label>
              <input type="text" inputMode="numeric" value={budgetStr}
                onChange={(e) => setBudgetStr(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))}
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-[13px] outline-none focus:border-primary" />
              <p className="mt-1 text-[11px] text-muted-foreground">{t("ads.cboBudget")}</p>
            </div>
          ) : (
            <p className="text-[11.5px] text-muted-foreground">{t("ads.budgetOnAdset")}</p>
          )}
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

// Ad layer: nama, teks (utama/judul/deskripsi), dan ganti materi. Menyimpan
// membangun creative baru di Meta lalu menukar in place: ad id + riwayat tetap.
function EditAdDrawer({ campaignId, ad, notify, onClose, onSaved }: {
  campaignId: string; ad: import("@/lib/types").ManageAd;
  notify: (m: string, s?: "success" | "error") => void;
  onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(ad.name);
  const [message, setMessage] = useState(ad.body || "");
  const [headline, setHeadline] = useState(ad.title || "");
  const [desc, setDesc] = useState("");
  const [creativeId, setCreativeId] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEscClose(onClose, !pickOpen);
  // Saran AI: varian copy dari generator campaign (segment/brand/kota/katalog),
  // klik chip = isi field. Generate on demand supaya tidak ada token terbuang.
  const [sug, setSug] = useState<{ primary_texts: string[]; headlines: string[]; descriptions: string[] } | null>(null);
  const [sugBusy, setSugBusy] = useState(false);

  async function suggest() {
    setSugBusy(true);
    try {
      const r = await api.generateAdCopy(campaignId);
      setSug({ primary_texts: r.primary_texts || [], headlines: r.headlines || [], descriptions: r.descriptions || [] });
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setSugBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      if (name.trim() && name.trim() !== ad.name) {
        await api.renameAdsEntity(campaignId, "ad", ad.id, name.trim());
      }
      const textChanged = message.trim() !== (ad.body || "").trim()
        || headline.trim() !== (ad.title || "").trim() || desc.trim() !== "";
      if (creativeId || textChanged) {
        await api.editAdCreative(campaignId, ad.id, {
          creative_id: creativeId || undefined,
          message: message.trim() || undefined,
          headline: headline.trim() || undefined,
          description: desc.trim() || undefined,
        });
      }
      notify(t("ads.adUpdated"), "success");
      onSaved();
    } catch (e) {
      notify(String(e), "error");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-card border-l border-border shadow-xl p-5 overflow-y-auto animate-slide-in-right">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[14px] font-bold text-foreground truncate">{t("ads.editAd")}</p>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted outline-none"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {ad.thumbnail && <img src={creativeId ? undefined : ad.thumbnail} alt="" className="w-14 h-14 rounded-lg object-cover border border-border" style={creativeId ? { display: "none" } : undefined} />}
            <button onClick={() => setPickOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-border text-[12.5px] font-semibold hover:bg-muted outline-none">
              <RefreshCw className="w-3.5 h-3.5" /> {creativeId ? t("ads.swapped") : t("ads.swapCreative")}
            </button>
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.colName")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-[13px] outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.primaryTextField")}</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-[13px] outline-none focus:border-primary resize-y" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.headlineField")}</label>
              <input value={headline} onChange={(e) => setHeadline(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-[13px] outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.descriptionField")}</label>
              <input value={desc} onChange={(e) => setDesc(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-[13px] outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <button onClick={suggest} disabled={sugBusy}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-primary/40 text-primary text-[12.5px] font-semibold hover:bg-primary/5 outline-none disabled:opacity-60">
              {sugBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {t("ads.suggestAi")}
            </button>
            {sug && (
              <div className="mt-3 space-y-3">
                {sug.primary_texts.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1">{t("ads.primaryTextField")}</p>
                    <div className="flex flex-col gap-1.5">
                      {sug.primary_texts.slice(0, 3).map((v, i) => (
                        <button key={i} onClick={() => setMessage(v)}
                          className={cn("text-left text-[12px] px-2.5 py-1.5 rounded-lg border transition-colors",
                            message === v ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {sug.headlines.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1">{t("ads.headlineField")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sug.headlines.slice(0, 5).map((v, i) => (
                        <button key={i} onClick={() => setHeadline(v)}
                          className={cn("text-[12px] px-2.5 py-1 rounded-full border transition-colors",
                            headline === v ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {sug.descriptions.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1">{t("ads.descriptionField")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {sug.descriptions.slice(0, 5).map((v, i) => (
                        <button key={i} onClick={() => setDesc(v)}
                          className={cn("text-[12px] px-2.5 py-1 rounded-full border transition-colors",
                            desc === v ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-[11.5px] text-muted-foreground">{t("ads.editAdNote")}</p>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-border">
          <button onClick={onClose} className="px-3 h-9 rounded-lg border border-border text-[12.5px] font-semibold hover:bg-muted outline-none">{t("common.cancel")}</button>
          <button onClick={save} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 outline-none disabled:opacity-60">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {t("common.save")}
          </button>
        </div>
      </div>
      {pickOpen && (
        <CreativePicker campaignId={campaignId} adName={ad.name}
          onPick={(cid) => { setCreativeId(cid); setPickOpen(false); }}
          onClose={() => setPickOpen(false)} />
      )}
    </div>
  );
}

// Picker modal: choose which uploaded campaign creative replaces the ad's
// current one. The swap happens in place on Meta (same ad id, history kept).
function CreativePicker({ campaignId, adName, onPick, onClose }: {
  campaignId: string; adName: string; onPick: (creativeId: string) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<CreativeRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  useEscClose(onClose);
  useEffect(() => {
    api.listCreatives(campaignId).then(setRows).catch(() => setRows([]));
  }, [campaignId]);
  // Upload materi BARU langsung dari picker (add, bukan cuma pilih yang ada);
  // sukses = langsung terpilih untuk iklan ini.
  async function uploadNew(f: File) {
    setUploading(true);
    const fd = new FormData(); fd.append("file", f);
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/creatives`, {
        method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("simpulx_token")}` }, body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      if (d?.id) onPick(d.id);
    } catch {
      setUploading(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[80] bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border p-4 w-full max-w-md max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[13px] font-semibold text-foreground">{t("ads.swapCreative")}</p>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted outline-none"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[11.5px] text-muted-foreground mb-3 truncate">{adName} · {t("ads.swapPick")}</p>
        {!rows ? (
          <div className="h-32 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground py-6 text-center">{t("ads.swapNone")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <label className={cn("rounded-lg border border-dashed border-border grid place-items-center h-[6.75rem] cursor-pointer hover:border-primary transition-colors text-center",
              uploading && "opacity-60 pointer-events-none")}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
                <span className="text-[11px] font-semibold text-muted-foreground px-2">+ {t("ads.uploadNew")}</span>
              )}
              <input type="file" accept="image/*,video/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadNew(f); }} />
            </label>
            {rows.map((c) => (
              <button key={c.id} onClick={() => onPick(c.id)}
                className="rounded-lg border border-border overflow-hidden hover:border-primary transition-colors outline-none text-left">
                {c.media_type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.file_url} alt="" className="w-full h-20 object-cover" />
                ) : (
                  <video src={c.file_url} className="w-full h-20 object-cover" muted />
                )}
                <p className="px-1.5 py-1 text-[10.5px] text-muted-foreground truncate">{c.file_name || c.media_type}</p>
              </button>
            ))}
          </div>
        )}
      </div>
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
  const [name, setName] = useState(adset.name);
  useEscClose(onClose);
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [gender, setGender] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const body: { name?: string; daily_budget?: number; start_time?: string; end_time?: string; clear_end_time?: boolean; age_min?: number; age_max?: number; gender?: string } = {};
    if (name.trim() && name.trim() !== adset.name) body.name = name.trim();
    const budget = parseInt(budgetStr, 10);
    if (!cboLocked && budget > 0 && budget !== adset.daily_budget) body.daily_budget = budget;
    if (start && toLocal(adset.start_time) !== start) body.start_time = new Date(start).toISOString();
    if (noEnd) {
      if (adset.end_time) body.clear_end_time = true;
    } else if (end && toLocal(adset.end_time) !== end) {
      body.end_time = new Date(end).toISOString();
    }
    if (parseInt(ageMin, 10) >= 13) body.age_min = parseInt(ageMin, 10);
    if (parseInt(ageMax, 10) > 0) body.age_max = parseInt(ageMax, 10);
    if (gender) body.gender = gender;
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
            <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.colName")}</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-[13px] outline-none focus:border-primary" />
          </div>
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
          {/* Audience: kosong = tidak diubah; backend mem-patch targeting yang ada,
              geo dan placement tidak tersentuh. */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.ageRange")} min</label>
              <input type="text" inputMode="numeric" value={ageMin} placeholder="-"
                onChange={(e) => setAgeMin(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                className="w-full h-9 px-2 rounded-lg border border-input bg-background text-[12.5px] outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.ageRange")} max</label>
              <input type="text" inputMode="numeric" value={ageMax} placeholder="-"
                onChange={(e) => setAgeMax(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                className="w-full h-9 px-2 rounded-lg border border-input bg-background text-[12.5px] outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-muted-foreground mb-1">{t("ads.gender")}</label>
              <select value={gender} onChange={(e) => setGender(e.target.value)}
                className="w-full h-9 px-2 rounded-lg border border-input bg-background text-[12.5px] outline-none focus:border-primary">
                <option value="">-</option>
                <option value="all">{t("ads.genderAll")}</option>
                <option value="male">{t("ads.genderMale")}</option>
                <option value="female">{t("ads.genderFemale")}</option>
              </select>
            </div>
          </div>
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
