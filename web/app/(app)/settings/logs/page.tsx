import { redirect } from "next/navigation";

// /settings/logs -> default to the Message History tab.
export default function SystemLogsIndex() {
  redirect("/settings/logs/messages");
}
