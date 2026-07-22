"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, EyeOff, Eye, Loader2, ArrowRight, AtSign, ShieldCheck } from "lucide-react";
import { api, setSession } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const REMEMBER_KEY = "simpulx_remember_email";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);

  // Prefill the last-used email when "Remember me" was on. We deliberately only
  // remember the email (never the password/token) — a safe, honest convenience.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(REMEMBER_KEY) : null;
    if (saved) { setEmail(saved); setRemember(true); }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { token, refresh_token, user } = await api.login(email, password);
      if (remember) localStorage.setItem(REMEMBER_KEY, email);
      else localStorage.removeItem(REMEMBER_KEY);
      setSession(token, user, refresh_token);
      router.replace("/inbox");
    } catch (err: any) {
      setError(err.message || t("login.loginFailed"));
    } finally { setLoading(false); }
  }

  useEffect(() => { document.title = "Login - Simpulx"; }, []);

  return (
    <div data-login-dark className="relative min-h-screen w-full flex flex-col items-center justify-center px-6 py-10 overflow-hidden bg-[#0d0f13]">
      {/* Ambient brand glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full bg-primary/20 blur-[140px]" />
        <div className="absolute bottom-[-10rem] right-[-6rem] w-[420px] h-[420px] rounded-full bg-amber/10 blur-[120px]" />
      </div>

      {/* Brand */}
      <div className="relative z-10 mb-7 flex flex-col items-center gap-3 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
          <img src="/simpulx_logo.png" alt={t("auth.simpulx")} className="w-full h-full object-cover" />
        </div>
        <div className="text-center">
          <h1 className="text-[26px] font-extrabold tracking-tight text-white leading-none">
            {t("auth.simpul")}<span className="text-amber">x</span>
          </h1>
        </div>
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-[400px] rounded-2xl bg-white/[0.04] backdrop-blur-xl p-7 shadow-[0_28px_80px_-24px_rgba(0,0,0,0.7)] ring-1 ring-white/10 border border-white/5 animate-scale-in">
        {error && (
          <div className="mb-5 px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[13px] font-medium animate-scale-in">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-white/50">{t("login.emailLabel")}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder={t("login.emailPlaceholder")}
                className="w-full h-11 pl-10 pr-10 rounded-xl border border-white/10 bg-white/5 text-[13.5px] text-white placeholder:text-white/30 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
              <AtSign className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-white/50">{t("login.passwordLabel")}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full h-11 pl-10 pr-10 rounded-xl border border-white/10 bg-white/5 text-[13.5px] text-white placeholder:text-white/30 outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                aria-label={showPw ? t("common.hidePassword") : t("common.showPassword")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors outline-none"
              >
                {showPw ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Remember + forgot */}
          <div className="flex items-center justify-between pt-0.5">
            <label className="flex items-center gap-2 text-[12.5px] text-white/60 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-white/5 accent-primary cursor-pointer"
              />
              {t("login.rememberMe")}
            </label>
            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="text-[12.5px] text-white/60 hover:text-white cursor-pointer font-medium transition-colors outline-none"
            >
              {t("login.forgotPassword")}
            </button>
          </div>

          {/* Sign in */}
          <button
            type="submit"
            disabled={loading}
            className="group w-full h-12 mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-[14px] shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-60 outline-none active:scale-[0.99]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <>{t("login.signIn")} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></>
            )}
          </button>
        </form>

        {/* Security footer */}
        <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/35">
          <ShieldCheck className="w-3.5 h-3.5" />
          {t("login.secureSsl")}
        </div>
      </div>

      {/* Jalur masuk buat yang belum punya akun: landing = halaman ini, jadi
          tombol daftar harus kelihatan tanpa nyari-nyari. */}
      <p className="relative z-10 mt-5 text-[13px] text-white/50">
        {t("login.noAccount")}{" "}
        <a href="https://simpulx.com/register" className="font-bold text-amber hover:underline">{t("login.signUp")}</a>
      </p>

      <p className="relative z-10 mt-4 text-[11px] text-white/30 font-medium tracking-wide">
        © {new Date().getFullYear()} {t("login.simpulx")} {t("login.allRightsReserved")}
      </p>
    </div>
  );
}
