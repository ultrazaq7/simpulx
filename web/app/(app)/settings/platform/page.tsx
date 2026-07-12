import { redirect } from "next/navigation";

// Legacy slug: the platform organization manager moved to /settings/organization.
export default function LegacyPlatformPage() {
  redirect("/settings/organization");
}
