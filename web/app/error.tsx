"use client";
// Route-level error boundary. Without this, any unhandled render exception is a
// blank page saying "see the browser console" — useless to the person looking
// at it and to whoever they report it to. Show the actual message and a retry,
// so a screenshot of the failure IS the bug report.
import { useEffect } from "react";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="min-h-[60vh] grid place-items-center p-6">
      <div className="max-w-lg w-full rounded-xl border border-border bg-card p-5 text-center">
        <p className="text-[15px] font-bold text-foreground mb-1">Terjadi error di halaman ini</p>
        <p className="text-[12.5px] text-muted-foreground break-words mb-1">{error.message || String(error)}</p>
        {error.digest && <p className="text-[11px] text-muted-foreground/70 mb-3">digest: {error.digest}</p>}
        <button onClick={reset}
          className="px-4 h-9 rounded-md bg-primary text-white text-[13px] font-semibold hover:bg-primary-dark outline-none">
          Coba lagi
        </button>
      </div>
    </div>
  );
}
