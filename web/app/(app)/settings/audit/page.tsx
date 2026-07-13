import { redirect } from "next/navigation";

// System Logs moved into the Settings section (/settings/system-logs/*). Keep
// this route as a redirect so old links / bookmarks still land correctly.
export default function AuditRedirect() {
  redirect("/settings/system-logs/messages");
}
