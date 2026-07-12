import DashboardView from "../DashboardView";

// Standalone General Report (overview) page (own URL + tab/meta title via Shell).
export default function GeneralReportPage() {
  return <DashboardView initialTab="overview" />;
}
