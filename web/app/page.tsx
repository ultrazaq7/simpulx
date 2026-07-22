"use client";
// Landing page at the root. A visitor gets the pitch; a logged-in user is sent
// straight to the inbox exactly as the old redirect did, so bookmarks of "/"
// keep working as "open the app".
//
// Design: the app's own identity (deep green, amber x, Bricolage display face)
// on a light ground. The hero's proof is a CSS-drawn inbox with an AI reply in
// it — the product's one habit-forming moment — rather than a stock screenshot.
// Single light theme on purpose: this is a marketing document, and it matches
// the onboarding deck it hands off to.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Check, Inbox, Sparkles, AlarmClockCheck, BarChart3, Megaphone, Radio,
} from "lucide-react";
import { getToken } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const rp = (v: number) => "Rp " + v.toLocaleString("id-ID");

export default function LandingPage() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    document.title = "Simpulx - Inbox WhatsApp + AI untuk Tim Sales";
    if (getToken()) router.replace("/inbox");
  }, [router]);

  return (
    <div data-public-site className="min-h-screen bg-white text-gray-900">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto flex items-center gap-6 px-5 h-16">
          <a href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg overflow-hidden shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/simpulx_logo.png" alt="Simpulx" className="w-full h-full object-cover" />
            </div>
            <span className="text-[17px] font-extrabold tracking-tight">Simpul<span className="text-amber-500">x</span></span>
          </a>
          <nav className="hidden md:flex items-center gap-5 text-[13.5px] font-semibold text-gray-600">
            <a href="#fitur" className="hover:text-gray-900">{t("land.navFeatures")}</a>
            <a href="#harga" className="hover:text-gray-900">{t("land.navPricing")}</a>
          </nav>
          <div className="flex-1" />
          <a href="/login" className="text-[13.5px] font-semibold text-gray-600 hover:text-gray-900">{t("land.navLogin")}</a>
          <a href="https://simpulx.com/register" className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-emerald-700 text-white text-[13.5px] font-bold hover:bg-emerald-800 transition-colors">
            {t("land.navCta")}
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-32 right-[-10%] w-[520px] h-[520px] rounded-full bg-emerald-100/60 blur-[110px]" />
          <div className="absolute bottom-[-8rem] left-[-6rem] w-[380px] h-[380px] rounded-full bg-amber-100/60 blur-[100px]" />
        </div>
        <div className="relative max-w-6xl mx-auto px-5 pt-16 pb-14 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12px] font-bold mb-5">
              <Sparkles className="w-3.5 h-3.5" />{t("land.heroKicker")}
            </p>
            <h1 className="font-display text-[clamp(34px,5vw,54px)] font-extrabold leading-[1.06] tracking-tight [text-wrap:balance]">
              {t("land.heroTitle")}
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-gray-600 max-w-[52ch]">{t("land.heroSub")}</p>
            <div className="mt-7 flex items-center gap-3 flex-wrap">
              <a href="https://simpulx.com/register" className="inline-flex items-center gap-2 px-5 h-12 rounded-xl bg-emerald-700 text-white text-[15px] font-bold hover:bg-emerald-800 transition-colors shadow-lg shadow-emerald-700/20">
                {t("land.heroCta")}<ArrowRight className="w-4 h-4" />
              </a>
              <a href="#harga" className="inline-flex items-center px-5 h-12 rounded-xl border border-gray-200 text-[15px] font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                {t("land.heroCta2")}
              </a>
            </div>
            <p className="mt-3 text-[12.5px] text-gray-400">{t("land.heroNote")}</p>
          </div>

          {/* Mock inbox: the AI-first-reply moment, drawn not screenshotted. */}
          <div className="relative">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-emerald-900/10 overflow-hidden">
              <div className="h-9 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5 px-3">
                <i className="w-2.5 h-2.5 rounded-full bg-gray-200" /><i className="w-2.5 h-2.5 rounded-full bg-gray-200" /><i className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                <span className="ml-2 text-[11px] font-semibold text-gray-400">Inbox &middot; Simpulx</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] min-h-[300px]">
                <div className="border-r border-gray-100 p-2 space-y-1.5 bg-gray-50/60">
                  {["Pak Andri", "Bu Sari", "Rudi", "Ibu Wati"].map((n, i2) => (
                    <div key={n} className={`rounded-lg px-2 py-1.5 ${i2 === 0 ? "bg-white shadow-sm border border-gray-100" : ""}`}>
                      <p className="text-[10.5px] font-bold text-gray-800 truncate">{n}</p>
                      <p className="text-[9.5px] text-gray-400 truncate">{i2 === 0 ? "DP-nya berapa ya?" : "..."}</p>
                    </div>
                  ))}
                </div>
                <div className="p-3 flex flex-col gap-2 bg-[radial-gradient(circle_at_top_right,#F0FDF4,white_65%)]">
                  <div className="self-start max-w-[80%] rounded-2xl rounded-tl-md bg-gray-100 px-3 py-2 text-[11.5px]">
                    Halo, unit yang di iklan masih ada? DP-nya berapa ya?
                  </div>
                  <div className="self-end max-w-[85%] rounded-2xl rounded-tr-md bg-emerald-700 text-white px-3 py-2 text-[11.5px] leading-relaxed">
                    Masih tersedia, Pak. DP mulai Rp 25 juta, angsuran dari Rp 4,1 juta per bulan. Bapak domisili di kota mana, biar saya cek unit terdekat?
                    <span className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-emerald-100/90"><Sparkles className="w-2.5 h-2.5" />AI &middot; dibalas dalam 4 detik</span>
                  </div>
                  <div className="self-start max-w-[80%] rounded-2xl rounded-tl-md bg-gray-100 px-3 py-2 text-[11.5px]">
                    Wah cepat. Saya di Bekasi
                  </div>
                  <div className="mt-auto flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
                    <span className="text-[11px] text-gray-400 flex-1">Ketik balasan&hellip;</span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">AI aktif</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="relative border-y border-gray-100 bg-gray-50/60">
          <div className="max-w-6xl mx-auto px-5 py-6 grid sm:grid-cols-3 gap-6 text-center">
            {[
              ["< 5 menit", t("land.statLeads")],
              ["1 nomor", t("land.statInbox")],
              ["1 kredit", t("land.statCredit")],
            ].map(([big, small]) => (
              <div key={big as string}>
                <p className="font-display text-[24px] font-extrabold text-emerald-800 tabular-nums">{big}</p>
                <p className="text-[12.5px] text-gray-500 mt-0.5">{small}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="fitur" className="max-w-6xl mx-auto px-5 py-20">
        <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-extrabold tracking-tight text-center [text-wrap:balance]">{t("land.fTitle")}</h2>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            [Inbox, t("land.f1t"), t("land.f1d")],
            [Sparkles, t("land.f2t"), t("land.f2d")],
            [AlarmClockCheck, t("land.f3t"), t("land.f3d")],
            [BarChart3, t("land.f4t"), t("land.f4d")],
            [Radio, t("land.f5t"), t("land.f5d")],
            [Megaphone, t("land.f6t"), t("land.f6d")],
          ].map(([Icon, title, desc]) => {
            const I = Icon as typeof Inbox;
            return (
              <div key={title as string} className="rounded-2xl border border-gray-100 bg-white p-5 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5 transition-all">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center mb-3"><I className="w-4.5 h-4.5" /></div>
                <p className="text-[15px] font-extrabold">{title as string}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">{desc as string}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="bg-emerald-900 text-white">
        <div className="max-w-6xl mx-auto px-5 py-16">
          <h2 className="font-display text-[clamp(24px,3vw,34px)] font-extrabold tracking-tight text-center">{t("land.howTitle")}</h2>
          <div className="mt-10 grid sm:grid-cols-3 gap-6">
            {[
              ["1", t("land.how1t"), t("land.how1d")],
              ["2", t("land.how2t"), t("land.how2d")],
              ["3", t("land.how3t"), t("land.how3d")],
            ].map(([n, title, desc]) => (
              <div key={n as string} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <span className="w-8 h-8 rounded-lg bg-amber-400 text-emerald-950 font-extrabold grid place-items-center text-[15px] tabular-nums">{n as string}</span>
                <p className="mt-3 text-[15px] font-extrabold">{title as string}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-emerald-100/70">{desc as string}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="harga" className="max-w-6xl mx-auto px-5 py-20">
        <h2 className="font-display text-[clamp(26px,3.5vw,38px)] font-extrabold tracking-tight text-center [text-wrap:balance]">{t("land.priceTitle")}</h2>
        <p className="mt-3 text-[14.5px] text-gray-500 text-center max-w-xl mx-auto">{t("land.priceSub")}</p>
        <div className="mt-10 grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {[
            ["Starter", 200_000, t("land.seatRange1"), false],
            ["Growth", 150_000, t("land.seatRange2"), true],
            ["Business", 100_000, t("land.seatRange3"), false],
          ].map(([name, price, range, hot]) => (
            <div key={name as string} className={`relative rounded-2xl border-2 p-5 ${hot ? "border-emerald-600 shadow-xl shadow-emerald-900/10" : "border-gray-200"}`}>
              {Boolean(hot) && <span className="absolute -top-2.5 left-5 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10.5px] font-bold">POPULER</span>}
              <p className="text-[14px] font-extrabold">{name as string}</p>
              <p className="text-[12px] text-gray-400">{range as string}</p>
              <p className="mt-2 font-display text-[26px] font-extrabold tabular-nums">{rp(price as number)}<span className="text-[11px] font-semibold text-gray-400"> /{t("land.perSeat")}</span></p>
              <ul className="mt-3 space-y-1.5 text-[12.5px] text-gray-600">
                {["Semua fitur, tanpa dikunci", "Bonus 200 kredit AI", "Laporan iklan sampai closing"].map((f) => (
                  <li key={f} className="flex gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-[1px]" />{f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-6 max-w-4xl mx-auto rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[15px] font-extrabold text-emerald-900">{t("land.trialCard")}</p>
            <p className="text-[12.5px] text-emerald-800/70">{t("land.trialCardSub")}</p>
          </div>
          <a href="https://simpulx.com/register" className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl bg-emerald-700 text-white text-[13.5px] font-bold hover:bg-emerald-800 transition-colors">
            {t("land.priceCta")}<ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="max-w-6xl mx-auto px-5 pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-emerald-800 to-emerald-950 text-white px-6 py-14 text-center relative overflow-hidden">
          <div className="absolute -top-20 right-10 w-64 h-64 rounded-full bg-amber-400/10 blur-3xl" aria-hidden />
          <h2 className="font-display text-[clamp(24px,3.5vw,36px)] font-extrabold tracking-tight [text-wrap:balance]">{t("land.ctaTitle")}</h2>
          <p className="mt-2 text-[14.5px] text-emerald-100/70">{t("land.ctaSub")}</p>
          <a href="https://simpulx.com/register" className="mt-6 inline-flex items-center gap-2 px-6 h-12 rounded-xl bg-amber-400 text-emerald-950 text-[15px] font-extrabold hover:bg-amber-300 transition-colors">
            {t("land.ctaBtn")}<ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-5 py-8 flex items-center justify-between gap-4 flex-wrap text-[12.5px] text-gray-400">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/simpulx_logo.png" alt="" className="w-5 h-5 rounded" />
            <span className="font-bold text-gray-600">Simpul<span className="text-amber-500">x</span></span>
            <span>&middot; {t("land.footerTag")}</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/onboarding.html" className="hover:text-gray-600">Panduan</a>
            <a href="/login" className="hover:text-gray-600">{t("land.navLogin")}</a>
            <span>© {new Date().getFullYear()} Simpulx</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
