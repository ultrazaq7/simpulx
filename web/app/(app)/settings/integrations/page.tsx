"use client";
// Web API Sources moved into Channel & Integrations. Keep this route as a
// redirect so existing bookmarks and links land on the right tab.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshLinear as Loader2 } from "solar-icon-set";

export default function IntegrationsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings/channels?tab=webapi"); }, [router]);
  return (
    <div className="grid place-items-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}
