"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, EyeSlash as EyeOff, Eye, CheckCircle as CheckCircle2, CircleNotch as Loader2, WarningCircle as AlertCircle } from "@phosphor-icons/react/ssr";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      await api.resetPassword(token || "", password);
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Reset failed");
    } finally { setLoading(false); }
  }

  const inputCls = "w-full h-11 pl-10 pr-10 rounded-lg border border-input bg-card text-[13.5px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";
  const primaryBtn = "w-full h-11 inline-flex items-center justify-center rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-[13.5px] shadow-sm hover:shadow-brand-md transition-all disabled:opacity-60 outline-none";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 relative overflow-hidden">
      {/* Logo */}
      <div className="mb-7 flex items-center gap-2.5 animate-fade-in">
        <div className="w-10 h-10 rounded-lg overflow-hidden shadow-md">
          <img src="/simpulx_logo.png" alt="Simpulx" className="w-full h-full object-cover" />
        </div>
        <span className="text-[20px] font-extrabold tracking-tight text-foreground">
          Simpul<span className="text-amber">x</span>
        </span>
      </div>

      <div className="w-full max-w-[380px] animate-fade-in">
        {done ? (
          <div className="bg-card p-8 rounded-xl border border-border shadow-lg text-center">
            <div className="w-14 h-14 rounded-xl mx-auto mb-5 grid place-items-center bg-primary/10 text-primary">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Password reset</h2>
            <p className="text-muted-foreground text-[13px] leading-relaxed mb-7">
              Your password has been updated. You can now sign in with your new password.
            </p>
            <button onClick={() => router.push("/login")} className={primaryBtn}>Sign in</button>
          </div>
        ) : token === null ? (
          <div className="bg-card p-8 rounded-xl border border-border shadow-lg text-center">
            <div className="w-14 h-14 rounded-xl mx-auto mb-5 grid place-items-center bg-red-50 text-red-600">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Invalid link</h3>
            <p className="text-muted-foreground text-[13px] leading-relaxed mb-7">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <button onClick={() => router.push("/forgot-password")} className={primaryBtn}>Request new link</button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-[24px] font-bold tracking-tight text-foreground">Set new password</h1>
              <p className="mt-1 text-[14px] text-muted-foreground">Choose a new password for your account.</p>
            </div>

            {error && (
              <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium animate-scale-in">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-foreground/80">New password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    placeholder="At least 8 characters"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors outline-none"
                  >
                    {showPw ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-foreground/80">Confirm password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type={showPw ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="Re-enter password"
                    className={inputCls}
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className={cn(primaryBtn, "mt-1")}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set new password"}
              </button>
            </form>
          </>
        )}

        <p className="text-center mt-8 text-[11px] text-muted-foreground/60 font-medium tracking-wide">
          © {new Date().getFullYear()} Simpulx. All rights reserved.
        </p>
      </div>
    </div>
  );
}
