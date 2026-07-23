import DashboardView from "../DashboardView";

// Standalone AI Usage report (own URL + tab/meta title via Shell).
export default function AiUsagePage() {
  return <DashboardView initialTab="ai-usage" />;
}
