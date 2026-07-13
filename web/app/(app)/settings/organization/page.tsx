import { redirect } from "next/navigation";

// Legacy slug: the platform organization console now lives at /settings/platform.
export default function LegacyOrganizationPage() {
  redirect("/settings/platform");
}
