import DashboardView from "../DashboardView";

// Standalone Campaign Performance report (own URL + tab/meta title via Shell).
export default function CampaignPerformancePage() {
  return <DashboardView initialTab="marketing" />;
}
