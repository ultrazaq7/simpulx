import { redirect } from "next/navigation";

// Every report lives on its own slug; /dashboard forwards to General Report.
// Legacy ?tab= deep-links forward to their new standalone routes.
export default function DashboardPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const t = searchParams?.tab;
  if (t === "ads" || t === "marketing") redirect("/dashboard/campaign-performance");
  if (t === "creatives") redirect("/dashboard/creative-insights");
  redirect("/dashboard/general-report");
}
