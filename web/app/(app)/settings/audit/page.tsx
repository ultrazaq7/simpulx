import { redirect } from "next/navigation";

// Logs moved into the Settings section (/settings/logs/*). Keep this route as a
// redirect so old links / bookmarks still land correctly.
export default function AuditRedirect() {
  redirect("/settings/logs/messages");
}
