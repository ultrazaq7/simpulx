"use client";
// Standalone "Ads & Analytics" page: ad accounts AND GA4 on one page (no sub-tabs).
// Both sections flow in a single scroll container.
import { Suspense } from "react";
import { AdvertisingTab } from "../channels/AdvertisingTab";
import { Ga4Tab } from "../channels/Ga4Tab";

export default function AdsAnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <div className="h-full overflow-y-auto">
        <div><AdvertisingTab embedded /></div>
        <div><Ga4Tab embedded /></div>
      </div>
    </Suspense>
  );
}
