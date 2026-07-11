"use client";
// Analytics (GA4) — folded into Channel & Integrations. A clean list of connected
// GA4 properties plus a "Connect analytics" wizard (right side panel), matching the
// Connect ad account flow: Sign in with Google (one click), then pick a property.
// An advanced manual entry (property id + refresh token) stays as a fallback.
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Trash2, LineChart, RefreshCw, AlertTriangle, ChevronDown, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Select } from "@/components/Select";
import SidePanel from "@/components/SidePanel";
import { cn, fmtDateTimeShort } from "@/lib/utils";
import type { Ga4Connection, Ga4Property, Campaign } from "@/lib/types";
import { useToast, FieldLabel, INPUT_CLASS, PrimaryButton } from "../_shared";

// Multicolour Google "G" so the sign-in button reads as the real Google button.
function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function Ga4Tab({ embedded }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const { notify, confirm, ToastHost } = useToast();

  const [conns, setConns] = useState<Ga4Connection[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  const [connectOpen, setConnectOpen] = useState(false); // the connect wizard (side panel)

  // Property picker step (after the Google redirect).
  const [pending, setPending] = useState(false);
  const [props, setProps] = useState<Ga4Property[]>([]);
  const [pickProperty, setPickProperty] = useState("");
  const [pickCampaign, setPickCampaign] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [loadingProps, setLoadingProps] = useState(false);

  // Advanced manual entry (fallback for orgs that mint their own refresh token).
  const [manualOpen, setManualOpen] = useState(false);
  const [mProperty, setMProperty] = useState("");
  const [mToken, setMToken] = useState("");
  const [mCampaign, setMCampaign] = useState("");
  const [mBusy, setMBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.listGa4Connections().catch(() => [] as Ga4Connection[]),
      api.listCampaigns().catch(() => [] as Campaign[]),
    ]).then(([c, cg]) => { setConns(c); setCampaigns(cg); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Handle the Google sign-in return (?ga4=connected / ?ga4_error=...): reopen the
  // wizard on the property-picker step so the flow feels continuous.
  useEffect(() => {
    const err = params.get("ga4_error");
    const ok = params.get("ga4");
    if (!err && !ok) return;
    if (err) notify(err, "error");
    if (ok === "connected") {
      setConnectOpen(true);
      setLoadingProps(true);
      api.ga4PendingProperties()
        .then((r) => {
          setPending(!!r.pending);
          setProps(r.properties || []);
          if (r.error) notify(r.error, "error");
          if (r.properties?.length) setPickProperty(r.properties[0].property_id);
        })
        .catch(() => {})
        .finally(() => setLoadingProps(false));
    }
    router.replace("/settings/ads-analytics", { scroll: false });
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeWizard() {
    setConnectOpen(false); setPending(false); setProps([]); setPickProperty(""); setPickCampaign("");
    setManualOpen(false); setMProperty(""); setMToken(""); setMCampaign("");
  }

  async function signIn() {
    setSigningIn(true);
    try {
      const { url } = await api.ga4OAuthUrl();
      window.location.href = url; // full redirect to Google's consent screen
    } catch (e) {
      notify(String(e), "error");
      setSigningIn(false);
    }
  }

  async function finishConnect() {
    if (!pickProperty) return;
    setFinishing(true);
    try {
      const prop = props.find((p) => p.property_id === pickProperty);
      await api.finishGa4Connection({ property_id: pickProperty, name: prop?.display_name, campaign_id: pickCampaign || undefined });
      notify("Google Analytics connected");
      closeWizard(); load();
    } catch (e) { notify(String(e), "error"); }
    finally { setFinishing(false); }
  }

  async function manualConnect() {
    if (!mProperty.trim() || !mToken.trim()) return;
    setMBusy(true);
    try {
      await api.createGa4Connection({ property_id: mProperty.trim(), refresh_token: mToken.trim(), campaign_id: mCampaign || undefined });
      notify("Google Analytics connected");
      closeWizard(); load();
    } catch (e) { notify(String(e), "error"); }
    finally { setMBusy(false); }
  }

  async function remove(c: Ga4Connection) {
    if (!(await confirm({ title: "Disconnect GA4?", message: `Remove the connection to property ${c.property_id}? Campaign reports will stop showing landing-page data.`, danger: true, confirmLabel: "Disconnect" }))) return;
    try { await api.deleteGa4Connection(c.id); notify("Disconnected"); load(); }
    catch (e) { notify(String(e), "error"); }
  }

  const campaignOptions = [{ value: "", label: "All campaigns (org-wide)" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))];
  const connectBtn = (
    <button onClick={() => setConnectOpen(true)} className="inline-flex items-center gap-2 px-3.5 h-9 bg-primary text-white rounded-md text-sm font-semibold hover:bg-primary-dark shadow-sm transition-all outline-none">
      <Plus className="w-4 h-4" />Connect analytics
    </button>
  );

  return (
    <div className={cn("px-6 py-6 w-full", !embedded && "h-full flex flex-col min-h-0")}>
      {ToastHost}
      <div className={cn("bg-card border border-border rounded-lg shadow-xs overflow-hidden flex flex-col", !embedded && "flex-1 min-h-0")}>
        {/* Toolbar */}
        <div className="p-3 flex items-center gap-2.5 border-b border-border flex-wrap shrink-0">
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold text-foreground">Google Analytics 4</p>
            <p className="text-[11.5px] text-muted-foreground">Connect a GA4 property to show landing-page sessions, engagement and users in your reports.</p>
          </div>
          <div className="flex-1" />
          <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-[12.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted outline-none"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          {connectBtn}
        </div>

        {/* List */}
        <div className={cn("p-4", !embedded && "overflow-auto flex-1 min-h-0")}>
          {loading ? (
            <div className="h-40 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : conns.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center mx-auto mb-3"><LineChart className="w-6 h-6 text-muted-foreground/50" /></div>
              <p className="font-semibold text-foreground mb-0.5">No GA4 property connected</p>
              <p className="text-sm text-muted-foreground mb-4">Connect a property to see landing-page sessions, engagement and users in your reports.</p>
              {connectBtn}
            </div>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {conns.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-muted grid place-items-center shrink-0"><LineChart className="w-[18px] h-[18px] text-muted-foreground" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-foreground truncate">{c.name || `Property ${c.property_id}`}</p>
                    <p className="text-[11.5px] text-muted-foreground truncate">
                      ID {c.property_id} · {c.campaign_name ? `Campaign: ${c.campaign_name}` : "All campaigns"}
                      {c.last_synced_at ? ` · Synced ${fmtDateTimeShort(c.last_synced_at)}` : ""}
                    </p>
                    {c.last_error && (
                      <p className="text-[11.5px] text-destructive flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3 shrink-0" />{c.last_error}</p>
                    )}
                  </div>
                  <button onClick={() => remove(c)} aria-label="Disconnect" className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 outline-none transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Connect wizard (right side panel) */}
      <SidePanel open={connectOpen} onClose={closeWizard} title="Connect Google Analytics"
        description="Read-only access (analytics.readonly). You pick the property after signing in.">
        {loadingProps ? (
          <div className="h-24 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : pending ? (
          /* Step 2: property picker after Google sign-in */
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-semibold text-foreground">Google connected. Choose the property to sync.</p>
            {props.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No GA4 properties were found for this Google account. Make sure the account has access to a GA4 property (and that the Analytics Admin API is enabled), then try again.</p>
            ) : (
              <>
                <div>
                  <FieldLabel>GA4 property</FieldLabel>
                  <Select value={pickProperty} onChange={setPickProperty}
                    options={props.map((p) => ({ value: p.property_id, label: `${p.display_name} · ${p.account_name} (${p.property_id})` }))} />
                </div>
                <div>
                  <FieldLabel>Map to campaign (optional)</FieldLabel>
                  <Select value={pickCampaign} onChange={setPickCampaign} options={campaignOptions} placeholder="All campaigns (org-wide)" />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => { setPending(false); setProps([]); }} className="px-3.5 h-9 rounded-md border border-border text-[13px] font-medium hover:bg-muted outline-none">Back</button>
                  <PrimaryButton onClick={finishConnect} disabled={finishing || !pickProperty}>
                    {finishing && <Loader2 className="w-4 h-4 animate-spin" />} Connect property
                  </PrimaryButton>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Step 1: sign in with Google + advanced manual fallback */
          <div className="flex flex-col gap-3">
            <button onClick={signIn} disabled={signingIn}
              className="inline-flex items-center justify-center gap-2.5 h-11 px-5 rounded-md border border-border bg-card text-[14px] font-semibold text-foreground hover:bg-muted disabled:opacity-60 outline-none transition-colors shadow-xs">
              {signingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleG className="w-5 h-5" />}
              Sign in with Google
            </button>
            <p className="text-[12px] text-muted-foreground">We open Google&apos;s consent screen, then bring you back here to pick a property.</p>

            <button onClick={() => setManualOpen((o) => !o)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground outline-none self-start mt-1">
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", manualOpen && "rotate-180")} /> Enter a property ID and refresh token manually
            </button>
            {manualOpen && (
              <div className="rounded-lg border border-border p-4 flex flex-col gap-2.5">
                <div>
                  <FieldLabel>GA4 property ID</FieldLabel>
                  <input value={mProperty} onChange={(e) => setMProperty(e.target.value)} placeholder="e.g. 123456789" className={INPUT_CLASS} />
                </div>
                <div>
                  <FieldLabel>OAuth refresh token (analytics.readonly)</FieldLabel>
                  <input value={mToken} onChange={(e) => setMToken(e.target.value)} placeholder="1//0g..." className={INPUT_CLASS} />
                </div>
                <div>
                  <FieldLabel>Map to campaign (optional)</FieldLabel>
                  <Select value={mCampaign} onChange={setMCampaign} options={campaignOptions} placeholder="All campaigns (org-wide)" />
                </div>
                <div className="flex justify-end">
                  <PrimaryButton onClick={manualConnect} disabled={mBusy || !mProperty.trim() || !mToken.trim()}>
                    {mBusy && <Loader2 className="w-4 h-4 animate-spin" />} Connect
                  </PrimaryButton>
                </div>
              </div>
            )}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
