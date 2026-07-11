"use client";
// Print-only Ads Report page. The headless PDF route (/report/ads/pdf) seeds the
// session token into localStorage, navigates here with ?preset/from/to/campaigns,
// waits for [data-report-ready], isolates .print-root and prints. The layout itself
// lives in the shared <AdsReportView> so the dashboard Ads Report tab is identical.
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { presetRange } from "@/components/DateRangeFilter";
import type { AdPerformance, AdKeyword, Conversation, Ga4Report, Campaign } from "@/lib/types";
import { AdsReportView } from "./AdsReportView";

function AdsReportPrint() {
  const sp = useSearchParams();
  const preset = sp.get("preset") || "30d";
  const rng = preset === "custom" ? { from: sp.get("from") || "", to: sp.get("to") || "" } : presetRange(preset);
  const from = rng.from, to = rng.to;
  const campaigns = (sp.get("campaigns") || "").split(",").filter(Boolean);

  const [perf, setPerf] = useState<AdPerformance | null>(null);
  const [keywords, setKeywords] = useState<AdKeyword[]>([]);
  const [leads, setLeads] = useState<Conversation[]>([]);
  const [ga4, setGa4] = useState<Ga4Report | null>(null);
  const [camps, setCamps] = useState<Campaign[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      api.adPerformance(from || undefined, to || undefined, campaigns.length ? campaigns : undefined).catch(() => null),
      api.adKeywords(from || undefined, to || undefined).catch(() => []),
      api.listConversations("", from || "", to || "", "", "").catch(() => []),
      api.getOrgGa4(from || undefined, to || undefined).catch(() => null),
      api.listCampaigns().catch(() => []),
    ]).then(([p, k, l, g, c]) => {
      setPerf(p as AdPerformance | null); setKeywords((k as AdKeyword[]) || []); setLeads((l as Conversation[]) || []);
      setGa4(g as Ga4Report | null); setCamps((c as Campaign[]) || []);
      // Two frames so recharts has laid out before the headless snapshot.
      requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rangeLabel = from && to ? `${from} to ${to}` : "All time";

  return (
    <div className="print-root" data-report-ready={ready ? "1" : "0"} style={{ background: "#fff" }}>
      <AdsReportView perf={perf} keywords={keywords} leads={leads} ga4={ga4} camps={camps} campaigns={campaigns} rangeLabel={rangeLabel} />
    </div>
  );
}

export default function AdsReportPrintPage() {
  return <Suspense fallback={null}><AdsReportPrint /></Suspense>;
}
