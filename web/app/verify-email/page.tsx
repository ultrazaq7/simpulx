"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [state, setState] = useState<"verifying" | "done" | "error">("verifying");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("This link is invalid or has expired.");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard against React 18 double-invoke
    ran.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setState("error"); return; }
    api.verifyEmailChange(token)
      .then((r) => { setEmail(r.email); setState("done"); })
      .catch((e) => { setError(String(e?.message || e).replace(/^Error:\s*/, "") || "Verification failed"); setState("error"); });
  }, []);

  const primaryBtn = "w-full h-11 inline-flex items-center justify-center rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-[13.5px] shadow-sm hover:shadow-brand-md transition-all disabled:opacity-60 outline-none";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="mb-7 flex items-center gap-2.5 animate-fade-in">
        <div className="w-10 h-10 rounded-lg overflow-hidden shadow-md">
          <img src="/simpulx_logo.png" alt="Simpulx" className="w-full h-full object-cover" />
        </div>
        <span className="text-[20px] font-extrabold tracking-tight text-foreground">
          Simpul<span className="text-amber">x</span>
        </span>
      </div>

      <div className="w-full max-w-[380px] animate-fade-in">
        <div className="bg-card p-8 rounded-xl border border-border shadow-lg text-center">
          {state === "verifying" ? (
            <>
              <div className="w-14 h-14 rounded-xl mx-auto mb-5 grid place-items-center bg-primary/10 text-primary">
                <Loader2 className="w-7 h-7 animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Confirming your email</h2>
              <p className="text-muted-foreground text-[13px] leading-relaxed">Just a moment...</p>
            </>
          ) : state === "done" ? (
            <>
              <div className="w-14 h-14 rounded-xl mx-auto mb-5 grid place-items-center bg-primary/10 text-primary">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Email confirmed</h2>
              <p className="text-muted-foreground text-[13px] leading-relaxed mb-7">
                Your sign-in email is now <b className="text-foreground">{email}</b>. Use it the next time you sign in.
              </p>
              <button onClick={() => router.push("/account")} className={primaryBtn}>Back to account</button>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-xl mx-auto mb-5 grid place-items-center bg-red-50 text-red-600">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Link not valid</h2>
              <p className="text-muted-foreground text-[13px] leading-relaxed mb-7">{error}</p>
              <button onClick={() => router.push("/account")} className={primaryBtn}>Back to account</button>
            </>
          )}
        </div>

        <p className="text-center mt-8 text-[11px] text-muted-foreground/60 font-medium tracking-wide">
          © {new Date().getFullYear()} Simpulx. All rights reserved.
        </p>
      </div>
    </div>
  );
}
