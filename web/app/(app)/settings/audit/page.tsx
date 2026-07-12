import { redirect } from "next/navigation";

// System Logs moved to its own top-level section (/system-logs/*). Keep this
// route as a redirect so old links / bookmarks still land correctly.
export default function AuditRedirect() {
  redirect("/system-logs/messages");
}
