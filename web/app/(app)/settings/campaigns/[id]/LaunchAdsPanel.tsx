"use client";
// Pre-launch workspace: resolve geo, generate + approve copy, suggest audience,
// upload creative, then a preview that lists every remaining blocker.
//
// The whole panel is organised around the preview's `blockers`. That list is the
// backend's answer to "can this go", so the UI never decides readiness on its
// own: a Launch button whose enabled-ness disagrees with the server is how a
// campaign gets created half-formed, or fails at Meta with a code nobody can
// read. Each blocker names what to fix, so the panel is a checklist, not a wall.
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Sparkles, Upload, Trash2, Check, AlertTriangle, Users, Image as ImageIcon, Flag, Rocket, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AdsPreview, GeoCityResult, AdCopyRow, CreativeRow, GeoCandidate } from "@/lib/types";

export default function LaunchAdsPanel({ id, notify, createOnly }: {
  id: string; notify: (m: string, s?: "success" | "error") => void;
  // createOnly + sudah launched: wizard "+ Buat iklan" MURNI membuat ads/creative
  // baru. Setting yang sudah hidup (budget, audience, geo, Page) diedit lewat
  // drawer per layer di Manage, jadi section-nya disembunyikan di sini.
  createOnly?: boolean;
}) {
  const [preview, setPreview] = useState<AdsPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionCreativeIds, setSessionCreativeIds] = useState<string[]>([]);

  function reload() {
    api.campaignAdsPreview(id).then(setPreview).catch((e) => notify(String(e), "error")).finally(() => setLoading(false));
  }
  useEffect(reload, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="h-40 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!preview) return null;

  const slim = !!createOnly && preview.launched;
  // Sesi Create ads: id materi yang di-upload DI SESI INI. Hanya ini yang jadi
  // iklan baru (samain Meta: bikin iklan = kanvas kosong, upload sekarang).
  return (
    <div className="flex flex-col gap-4">
      <BlockerList preview={preview} />
      {!slim && <BudgetAudienceSection id={id} preview={preview} notify={notify} onChange={reload} />}
      {!slim && <GeoSection id={id} notify={notify} onChange={reload} />}
      <CopySection id={id} notify={notify} onChange={reload} />
      {!slim && <AudienceSection id={id} notify={notify} />}
      <CreativeSection id={id} preview={preview} notify={notify} onChange={reload}
        freshOnly={slim} onSessionChange={slim ? setSessionCreativeIds : undefined} />
      {!slim && <PageSection id={id} preview={preview} notify={notify} onChange={reload} />}
      <PartnershipSection id={id} notify={notify} />
      <LaunchBar id={id} preview={preview} notify={notify} onRefresh={reload}
        createLabel={slim} createIds={slim ? sessionCreativeIds : undefined} />
    </div>
  );
}

// ── Partnership ad (branded content): iklan tampil dari handle IG klien ──
// Data partner disimpan di campaign; saat Launch/Buat iklan, satu ad ekstra
// dibuat dari post IG partner. Butuh permission instagram_branded_content_ads_brand
// (App Review); sampai granted, Meta menolak dan alasannya muncul sebagai warning.
function PartnershipSection({ id, notify }: { id: string; notify: (m: string, s?: "success" | "error") => void }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [igUser, setIgUser] = useState("");
  const [igMedia, setIgMedia] = useState("");
  const [adCode, setAdCode] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getCampaign(id).then((c: any) => {
      setEnabled(!!c.partnership_enabled);
      setIgUser(c.partnership_ig_user_id || "");
      setIgMedia(c.partnership_ig_media_id || "");
      setAdCode(c.partnership_ad_code || "");
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [id]);

  async function save() {
    setBusy(true);
    try {
      await api.updateCampaign(id, {
        partnership_enabled: enabled,
        partnership_ig_user_id: igUser.trim(),
        partnership_ig_media_id: igMedia.trim(),
        partnership_ad_code: adCode.trim(),
      });
      notify(t("ads.partnershipSaved"), "success");
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-[13.5px] font-bold text-foreground">{t("ads.partnershipTitle")}</h3>
        </div>
        <button onClick={() => setEnabled(!enabled)} aria-label="partnership toggle"
          className={`relative w-9 h-5 rounded-full transition-colors outline-none ${enabled ? "bg-primary" : "bg-gray-300"}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? "left-[18px]" : "left-0.5"}`} />
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground mt-1">{t("ads.partnershipDesc")}</p>
      {enabled && (
        <div className="mt-3 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11.5px] font-semibold text-muted-foreground mb-1">{t("ads.partnershipIgUser")}</label>
              <input value={igUser} onChange={(e) => setIgUser(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="17841400000000000"
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-[12.5px] outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[11.5px] font-semibold text-muted-foreground mb-1">{t("ads.partnershipIgMedia")}</label>
              <input value={igMedia} onChange={(e) => setIgMedia(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="17900000000000000"
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-[12.5px] outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="block text-[11.5px] font-semibold text-muted-foreground mb-1">{t("ads.partnershipCode")}</label>
            <input value={adCode} onChange={(e) => setAdCode(e.target.value)}
              placeholder="adcode-..."
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-[12.5px] outline-none focus:border-primary" />
          </div>
          <p className="text-[11.5px] text-muted-foreground">{t("ads.partnershipNote")}</p>
          <button onClick={save} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 h-8 rounded-lg bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 outline-none disabled:opacity-60">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {t("common.save")}
          </button>
        </div>
      )}
    </section>
  );
}

function BlockerList({ preview }: { preview: AdsPreview }) {
  const { t } = useI18n();
  if (preview.can_launch) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/[0.05] p-3 flex items-start gap-2.5">
        <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-[13px] text-foreground">{t("ads.readyBanner")}</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.05] p-3">
      <p className="text-[12.5px] font-semibold text-amber-700 dark:text-amber-500 mb-1.5 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> {t("ads.blockersLeft", { n: preview.blockers.length })}
      </p>
      <ul className="space-y-1">
        {preview.blockers.map((b, i) => (
          // t(b): teks blocker dari server berbahasa Inggris; reverse-index i18n
          // menerjemahkannya bila ada entri dengan nilai EN yang sama persis.
          <li key={i} className="text-[13px] text-foreground flex gap-2"><span className="text-muted-foreground">&middot;</span>{t(b)}</li>
        ))}
      </ul>
    </div>
  );
}

// Budget bulanan + umur + gender + Advantage+, langsung dari panel ini: banner
// "ubah budget/umur lalu Apply" harus punya tempat mengubahnya di halaman yang
// sama, bukan menyuruh user berburu ke wizard.
function BudgetAudienceSection({ id, preview, notify, onChange }: {
  id: string; preview: AdsPreview; notify: (m: string, s?: "success" | "error") => void; onChange: () => void;
}) {
  const { t } = useI18n();
  const [budget, setBudget] = useState(preview.budget.monthly != null ? String(preview.budget.monthly) : "");
  const [ageMin, setAgeMin] = useState(String(preview.audience.age_min || 18));
  const [ageMax, setAgeMax] = useState(String(preview.audience.age_max || 65));
  const [gender, setGender] = useState(preview.audience.gender || "all");
  const [advantage, setAdvantage] = useState(!!preview.audience.advantage_plus);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.updateCampaign(id, {
        monthly_budget: budget.trim() === "" ? null : Number(budget.replace(/[^0-9.]/g, "")),
        target_age_min: Math.max(13, Number(ageMin) || 18),
        target_age_max: Math.min(65, Number(ageMax) || 65),
        target_gender: gender,
        advantage_audience_enabled: advantage,
      } as never);
      notify(t("ads.budgetSaved"));
      onChange();
    } catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }

  const INPUT = "h-9 px-3 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary";
  return (
    <Section icon={Wallet} title={t("ads.budgetAudience")}>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">{t("ads.monthlyBudget")}</p>
          <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="500000" className={`${INPUT} w-36 tabular-nums`} />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">{t("ads.ageRange")}</p>
          <div className="flex items-center gap-1.5">
            <input value={ageMin} onChange={(e) => setAgeMin(e.target.value.replace(/[^0-9]/g, ""))} className={`${INPUT} w-16 tabular-nums`} />
            <span className="text-muted-foreground text-[12px]">s/d</span>
            <input value={ageMax} onChange={(e) => setAgeMax(e.target.value.replace(/[^0-9]/g, ""))} className={`${INPUT} w-16 tabular-nums`} />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground mb-1">{t("ads.gender")}</p>
          <select value={gender} onChange={(e) => setGender(e.target.value)} className={`${INPUT} w-28`}>
            <option value="all">{t("ads.genderAll")}</option>
            <option value="male">{t("ads.genderMale")}</option>
            <option value="female">{t("ads.genderFemale")}</option>
          </select>
        </div>
        <label className="flex items-center gap-2 h-9 cursor-pointer select-none">
          <input type="checkbox" checked={advantage} onChange={(e) => setAdvantage(e.target.checked)} className="accent-emerald-600" />
          <span className="text-[12.5px] text-foreground">Advantage+</span>
        </label>
        <button onClick={save} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-primary text-white text-[12.5px] font-semibold hover:bg-primary-dark outline-none disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}{t("common.save")}
        </button>
      </div>
      {advantage && <p className="mt-2 text-[11.5px] text-muted-foreground">{t("ads.advantageAgeNote")}</p>}
    </Section>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof MapPin; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border">
      <p className="text-[12.5px] font-semibold text-foreground px-3 py-2 border-b border-border flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />{title}
      </p>
      <div className="p-3">{children}</div>
    </div>
  );
}

function GeoSection({ id, notify, onChange }: { id: string; notify: (m: string, s?: "success" | "error") => void; onChange: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<GeoCityResult[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    try { const r = await api.campaignAdsGeo(id); setRows(r.cities); }
    catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }
  async function choose(query: string, c: GeoCandidate) {
    try {
      await api.chooseCampaignGeo(id, { query, meta_key: c.key, meta_type: c.type, display_name: c.name, region: c.region });
      await resolve(); onChange();
    } catch (e) { notify(String(e), "error"); }
  }

  return (
    <Section icon={MapPin} title={t("ads.locations")}>
      {!rows ? (
        <button onClick={resolve} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold hover:bg-muted outline-none disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
          {t("ads.matchCities")}
        </button>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.query} className="text-[13px]">
              {r.resolved ? (
                <div className="flex items-center gap-2 text-foreground">
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-medium">{r.query}</span>
                  <span className="text-muted-foreground">&rarr; {r.chosen?.name}{r.chosen?.region ? `, ${r.chosen.region}` : ""}</span>
                </div>
              ) : (
                <div>
                  {/* The disambiguation moment: several places match, so make the
                      human pick rather than guessing and aiming spend wrong. */}
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-500 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5" /><span className="font-medium">{r.query}</span>
                    <span className="text-muted-foreground">{t("ads.whichOne")}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-5">
                    {(r.candidates || []).slice(0, 6).map((c) => (
                      <button key={c.key} onClick={() => choose(r.query, c)}
                        className="px-2.5 h-7 rounded-full border border-border text-[12px] hover:border-primary hover:text-primary outline-none">
                        {c.name}{c.region ? ` · ${c.region}` : ""} <span className="text-muted-foreground">({c.type})</span>
                      </button>
                    ))}
                    {(!r.candidates || r.candidates.length === 0) && <span className="text-[12px] text-muted-foreground">{r.error || t("ads.noMatch")}</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function CopySection({ id, notify, onChange }: { id: string; notify: (m: string, s?: "success" | "error") => void; onChange: () => void }) {
  const { t } = useI18n();
  const [copies, setCopies] = useState<AdCopyRow[]>([]);
  const [busy, setBusy] = useState(false);

  function load() { api.listAdCopy(id).then(setCopies).catch(() => setCopies([])); }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setBusy(true);
    try { await api.generateAdCopy(id); load(); notify(t("ads.draftGenerated")); }
    catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }
  async function approve(copyId: string) {
    try { await api.approveAdCopy(id, copyId); load(); onChange(); notify(t("ads.copyApproved")); }
    catch (e) { notify(String(e), "error"); }
  }

  const latest = copies[0];
  const approved = copies.find((c) => c.status === "approved");

  return (
    <Section icon={Sparkles} title={t("ads.adCopy")}>
      <button onClick={generate} disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold hover:bg-muted outline-none disabled:opacity-50 mb-3">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {copies.length ? t("ads.regenerate") : t("ads.generateCopy")}
      </button>
      {latest && (
        <div className="space-y-2">
          {/* All variants are shown and all are sent to Meta: Advantage+ tests them
              against real traffic, so picking a winner here would just duplicate
              what Meta already does better. */}
          <CopyBlock label={t("ads.primaryText")} items={latest.primary_texts} />
          <CopyBlock label={t("ads.headlines")} items={latest.headlines} />
          <CopyBlock label={t("ads.descriptions")} items={latest.descriptions} />
          {approved ? (
            <p className="text-[12.5px] text-primary flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />{t("ads.approved")}</p>
          ) : (
            <button onClick={() => approve(latest.id)}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-primary text-white text-[12.5px] font-semibold hover:bg-primary-dark outline-none">
              <Check className="w-3.5 h-3.5" />{t("ads.approveThisCopy")}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

function CopyBlock({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[11.5px] font-semibold text-muted-foreground mb-1">{label}</p>
      <div className="space-y-1">
        {items.map((t, i) => <p key={i} className="text-[13px] text-foreground bg-muted/50 rounded px-2 py-1">{t}</p>)}
      </div>
    </div>
  );
}

function AudienceSection({ id, notify }: { id: string; notify: (m: string, s?: "success" | "error") => void }) {
  const { t } = useI18n();
  const [interests, setInterests] = useState<{ name: string; why: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function suggest() {
    setBusy(true);
    try { const r = await api.suggestAdAudience(id); setInterests(r.interests); }
    catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }
  return (
    <Section icon={Users} title={t("ads.audienceSuggestions")}>
      <button onClick={suggest} disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold hover:bg-muted outline-none disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
        {t("ads.suggestInterests")}
      </button>
      {interests && (
        <div className="mt-3 space-y-1.5">
          {interests.length === 0 && <p className="text-[13px] text-muted-foreground">{t("ads.noSuggestions")}</p>}
          {interests.map((it, i) => (
            <div key={i} className="text-[13px]">
              <span className="font-medium text-foreground">{it.name}</span>
              {it.why && <span className="text-muted-foreground">: {it.why}</span>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function CreativeSection({ id, preview, notify, onChange, freshOnly, onSessionChange }: { id: string; preview: AdsPreview; notify: (m: string, s?: "success" | "error") => void; onChange: () => void; freshOnly?: boolean; onSessionChange?: (ids: string[]) => void }) {
  const { t } = useI18n();
  const format = preview.format === "carousel" ? "carousel" : "single";
  async function setFormat(f: "single" | "carousel") {
    if (f === format) return;
    try { await api.setAdsFormat(id, f); onChange(); }
    catch (e) { notify(String(e), "error"); }
  }
  const [items, setItems] = useState<CreativeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // freshOnly (wizard Buat iklan, campaign sudah live): KANVAS KOSONG seperti
  // Meta. Tidak preload materi lama; hanya yang di-upload di sesi ini yang
  // ditampilkan dan menjadi iklan baru. Materi lama yang menganggur tetap ada
  // (dikelola/dipakai lewat Manage), tidak ikut ke sini.
  function load() {
    if (freshOnly) return; // sesi-only: mulai kosong, tidak menarik dari DB
    api.listCreatives(id).then(setItems).catch(() => setItems([]));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(f: File) {
    setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    try {
      const r = await fetch(`/api/campaigns/${id}/creatives`, {
        method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("simpulx_token")}` }, body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      if (freshOnly) {
        const d = await r.json();
        const next = [...items, { id: d.id, file_url: d.file_url, media_type: d.media_type, file_name: d.file_name, status: "uploaded", created_at: "", spend: 0, impressions: 0, clicks: 0, ctr: 0 } as CreativeRow];
        setItems(next);
        onSessionChange?.(next.map((c) => c.id));
      } else {
        load();
      }
      onChange();
    } catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }
  async function remove(cid: string) {
    try {
      await api.deleteCreative(id, cid);
      if (freshOnly) {
        const next = items.filter((c) => c.id !== cid);
        setItems(next); onSessionChange?.(next.map((c) => c.id));
      } else {
        load();
      }
      onChange();
    } catch (e) { notify(String(e), "error"); }
  }

  return (
    <Section icon={ImageIcon} title={t("ads.creatives")}>
      {/* Bentuk iklan: Single = satu iklan per creative; Carousel = semua gambar
          jadi kartu geser dari SATU iklan (2-10 kartu, video tidak ikut). */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {([["single", "Single"], ["carousel", "Carousel"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setFormat(v)}
              className={`px-3 h-7 rounded-md text-[12px] font-semibold outline-none transition-colors ${format === v ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-muted-foreground">
          {format === "carousel"
? t("ads.carouselHint") : t("ads.singleHint")}
        </span>
      </div>
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold hover:bg-muted outline-none disabled:opacity-50 mb-3">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {t("ads.uploadCreative")}
      </button>
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {items.map((c) => (
            <div key={c.id} className="relative group rounded-lg border border-border overflow-hidden">
              <div className="aspect-square bg-muted/50">
                {c.media_type === "image"
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.file_url} alt={c.file_name || ""} className="w-full h-full object-cover" />
                  : <div className="w-full h-full grid place-items-center text-[11px] text-muted-foreground">video</div>}
              </div>
              <button onClick={() => remove(c.id)}
                className="absolute top-1 right-1 p-1 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity outline-none">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// The Facebook Page a CTWA ad runs "as". Loaded on demand: listing Pages is a
// live Meta call, so it only happens when the user opens the picker.
function PageSection({ id, preview, notify, onChange }: {
  id: string; preview: AdsPreview; notify: (m: string, s?: "success" | "error") => void; onChange: () => void;
}) {
  const { t } = useI18n();
  const [pages, setPages] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualId, setManualId] = useState("");
  const chosen = preview.page?.id ? preview.page : null;

  async function load() {
    setBusy(true);
    try { const r = await api.listAdPages(id); setPages(r.pages || []); }
    catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }
  async function choose(p: { id: string; name: string }) {
    try { await api.chooseAdPage(id, { page_id: p.id, page_name: p.name }); onChange(); notify(t("ads.pageSet")); }
    catch (e) { notify(String(e), "error"); }
  }

  return (
    <Section icon={Flag} title={t("ads.facebookPage")}>
      {chosen && (
        <p className="text-[13px] text-foreground mb-2 flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium">{chosen.name || chosen.id}</span>
          <span className="text-muted-foreground">{t("ads.pageRunsAs")}</span>
        </p>
      )}
      {!pages ? (
        <button onClick={load} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold hover:bg-muted outline-none disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
          {chosen ? t("ads.changePage") : t("ads.pickPage")}
        </button>
      ) : (
        <div className="space-y-3">
          {pages.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
{t("ads.noPagesVisible")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {pages.map((p) => (
                <button key={p.id} onClick={() => choose(p)}
                  className={`px-2.5 h-7 rounded-full border text-[12px] outline-none ${chosen?.id === p.id
                    ? "border-primary text-primary font-semibold"
                    : "border-border hover:border-primary hover:text-primary"}`}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {/* Jalan keluar saat listing kosong: Page ID manual (Meta Business →
              Page → About, atau URL page). CTWA tetap butuh Page apa pun caranya. */}
          <div className="flex items-center gap-2">
            <input value={manualId} onChange={(e) => setManualId(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={t("ads.pageIdPlaceholder")}
              className="h-9 px-3 w-56 rounded-md border border-input bg-background text-[13px] outline-none focus:border-primary" />
            <button disabled={!manualId.trim() || busy}
              onClick={() => { choose({ id: manualId.trim(), name: "" }); setManualId(""); }}
              className="px-3 h-9 rounded-md border border-border text-[12.5px] font-semibold hover:bg-muted outline-none disabled:opacity-50">
              {t("ads.usePageId")}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function LaunchBar({ id, preview, notify, onRefresh, createLabel, createIds }: {
  id: string; preview: AdsPreview; notify: (m: string, s?: "success" | "error") => void; onRefresh: () => void;
  createLabel?: boolean; // wizard "+ Buat iklan": tombol bunyinya membuat, bukan apply
  createIds?: string[];  // materi sesi ini; hanya ini yang jadi iklan baru
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const launched = preview.launched;

  async function launch() {
    setConfirming(false); setBusy(true);
    try {
      const r = await api.launchAds(id, createLabel ? createIds : undefined);
      const failed = r.ads.filter((x) => x.error);
      const parts: string[] = [];
      if (r.updated_adset) parts.push(t("ads.budgetTargetingUpdated"));
      if (r.created > 0) parts.push(t("ads.nAdsOnMeta", { n: r.created }));
      if (r.warning) parts.push(r.warning);
      notify(failed.length
        ? `${parts.join(", ")}; ${t("ads.nCreativesFailed", { n: failed.length })}: ${failed[0].error}`
        : launched
          ? `${t("ads.appliedToMeta")}: ${parts.join(", ") || t("ads.noChanges")}.`
          : `${t("ads.createdPausedToast")}: ${parts.join(", ")}.`,
        failed.length ? "error" : "success");
      onRefresh();
    } catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-2 pt-1">
      {launched && !createLabel && (
        <div className="rounded-lg border border-primary/30 bg-primary/[0.05] p-3 flex items-start gap-2.5">
          <Rocket className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-[13px] text-foreground">
            <p className="font-semibold">{t("ads.liveBanner")}</p>
            <p className="text-muted-foreground tabular-nums">
              Campaign {preview.meta_ids?.campaign} &middot; Ad set {preview.meta_ids?.adset}
            </p>
          </div>
        </div>
      )}
      {launched && createLabel && (
        <p className="text-[12px] text-muted-foreground">
          {t("ads.createFreshHint", { n: createIds?.length || 0 })}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button onClick={onRefresh} className="text-[12.5px] text-muted-foreground hover:text-foreground outline-none">{t("common.refresh")}</button>
        <div className="flex-1" />
        {/* Two-step confirm instead of a modal: the second click states exactly
            what happens. First run creates everything PAUSED; after that the
            same button APPLIES changes (adset update + new ads). */}
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted-foreground">
{launched ? t("ads.confirmApply") : t("ads.confirmLaunch", { n: preview.creatives.length })}
            </span>
            <button onClick={launch} disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark outline-none disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}{t("common.confirm")}
            </button>
            <button onClick={() => setConfirming(false)} className="text-[12.5px] text-muted-foreground hover:text-foreground outline-none">{t("common.cancel")}</button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)}
            disabled={busy || (createLabel ? (createIds?.length || 0) === 0 : !preview.can_launch)}
            title={preview.can_launch ? "" : t("ads.resolveFirst")}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark outline-none disabled:opacity-50 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            {launched ? (createLabel ? t("ads.createAdsAction") : t("ads.applyChanges")) : t("ads.launchPaused")}
          </button>
        )}
      </div>
    </div>
  );
}
