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
import { Loader2, MapPin, Sparkles, Upload, Trash2, Check, AlertTriangle, Users, Image as ImageIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { AdsPreview, GeoCityResult, AdCopyRow, CreativeRow, GeoCandidate } from "@/lib/types";

export default function LaunchAdsPanel({ id, notify }: { id: string; notify: (m: string, s?: "success" | "error") => void }) {
  const [preview, setPreview] = useState<AdsPreview | null>(null);
  const [loading, setLoading] = useState(true);

  function reload() {
    api.campaignAdsPreview(id).then(setPreview).catch((e) => notify(String(e), "error")).finally(() => setLoading(false));
  }
  useEffect(reload, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="h-40 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!preview) return null;

  return (
    <div className="flex flex-col gap-4">
      <BlockerList preview={preview} />
      <GeoSection id={id} notify={notify} onChange={reload} />
      <CopySection id={id} notify={notify} onChange={reload} />
      <AudienceSection id={id} notify={notify} />
      <CreativeSection id={id} notify={notify} onChange={reload} />
      <LaunchBar preview={preview} onRefresh={reload} />
    </div>
  );
}

function BlockerList({ preview }: { preview: AdsPreview }) {
  if (preview.can_launch) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/[0.05] p-3 flex items-start gap-2.5">
        <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-[13px] text-foreground">
          Everything is ready. The campaign will be created <strong>paused</strong> in Meta so you can review it there before it spends.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.05] p-3">
      <p className="text-[12.5px] font-semibold text-amber-700 dark:text-amber-500 mb-1.5 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" /> {preview.blockers.length} thing{preview.blockers.length === 1 ? "" : "s"} left before launch
      </p>
      <ul className="space-y-1">
        {preview.blockers.map((b, i) => (
          <li key={i} className="text-[13px] text-foreground flex gap-2"><span className="text-muted-foreground">&middot;</span>{b}</li>
        ))}
      </ul>
    </div>
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
    <Section icon={MapPin} title="Locations">
      {!rows ? (
        <button onClick={resolve} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold hover:bg-muted outline-none disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
          Match cities to Meta locations
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
                    <span className="text-muted-foreground">— which one?</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-5">
                    {(r.candidates || []).slice(0, 6).map((c) => (
                      <button key={c.key} onClick={() => choose(r.query, c)}
                        className="px-2.5 h-7 rounded-full border border-border text-[12px] hover:border-primary hover:text-primary outline-none">
                        {c.name}{c.region ? ` · ${c.region}` : ""} <span className="text-muted-foreground">({c.type})</span>
                      </button>
                    ))}
                    {(!r.candidates || r.candidates.length === 0) && <span className="text-[12px] text-muted-foreground">{r.error || "No match from Meta."}</span>}
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
  const [copies, setCopies] = useState<AdCopyRow[]>([]);
  const [busy, setBusy] = useState(false);

  function load() { api.listAdCopy(id).then(setCopies).catch(() => setCopies([])); }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setBusy(true);
    try { await api.generateAdCopy(id); load(); notify("Draft copy generated — read it before approving"); }
    catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }
  async function approve(copyId: string) {
    try { await api.approveAdCopy(id, copyId); load(); onChange(); notify("Copy approved"); }
    catch (e) { notify(String(e), "error"); }
  }

  const latest = copies[0];
  const approved = copies.find((c) => c.status === "approved");

  return (
    <Section icon={Sparkles} title="Ad copy">
      <button onClick={generate} disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold hover:bg-muted outline-none disabled:opacity-50 mb-3">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {copies.length ? "Regenerate" : "Generate copy"}
      </button>
      {latest && (
        <div className="space-y-2">
          {/* All variants are shown and all are sent to Meta: Advantage+ tests them
              against real traffic, so picking a winner here would just duplicate
              what Meta already does better. */}
          <CopyBlock label="Primary text" items={latest.primary_texts} />
          <CopyBlock label="Headlines" items={latest.headlines} />
          <CopyBlock label="Descriptions" items={latest.descriptions} />
          {approved ? (
            <p className="text-[12.5px] text-primary flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Approved</p>
          ) : (
            <button onClick={() => approve(latest.id)}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-primary text-white text-[12.5px] font-semibold hover:bg-primary-dark outline-none">
              <Check className="w-3.5 h-3.5" />Approve this copy
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
  const [interests, setInterests] = useState<{ name: string; why: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function suggest() {
    setBusy(true);
    try { const r = await api.suggestAdAudience(id); setInterests(r.interests); }
    catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }
  return (
    <Section icon={Users} title="Audience suggestions">
      <button onClick={suggest} disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold hover:bg-muted outline-none disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
        Suggest interests
      </button>
      {interests && (
        <div className="mt-3 space-y-1.5">
          {interests.length === 0 && <p className="text-[13px] text-muted-foreground">No suggestions. Advantage+ audience still works without them.</p>}
          {interests.map((it, i) => (
            <div key={i} className="text-[13px]">
              <span className="font-medium text-foreground">{it.name}</span>
              {it.why && <span className="text-muted-foreground"> — {it.why}</span>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function CreativeSection({ id, notify, onChange }: { id: string; notify: (m: string, s?: "success" | "error") => void; onChange: () => void }) {
  const [items, setItems] = useState<CreativeRow[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() { api.listCreatives(id).then(setItems).catch(() => setItems([])); }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(f: File) {
    setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    try {
      const r = await fetch(`/api/campaigns/${id}/creatives`, {
        method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("simpulx_token")}` }, body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      load(); onChange();
    } catch (e) { notify(String(e), "error"); }
    finally { setBusy(false); }
  }
  async function remove(cid: string) {
    try { await api.deleteCreative(id, cid); load(); onChange(); } catch (e) { notify(String(e), "error"); }
  }

  return (
    <Section icon={ImageIcon} title="Creatives">
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-border text-[13px] font-semibold hover:bg-muted outline-none disabled:opacity-50 mb-3">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Upload photo or video
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

function LaunchBar({ preview, onRefresh }: { preview: AdsPreview; onRefresh: () => void }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button onClick={onRefresh} className="text-[12.5px] text-muted-foreground hover:text-foreground outline-none">Refresh</button>
      <div className="flex-1" />
      {/* Create is a later pass. The button is present but disabled so the flow
          reads as complete and it is obvious where launch will live, without
          pretending an action exists that does not yet. */}
      <button disabled title={preview.can_launch ? "Coming soon" : "Resolve the items above first"}
        className="inline-flex items-center gap-1.5 px-4 h-10 rounded-md bg-primary text-white text-[13px] font-semibold opacity-50 cursor-not-allowed outline-none">
        Launch ads (creates paused)
      </button>
    </div>
  );
}
