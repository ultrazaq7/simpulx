"use client";
// Ad Performance moved into Channel & Integrations. Keep this route as a redirect
// so existing bookmarks and links land on the Advertising tab.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function AdsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings/channels?tab=advertising"); }, [router]);
  return (
    <div className="grid place-items-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );
}
