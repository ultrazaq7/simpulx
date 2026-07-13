import { redirect } from "next/navigation";

// /settings/system-logs -> default to the Message History tab.
export default function SystemLogsIndex() {
  redirect("/settings/system-logs/messages");
}
