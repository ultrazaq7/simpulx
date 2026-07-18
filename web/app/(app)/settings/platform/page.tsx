"use client";
// The old combined Platform console was split into Client Management +
// AI & ML Monitor. Keep this route as a redirect so existing links/bookmarks land.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function PlatformRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings/client-management"); }, [router]);
  return (
    <div className="grid place-items-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}
