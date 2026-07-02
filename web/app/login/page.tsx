"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, EyeOff, Eye, Loader2, ArrowRight } from "lucide-react";
import { api, setSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { token, refresh_token, user } = await api.login(email, password);
      setSession(token, user, refresh_token);
      router.replace("/inbox");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden bg-muted">
      {/* Logo above the card */}
      <div className="relative z-10 mb-7 flex flex-col items-center gap-3 animate-fade-in">
        <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-[0_10px_30px_-8px_rgba(0,0,0,0.35)] ring-1 ring-black/5">
          <img src="/simpulx_logo.png" alt="Simpulx" className="w-full h-full object-cover" />
        </div>
        <span className="text-[22px] font-extrabold tracking-tight text-foreground">
          Simpul<span className="text-amber">x</span>
        </span>
      </div>

      {/* Centered card */}
      <div className="relative z-10 w-full max-w-[400px] rounded-2xl bg-[#14392f] p-8 shadow-[0_28px_80px_-24px_rgba(0,0,0,0.65)] ring-1 ring-white/10 border border-white/5 animate-scale-in overflow-hidden">
        {/* brand accent bar */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
        <div className="mb-6 text-center">
          <h1 className="text-[24px] font-bold tracking-tight text-white">Welcome back</h1>
          <p className="mt-1 text-[13.5px] text-white/60">Sign in to your workspace to continue.</p>
        </div>

        {error && (
          <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium animate-scale-in">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-white/70">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@company.com"
                  className="w-full h-11 pl-10 pr-3 rounded-xl border border-white/10 bg-white/5 text-[13.5px] text-white placeholder:text-white/40 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/25"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-white/70">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  className="w-full h-11 pl-10 pr-10 rounded-xl border border-white/10 bg-white/5 text-[13.5px] text-white placeholder:text-white/40 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors outline-none"
                >
                  {showPw ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Sign in */}
            <button
              type="submit"
              disabled={loading}
              className="group w-full h-12 mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-[14px] shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-60 outline-none active:scale-[0.99]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>Sign in <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></>
              )}
            </button>

            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="mx-auto text-[12.5px] text-white/60 hover:text-white cursor-pointer font-medium transition-colors outline-none"
            >
              Forgot your password?
            </button>
          </form>
        </div>

        <p className="relative z-10 mt-6 text-[11px] text-muted-foreground font-medium tracking-wide">
          © {new Date().getFullYear()} Simpulx. All rights reserved.
        </p>
      </div>
  );
}
