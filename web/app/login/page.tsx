"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, EyeOff, Eye, Loader2, ArrowRight, ShieldCheck, Zap, BarChart3 } from "lucide-react";
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
      const { token, user } = await api.login(email, password);
      setSession(token, user);
      router.replace("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen w-full flex bg-background overflow-hidden">
      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex w-[46%] relative flex-col justify-between p-12 bg-sidebar-gradient overflow-hidden">
        {/* decorative brand glow */}
        <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-primary/25 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-amber/10 blur-3xl pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden shadow-lg">
            <img src="/simpulx_logo.png" alt="Simpulx" className="w-full h-full object-cover" />
          </div>
          <span className="text-[22px] font-extrabold tracking-tight text-white">
            Simpul<span className="text-amber">x</span>
          </span>
        </div>

        {/* Headline */}
        <div className="relative z-10 max-w-md">
          <h2 className="text-[32px] leading-[1.15] font-bold text-white tracking-tight">
            The customer engagement platform built for sales teams.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">
            Every lead, every channel, one focused inbox. Qualify faster, follow up smarter, close more.
          </p>

          <div className="mt-10 flex flex-col gap-4">
            {[
              { icon: Zap, label: "Smart lead qualification + priority routing" },
              { icon: BarChart3, label: "Conversion analytics down to each campaign" },
              { icon: ShieldCheck, label: "Enterprise access control + campaign isolation" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-white/10 ring-1 ring-white/10 grid place-items-center shrink-0">
                  <Icon className="w-4 h-4 text-primary-light" />
                </div>
                <span className="text-[13.5px] text-white/80 font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[11px] text-white/40 font-medium uppercase tracking-[0.18em]">
          Simpulx OS
        </p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
        {/* mobile logo */}
        <div className="lg:hidden mb-8 flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg overflow-hidden shadow-md">
            <img src="/simpulx_logo.png" alt="Simpulx" className="w-full h-full object-cover" />
          </div>
          <span className="text-[20px] font-extrabold tracking-tight text-foreground">
            Simpul<span className="text-amber">x</span>
          </span>
        </div>

        <div className="w-full max-w-[380px] animate-fade-in">
          <div className="mb-7">
            <h1 className="text-[26px] font-bold tracking-tight text-foreground">Welcome back</h1>
            <p className="mt-1 text-[14px] text-muted-foreground">Sign in to your workspace to continue.</p>
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
      </div>
    </div>
  );
}
