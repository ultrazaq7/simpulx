import { redirect } from "next/navigation";

// /system-logs -> default to the Message History tab.
export default function SystemLogsIndex() {
  redirect("/system-logs/messages");
}
