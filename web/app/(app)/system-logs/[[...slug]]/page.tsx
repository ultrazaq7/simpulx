import { redirect } from "next/navigation";

// Logs moved into Settings (/settings/logs/*). This catch-all redirect ensures
// old links like /system-logs/messages still work.
export default function SystemLogsRedirect({ params }: { params: { slug?: string[] } }) {
  const tail = params.slug?.join("/") || "messages";
  redirect(`/settings/logs/${tail}`);
}
