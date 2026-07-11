"use client";
// Channel & Integrations. Each connection type is its own standalone page, driven
// by the settings sidebar via ?tab (channels | webapi | ads-analytics). No top tab
// bar anymore; Ads & Analytics combines ad accounts + GA4 behind a small toggle.
// Old ?tab=advertising / ?tab=analytics deep-links still resolve here.
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChannelsTab } from "./ChannelsTab";
import { WebApiTab } from "./WebApiTab";
import { AdvertisingTab } from "./AdvertisingTab";
import { Ga4Tab } from "./Ga4Tab";

function ChannelsIntegrations() {
  const params = useSearchParams();
  const requested = params.get("tab") || "channels";
  const tab = requested === "advertising" || requested === "analytics" ? "ads-analytics" : requested;
  const [adsView, setAdsView] = useState<"ads" | "analytics">(requested === "analytics" ? "analytics" : "ads");

  if (tab === "webapi") return <WebApiTab />;
  if (tab === "ads-analytics") {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="px-6 pt-4 shrink-0 border-b border-border bg-card flex items-center gap-1">
          {([["ads", "Ad Accounts"], ["analytics", "Analytics (GA4)"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setAdsView(k)}
              className={cn("inline-flex items-center px-3.5 h-10 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors outline-none",
                adsView === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden bg-background">
          {adsView === "ads" ? <AdvertisingTab /> : <Ga4Tab />}
        </div>
      </div>
    );
  }
  return <ChannelsTab />;
}

export default function ChannelsIntegrationsPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return <Suspense fallback={null}><ChannelsIntegrations /></Suspense>;
}
