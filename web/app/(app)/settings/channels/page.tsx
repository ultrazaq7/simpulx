"use client";
// Channel & Integrations — one home for every connection. Top tabs switch between
// messaging Channels, Web API lead sources, and Advertising. The active tab is
// URL-driven (?tab=channels|webapi|advertising) so deep links and the redirects
// from the old /settings/integrations and /settings/ads routes land correctly.
import { Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Radio, Plug, ChartBar as BarChart3 } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { ChannelsTab } from "./ChannelsTab";
import { WebApiTab } from "./WebApiTab";
import { AdvertisingTab } from "./AdvertisingTab";

const TABS = [
  { key: "channels", labelKey: "settings.channels", icon: Radio },
  { key: "webapi", labelKey: "settings.tab_web_api", icon: Plug },
  { key: "advertising", labelKey: "settings.tab_advertising", icon: BarChart3 },
];

function ChannelsIntegrations() {
  const router = useRouter();
  const pathname = usePathname() || "/settings/channels";
  const params = useSearchParams();
  const { t } = useI18n();

  const requested = params.get("tab") || "channels";
  const active = TABS.some((x) => x.key === requested) ? requested : "channels";
  const go = (key: string) => router.replace(`${pathname}?tab=${key}`, { scroll: false });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Title + tabs */}
      <div className="px-6 pt-5 shrink-0 border-b border-border bg-card">
        <h1 className="text-[19px] font-bold text-foreground mb-3">{t("settings.channels_integrations")}</h1>
        <div className="flex items-center gap-1">
          {TABS.map((x) => {
            const Icon = x.icon; const sel = active === x.key;
            return (
              <button key={x.key} onClick={() => go(x.key)}
                className={cn("inline-flex items-center gap-2 px-3.5 h-10 text-[13.5px] font-semibold border-b-2 -mb-px transition-colors outline-none",
                  sel ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <Icon className="w-[17px] h-[17px]" />{t(x.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active tab */}
      <div className="flex-1 min-h-0 overflow-hidden bg-background">
        {active === "channels" && <ChannelsTab />}
        {active === "webapi" && <WebApiTab />}
        {active === "advertising" && <AdvertisingTab />}
      </div>
    </div>
  );
}

export default function ChannelsIntegrationsPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return <Suspense fallback={null}><ChannelsIntegrations /></Suspense>;
}
