"use client";
// Persistent banner shown while a superadmin is viewing another organisation.
//
// Not decoration, and more important now that these sessions can WRITE. Without
// it the app looks identical to a normal session, and the whole surface (inbox,
// campaigns, dashboards) silently belongs to someone else's business — with edits
// landing in their data. It also carries the countdown, because the token expires
// on its own and a page that starts 401-ing with no explanation is worse than one
// that said the session was ending.
import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { getImpersonation, stopImpersonation } from "@/lib/impersonation";

export default function ImpersonationBanner() {
  const [st, setSt] = useState(() => getImpersonation());
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const tick = () => {
      const cur = getImpersonation();
      setSt(cur);
      setLeft(cur ? Math.max(0, Math.floor((cur.expiresAt - Date.now()) / 1000)) : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!st) return null;

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  function exit() {
    stopImpersonation();
    window.location.href = "/settings/client-management";
  }

  return (
    <div className="w-full bg-amber-500 text-black">
      <div className="flex items-center gap-3 px-4 py-1.5 text-[13px] font-semibold">
        <Eye className="w-4 h-4 shrink-0" />
        <span className="truncate">
          Acting inside <strong>{st.orgName}</strong> as {st.viewingAs} — every change is logged as you
        </span>
        <span className="ml-auto tabular-nums shrink-0 opacity-80">{mm}:{ss}</span>
        <button
          onClick={exit}
          className="shrink-0 inline-flex items-center gap-1 px-2 h-6 rounded-md bg-black/15 hover:bg-black/25 transition-colors outline-none"
        >
          <X className="w-3.5 h-3.5" />
          Exit
        </button>
      </div>
    </div>
  );
}
