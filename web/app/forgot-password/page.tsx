"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Envelope as Mail, ArrowLeft, Envelope as MailCheck, CircleNotch as Loader2 } from "@phosphor-icons/react/ssr";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally { setLoading(false); }
  }

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
        {sent ? (
          <div className="bg-card p-8 rounded-xl border border-border shadow-lg text-center">
            <div className="w-14 h-14 rounded-xl mx-auto mb-5 grid place-items-center bg-primary/10 text-primary">
              <MailCheck className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Check your email</h2>
            <p className="text-muted-foreground text-[13px] leading-relaxed mb-7">
              If an account exists for <b className="text-foreground">{email}</b>, we have sent a link to reset your password.
            </p>
            <button
              onClick={() => router.push("/login")}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card text-foreground/80 font-semibold text-[13.5px] hover:bg-muted transition-colors outline-none"
            >
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-[24px] font-bold tracking-tight text-foreground">Reset password</h1>
              <p className="mt-1 text-[14px] text-muted-foreground">Enter your email and we'll send you a reset link.</p>
            </div>

            {error && (
              <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium animate-scale-in">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-bold text-foreground/80">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="you@company.com"
                    className="w-full h-11 pl-10 pr-3 rounded-lg border border-input bg-card text-[13.5px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 mt-1 inline-flex items-center justify-center rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-[13.5px] shadow-sm hover:shadow-brand-md transition-all disabled:opacity-60 outline-none"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset link"}
              </button>
            </form>

            <button
              onClick={() => router.push("/login")}
              className="flex items-center justify-center gap-2 mt-5 w-full text-muted-foreground hover:text-primary transition-colors text-[13px] font-medium outline-none"
            >
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </button>
          </>
        )}

        <p className="text-center mt-8 text-[11px] text-muted-foreground/60 font-medium tracking-wide">
          © {new Date().getFullYear()} Simpulx. All rights reserved.
        </p>
      </div>
    </div>
  );
}
