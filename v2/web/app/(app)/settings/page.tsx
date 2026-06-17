"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// /settings has no content of its own — every section is a real route now.
// Redirect to the first section so the bare URL always resolves.
export default function SettingsIndexPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings/general"); }, [router]);
  return (
    <div className="grid place-items-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );
}
