"use client";
// Standalone "Channel" page (messaging channels). Web API and Ads & Analytics are
// now their own routes (/settings/web-api, /settings/ads-analytics), driven by the
// settings sidebar. No top tabs.
import { Suspense } from "react";
import { ChannelsTab } from "./ChannelsTab";

export default function ChannelPage() {
  return <Suspense fallback={null}><ChannelsTab /></Suspense>;
}
