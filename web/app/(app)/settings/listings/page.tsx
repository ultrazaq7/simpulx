"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Plus, Pencil, Home, Trash2, GripVertical, Star, X, Upload } from "lucide-react";
import { api, getUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Listing, ListingPhoto, Campaign, OrgSettings } from "@/lib/types";
import { Select } from "@/components/Select";
import SidePanel from "@/components/SidePanel";
import { useToast, FieldLabel, INPUT_CLASS } from "../_shared";
import { useConfirm } from "@/components/ConfirmDialog";
import { useI18n } from "@/lib/i18n";

// Property e-catalog admin. Org-scoped inventory behind the public listing site
// (/listing/{org-slug}). Only reachable when the org's industry is property; the
// nav item is hidden otherwise and this page redirects out as a backstop.

const PROPERTY_TYPES = ["Rumah", "Ruko", "Apartemen", "Tanah", "Kavling", "Gudang", "Villa", "Kost"];
const CERTIFICATES = ["SHM", "HGB", "PPJB", "AJB", "Girik", "Strata Title"];
const STATUS_VALUES = ["draft", "published", "sold", "archived"] as const;
const STATUS_KEY: Record<string, string> = {
  draft: "settings.listingStatusDraft", published: "settings.listingStatusPublished",
  sold: "settings.listingStatusSold", archived: "settings.listingStatusArchived",
};
const MAX_PHOTOS = 15;

const fmtIDR = (n: number | null) => (n == null ? "-" : "Rp " + Math.round(n).toLocaleString("id-ID"));

export default function ListingsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { notify, ToastHost } = useToast();
  const { confirm, ConfirmHost } = useConfirm();
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [panel, setPanel] = useState<{ listing?: Listing } | null>(null);

  function load() {
    api.listListings().then(setRows).catch(() => setRows([]));
  }
  useEffect(() => {
    // Backstop for a hand-typed URL: the nav already hides this for non-property orgs.
    api.me().then((u) => { if (!u.is_property) router.replace("/settings"); else load(); }).catch(() => router.replace("/settings"));
    api.listCampaigns().then(setCampaigns).catch(() => {});
  }, [router]);

  const all = rows ?? [];

  return (
    <>
      {ToastHost}{ConfirmHost}
      <div className="px-6 pt-6 pb-6 w-full h-full flex flex-col min-h-0">
        <MicrositeCard notify={notify} onError={(e) => notify(e, "error")} />
        <div className="bg-card rounded-lg border border-border shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="p-3 flex items-center justify-between border-b border-border shrink-0">
            <p className="text-[13px] text-muted-foreground pl-1">
              {t("settings.listingCountSummary", { total: all.length, live: all.filter((l) => l.status === "published").length })}
            </p>
            <button onClick={() => setPanel({})}
              className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none">
              <Plus className="w-4 h-4" />{t("settings.listingNewUnit")}
            </button>
          </div>

          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-sm min-w-[880px] whitespace-nowrap">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-muted/40 backdrop-blur">
                  {[t("settings.listingUnit"), t("settings.listingType"), t("settings.listingPrice"), t("settings.listingLocation"), t("settings.listingLandBuilding"), t("automation.status"), ""].map((h) => (
                    <th key={h} className={cn("px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground",
                      h === t("settings.listingPrice") || h === t("settings.listingLandBuilding") ? "text-right" : h === "" ? "text-right w-16" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows === null ? (
                  <tr><td colSpan={7} className="text-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></td></tr>
                ) : all.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-16">
                    <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3"><Home className="w-6 h-6 text-muted-foreground/50" /></div>
                    <p className="font-semibold text-foreground mb-0.5">{t("settings.listingEmptyTitle")}</p>
                    <p className="text-[13px] text-muted-foreground">{t("settings.listingEmptyBody")}</p>
                  </td></tr>
                ) : all.map((l) => (
                  <tr key={l.id} className="border-b border-border/60 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-11 h-9 rounded-md bg-muted overflow-hidden shrink-0 grid place-items-center">
                          {l.photos?.[0]?.url
                            ? <Image src={l.photos[0].url} alt="" width={44} height={36} className="w-full h-full object-cover" unoptimized />
                            : <Home className="w-4 h-4 text-muted-foreground/50" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-foreground truncate max-w-[260px]">{l.title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{t("settings.listingPhotosCount", { n: l.photos?.length || 0 })}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-foreground">{l.property_type || "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[13px] font-semibold text-foreground">{fmtIDR(l.price)}</td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground truncate max-w-[200px]">{l.location_area || l.city || "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[12.5px] text-muted-foreground">
                      {l.land_area || l.building_area ? `${l.land_area ?? "-"} / ${l.building_area ?? "-"}` : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold",
                        l.status === "published" ? "bg-success/10 text-success"
                          : l.status === "sold" ? "bg-amber-500/10 text-amber-600"
                            : "bg-muted text-muted-foreground")}>
                        {STATUS_KEY[l.status] ? t(STATUS_KEY[l.status]) : l.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => setPanel({ listing: l })} className="p-1.5 rounded-md hover:bg-muted outline-none transition-colors text-muted-foreground hover:text-foreground"><Pencil className="w-[17px] h-[17px]" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {panel && (
        <ListingPanel listing={panel.listing} campaigns={campaigns}
          onClose={() => setPanel(null)}
          onDone={(msg) => { setPanel(null); notify(msg); load(); }}
          onError={(e) => notify(e, "error")}
          confirm={confirm} />
      )}
    </>
  );
}

// Microsite identity. Each client's listing site lives at its own URL and renders
// with its own logo/colour/tagline, so it reads as THEIR site rather than a shared
// Simpulx template. Stored in organizations.settings.branding.
function MicrositeCard({ notify, onError }: { notify: (m: string) => void; onError: (e: string) => void }) {
  const { t } = useI18n();
  const [slug, setSlug] = useState("");
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [logo, setLogo] = useState("");
  const [accent, setAccent] = useState("#0E5B54");
  const [tagline, setTagline] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const logoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.getOrganization().then((o) => {
      const s = (o.settings ?? {}) as OrgSettings;
      setSettings(s);
      const b = s.branding ?? {};
      setLogo(b.logo_url ?? "");
      setAccent(b.accent || "#0E5B54");
      setTagline(b.tagline ?? "");
    }).catch(() => {});
    api.me().then((u) => setSlug(u.org_slug ?? "")).catch(() => {});
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      await api.updateOrganization({
        settings: { ...settings, branding: { ...(settings.branding ?? {}), logo_url: logo.trim(), accent, tagline: tagline.trim() } },
      });
      notify(t("settings.listingSiteSaved"));
    } catch (e) { onError(String(e)); } finally { setBusy(false); }
  }

  async function pickLogo(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try { const up = await api.uploadFile(f); setLogo(up.url); }
    catch (e) { onError(String(e)); } finally { setBusy(false); }
  }

  const publicPath = `/listing/${slug || "<slug-organisasi>"}`;
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}${publicPath}` : publicPath;

  return (
    <div className="bg-card rounded-lg border border-border shadow-xs mb-4 shrink-0">
      <button onClick={() => setOpen((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between outline-none">
        <div className="text-left">
          <p className="text-[13px] font-semibold text-foreground">{t("settings.listingSiteTitle")}</p>
          <p className="text-[11.5px] text-muted-foreground">{t("settings.listingSiteSubtitle")}</p>
        </div>
        <span className="text-[12px] font-semibold text-primary">{open ? t("settings.listingSiteClosePanel") : t("settings.listingSiteOpenPanel")}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
          <div>
            <FieldLabel hint={t("settings.listingSiteUrlHint")}>{t("settings.listingSiteUrl")}</FieldLabel>
            <div className="flex items-center gap-2">
              <input readOnly value={publicUrl} className={cn(INPUT_CLASS, "bg-muted/50 text-muted-foreground")} />
              <button type="button" onClick={() => { navigator.clipboard?.writeText(publicUrl); notify(t("settings.listingLinkCopied")); }}
                className="h-9 px-3 rounded-md border border-input text-[13px] font-semibold hover:bg-muted transition-colors outline-none shrink-0">{t("settings.listingCopy")}</button>
              <a href={publicPath} target="_blank" rel="noopener noreferrer"
                className="h-9 px-3 rounded-md border border-input text-[13px] font-semibold hover:bg-muted transition-colors outline-none shrink-0 inline-flex items-center">{t("settings.listingOpen")}</a>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel>{t("settings.listingLogo")}</FieldLabel>
              <div className="flex items-center gap-2">
                <div className="w-16 h-10 rounded-md border border-border bg-muted/40 overflow-hidden grid place-items-center shrink-0">
                  {logo ? <Image src={logo} alt="" width={64} height={40} className="w-full h-full object-contain" unoptimized />
                        : <Home className="w-4 h-4 text-muted-foreground/50" />}
                </div>
                <button type="button" onClick={() => logoRef.current?.click()} disabled={busy}
                  className="h-9 px-3 rounded-md border border-input text-[13px] font-semibold hover:bg-muted transition-colors outline-none disabled:opacity-50">{t("settings.listingUpload")}</button>
                {logo && <button type="button" onClick={() => setLogo("")} className="text-[12px] text-red-600 font-semibold outline-none">{t("settings.listingRemove")}</button>}
              </div>
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <div>
              <FieldLabel hint={t("settings.listingAccentHint")}>{t("settings.listingAccent")}</FieldLabel>
              <div className="flex items-center gap-2">
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)}
                  className="h-9 w-12 rounded-md border border-input bg-background p-1 cursor-pointer" />
                <input value={accent} onChange={(e) => setAccent(e.target.value)} className={INPUT_CLASS} />
              </div>
            </div>
            <div>
              <FieldLabel>{t("settings.listingTagline")}</FieldLabel>
              <input value={tagline} onChange={(e) => setTagline(e.target.value)}
                placeholder={t("settings.listingTaglinePh")} className={INPUT_CLASS} />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={busy || !settings}
              className="inline-flex items-center gap-2 px-4 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark transition-all outline-none disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}{t("settings.listingSave")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ListingPanel({ listing, campaigns, onClose, onDone, onError, confirm }: {
  listing?: Listing; campaigns: Campaign[];
  onClose: () => void; onDone: (msg: string) => void; onError: (e: string) => void;
  confirm: (o: { title: string; message: string; danger?: boolean; confirmLabel?: string }) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const isEdit = !!listing;
  const [title, setTitle] = useState(listing?.title ?? "");
  const [ptype, setPtype] = useState(listing?.property_type ?? "Rumah");
  const [status, setStatus] = useState(listing?.status ?? "draft");
  const [price, setPrice] = useState(listing?.price != null ? String(listing.price) : "");
  const [area, setArea] = useState(listing?.location_area ?? "");
  const [city, setCity] = useState(listing?.city ?? "");
  const [address, setAddress] = useState(listing?.address ?? "");
  const [lat, setLat] = useState(listing?.latitude != null ? String(listing.latitude) : "");
  const [lng, setLng] = useState(listing?.longitude != null ? String(listing.longitude) : "");
  const [beds, setBeds] = useState(listing?.bedrooms != null ? String(listing.bedrooms) : "");
  const [baths, setBaths] = useState(listing?.bathrooms != null ? String(listing.bathrooms) : "");
  const [lt, setLt] = useState(listing?.land_area != null ? String(listing.land_area) : "");
  const [lb, setLb] = useState(listing?.building_area != null ? String(listing.building_area) : "");
  const [cert, setCert] = useState(listing?.certificate ?? "");
  const [desc, setDesc] = useState(listing?.description ?? "");
  const [campaignId, setCampaignId] = useState(listing?.campaign_id ?? "");
  const [photos, setPhotos] = useState<ListingPhoto[]>(listing?.photos ?? []);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { onError(t("settings.listingPhotosMax", { max: MAX_PHOTOS })); return; }
    const picked = Array.from(files).slice(0, room);
    setUploading(picked.length);
    try {
      for (const f of picked) {
        const up = await api.uploadFile(f);
        setPhotos((p) => [...p, { url: up.url, name: up.name }]);
        setUploading((n) => n - 1);
      }
    } catch (e) { onError(String(e)); } finally { setUploading(0); }
  }

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    const payload = {
      title: title.trim(), property_type: ptype, status,
      price: num(price), location_area: area.trim(), city: city.trim(), address: address.trim(),
      latitude: num(lat), longitude: num(lng),
      bedrooms: num(beds), bathrooms: num(baths),
      land_area: num(lt), building_area: num(lb),
      certificate: cert, description: desc.trim(),
      campaign_id: campaignId, photos,
    } as Partial<Listing>;
    try {
      if (isEdit && listing) { await api.updateListing(listing.id, payload); onDone(t("settings.listingSaved")); }
      else { await api.createListing(payload); onDone(t("settings.listingCreated")); }
    } catch (e) { onError(String(e)); } finally { setBusy(false); }
  }

  return (
    <SidePanel open onClose={onClose} width="lg" busy={busy}
      title={isEdit ? (listing?.title || t("settings.listingEditUnit")) : t("settings.listingNewUnitTitle")}
      onApply={submit} applyLabel={isEdit ? t("settings.listingSave") : t("settings.listingCreate")} applyDisabled={!title.trim()}>
      <div className="space-y-4">
        <div><FieldLabel>{t("settings.listingUnitName")}</FieldLabel>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("settings.listingUnitNamePh")} className={INPUT_CLASS} /></div>

        <div className="grid grid-cols-2 gap-4">
          <div><FieldLabel>{t("settings.listingPropertyType")}</FieldLabel>
            <Select value={ptype} onChange={setPtype} searchable={false} options={PROPERTY_TYPES.map((p) => ({ value: p, label: p }))} /></div>
          <div><FieldLabel>{t("automation.status")}</FieldLabel>
            <Select value={status} onChange={setStatus} searchable={false} options={STATUS_VALUES.map((v) => ({ value: v, label: t(STATUS_KEY[v]) }))} /></div>
        </div>

        <div><FieldLabel hint={t("settings.listingPriceHint")}>{t("settings.listingPrice")} (Rp)</FieldLabel>
          <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} placeholder="800000000" className={INPUT_CLASS} />
          {price && <p className="text-[11px] text-muted-foreground mt-1">{fmtIDR(Number(price))}</p>}</div>

        {/* Photos: ordered, first = cover. Upload goes through the shared
            /api/uploads endpoint (MinIO), same as chat media. */}
        <div>
          <FieldLabel hint={t("settings.listingPhotosHint", { max: MAX_PHOTOS })}>{t("settings.listingPhotos")}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={p.url + i} className="relative w-[92px] h-[70px] rounded-md overflow-hidden border border-border group">
                <Image src={p.url} alt="" width={92} height={70} className="w-full h-full object-cover" unoptimized />
                {i === 0 && <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-black/60 text-white text-[9px] font-bold"><Star className="w-2.5 h-2.5" />{t("settings.listingCover")}</span>}
                <div className="absolute inset-x-0 bottom-0 flex opacity-0 group-hover:opacity-100 transition-opacity">
                  {i > 0 && (
                    <button type="button" title={t("settings.listingMakeCover")}
                      onClick={() => setPhotos((ps) => [ps[i], ...ps.filter((_, k) => k !== i)])}
                      className="flex-1 bg-black/70 text-white text-[10px] py-0.5 hover:bg-black/85"><GripVertical className="w-3 h-3 mx-auto" /></button>
                  )}
                  <button type="button" title={t("settings.listingRemove")}
                    onClick={() => setPhotos((ps) => ps.filter((_, k) => k !== i))}
                    className="flex-1 bg-red-600/80 text-white text-[10px] py-0.5 hover:bg-red-600"><X className="w-3 h-3 mx-auto" /></button>
                </div>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading > 0}
                className="w-[92px] h-[70px] rounded-md border border-dashed border-input grid place-items-center text-muted-foreground hover:border-primary hover:text-primary transition-colors outline-none disabled:opacity-50">
                {uploading > 0 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><FieldLabel>{t("settings.listingArea")}</FieldLabel>
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Sawangan" className={INPUT_CLASS} /></div>
          <div><FieldLabel>{t("settings.listingCity")}</FieldLabel>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Depok" className={INPUT_CLASS} /></div>
        </div>

        <div><FieldLabel>{t("settings.listingAddress")}</FieldLabel>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jl. Raya Sawangan No. 12" className={INPUT_CLASS} /></div>

        <div className="grid grid-cols-4 gap-3">
          <div><FieldLabel>{t("settings.listingBedrooms")}</FieldLabel><input inputMode="numeric" value={beds} onChange={(e) => setBeds(e.target.value.replace(/[^\d]/g, ""))} placeholder="2" className={INPUT_CLASS} /></div>
          <div><FieldLabel>{t("settings.listingBathrooms")}</FieldLabel><input inputMode="numeric" value={baths} onChange={(e) => setBaths(e.target.value.replace(/[^\d]/g, ""))} placeholder="1" className={INPUT_CLASS} /></div>
          <div><FieldLabel>{t("settings.listingLandArea")}</FieldLabel><input inputMode="numeric" value={lt} onChange={(e) => setLt(e.target.value.replace(/[^\d.]/g, ""))} placeholder="72" className={INPUT_CLASS} /></div>
          <div><FieldLabel>{t("settings.listingBuildingArea")}</FieldLabel><input inputMode="numeric" value={lb} onChange={(e) => setLb(e.target.value.replace(/[^\d.]/g, ""))} placeholder="45" className={INPUT_CLASS} /></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><FieldLabel>{t("settings.listingCertificate")}</FieldLabel>
            <Select value={cert} onChange={setCert} searchable={false}
              options={[{ value: "", label: t("settings.listingNotSet") }, ...CERTIFICATES.map((c) => ({ value: c, label: c }))]} /></div>
          <div><FieldLabel hint={t("settings.listingCampaignHint")}>{t("settings.listingCampaignOpt")}</FieldLabel>
            <Select value={campaignId} onChange={setCampaignId}
              options={[{ value: "", label: t("settings.listingAllCampaigns") }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]} /></div>
        </div>

        <div><FieldLabel hint={t("settings.listingDescriptionHint")}>{t("settings.listingDescription")}</FieldLabel>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4}
            placeholder={t("settings.listingDescriptionPh")}
            className={cn(INPUT_CLASS, "h-auto py-2 resize-y")} /></div>

        <div className="grid grid-cols-2 gap-4">
          <div><FieldLabel hint={t("settings.listingLatHint")}>Latitude</FieldLabel>
            <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-6.4025" className={INPUT_CLASS} /></div>
          <div><FieldLabel>Longitude</FieldLabel>
            <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="106.7942" className={INPUT_CLASS} /></div>
        </div>

        {isEdit && listing && (
          <div className="pt-3 border-t border-border">
            <button type="button" disabled={busy}
              onClick={async () => {
                if (!(await confirm({ title: t("settings.listingDeleteTitle"), message: t("settings.listingDeleteBody", { title: listing.title }), danger: true, confirmLabel: t("settings.listingRemove") }))) return;
                setBusy(true);
                try { await api.deleteListing(listing.id); onDone(t("settings.listingDeleted")); }
                catch (e) { onError(String(e)); } finally { setBusy(false); }
              }}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-red-600 hover:text-red-700 outline-none disabled:opacity-50">
              <Trash2 className="w-4 h-4" />{t("settings.listingDeleteUnit")}
            </button>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
