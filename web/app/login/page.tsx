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
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-10 relative overflow-hidden bg-sidebar-gradient">
      {/* decorative brand glow */}
      <div className="absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-32 w-[520px] h-[520px] rounded-full bg-amber/10 blur-3xl pointer-events-none" />

      {/* Logo above the card */}
      <div className="relative z-10 mb-6 flex flex-col items-center gap-3 animate-fade-in">
        <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-xl ring-1 ring-white/10">
          <img src="/simpulx_logo.png" alt="Simpulx" className="w-full h-full object-cover" />
        </div>
        <span className="text-[22px] font-extrabold tracking-tight text-white">
          Simpul<span className="text-amber">x</span>
        </span>
      </div>

      {/* Centered card */}
      <div className="relative z-10 w-full max-w-[400px] rounded-2xl border border-white/10 bg-card shadow-2xl p-7 sm:p-8 animate-scale-in">
        <div className="mb-6 text-center">
          <h1 className="text-[24px] font-bold tracking-tight text-foreground">Welcome back</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">Sign in to your workspace to continue.</p>
        </div>

        {error && (
          <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[13px] font-medium animate-scale-in">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
            {/* Email */}
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

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-foreground/80">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  className="w-full h-11 pl-10 pr-10 rounded-lg border border-input bg-card text-[13.5px] text-foreground placeholder:text-muted-foreground/70 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20"
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

            {/* Sign in */}
            <button
              type="submit"
              disabled={loading}
              className="group w-full h-11 mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-[13.5px] shadow-sm hover:shadow-brand-md transition-all disabled:opacity-60 outline-none"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>Sign in <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></>
              )}
            </button>

            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="mx-auto text-[12.5px] text-muted-foreground hover:text-primary cursor-pointer font-medium transition-colors outline-none"
            >
              Forgot your password?
            </button>
          </form>
        </div>

        <p className="relative z-10 mt-6 text-[11px] text-white/50 font-medium tracking-wide">
          © {new Date().getFullYear()} Simpulx. All rights reserved.
        </p>
      </div>
  );
}
