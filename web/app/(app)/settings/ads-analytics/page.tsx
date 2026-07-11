"use client";
// Standalone "Ads & Analytics" page: ad accounts AND GA4 in ONE list, ONE connect
// wizard (the source is picked inside the wizard's first step).
import { Suspense } from "react";
import { AdsAnalytics } from "../channels/AdsAnalytics";

export default function AdsAnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <div className="h-full overflow-y-auto">
        <AdsAnalytics />
      </div>
    </Suspense>
  );
}
