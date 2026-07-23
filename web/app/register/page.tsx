"use client";
// Public onboarding page: register a new business, or top up credits for an
// existing one. Two menus on one page because both end in the same place · a
// request a human approves · and a returning customer should not have to hunt
// for a different URL to buy more credits.
//
// Nothing here activates anything. Submitting creates a pending request and the
// operator activates it from the platform panel, so the page can be public
// without letting anyone provision themselves.
import { useEffect, useMemo, useRef, useState } from "react";
import { fixedT } from "@/lib/i18n";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";

// Halaman publik untuk pasar Indonesia: SELALU Bahasa Indonesia, apa pun
// preferensi bahasa aplikasi. Terikat di module scope (bukan setLang di effect)
// supaya SSR dan paint pertama sudah ID · tanpa flash teks Inggris · dan
// preferensi bahasa user di aplikasi tidak ikut berubah.
// Alias i18n: di dalam .map((t) => ...) variabel tier menutupi `t`.
const t = fixedT("id");
const i18n = t;

// Bullet kartu mengikuti kartu pricing di landing (apex): kumulatif per tier.
// Harga per seat tetap volume discount; "Ads dikelola Simpulx" itu add-on
// opsional, bukan pembeda paket.
const SIGNUP_TIERS = [
  {
    key: "trial", name: "Free Trial", price: 0, per: "7 hari",
    credits: 50, highlight: false, minSeats: 1,
    tagline: "Coba dulu, tanpa kartu, tanpa komitmen",
    features: ["7 hari akses penuh", "50 kredit balasan AI", "1 seat", "Semua fitur inbox + AI"],
  },
  {
    key: "starter", name: "Starter", price: 200_000, per: "seat / bulan",
    credits: 200, highlight: false, minSeats: 1,
    tagline: "1 sampai 10 seat",
    features: ["200 kredit AI / pengguna", "Inbox tim + AI nurture", "Panggilan WhatsApp", "E-catalog & broadcast"],
  },
  {
    key: "growth", name: "Growth", price: 150_000, per: "seat / bulan",
    credits: 200, highlight: true, minSeats: 11,
    tagline: "11 sampai 50 seat, paling banyak dipilih",
    features: ["200 kredit AI / pengguna", "Semua fitur Starter", "Automation & lead scoring", "Analitik revenue lengkap"],
  },
  {
    key: "business", name: "Business", price: 100_000, per: "seat / bulan",
    credits: 200, highlight: false, minSeats: 51,
    tagline: "51 sampai 100 seat, termurah per seat",
    features: ["200 kredit AI / pengguna", "Semua fitur Growth", "Onboarding & prioritas support", "Top-up kredit AI fleksibel"],
  },
];

const TOPUP_PACKS = [
  { key: "booster", name: "Booster", credits: 500, perCredit: 400 },
  { key: "pro", name: "Pro", credits: 1000, perCredit: 375 },
  { key: "enterprise", name: "Enterprise", credits: 2000, perCredit: 350 },
];

const INDUSTRIES = [
  "Automotive", "Property / Real Estate", "Finance", "Insurance", "Retail / FMCG",
  "Education", "Healthcare", "Travel & Hospitality", "Food & Beverage", "Services", "Other",
];

const rp = (v: number) => "Rp " + v.toLocaleString("id-ID");

// Preview produk yang hidup, bukan gambar: chat masuk, Simpuler mengetik,
// balasan AI, skor lead terisi, lalu serah terima. Loop pelan, hormat
// prefers-reduced-motion (langsung tampil keadaan akhir).
function LiveDemo() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(5); return;
    }
    let alive = true;
    const seq = [400, 1200, 2600, 4200, 5400];
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      if (!alive) return;
      setStep(0);
      seq.forEach((ms, i) => timers.push(setTimeout(() => alive && setStep(i + 1), ms)));
    };
    run();
    const loop = setInterval(run, 9000);
    return () => { alive = false; clearInterval(loop); timers.forEach(clearTimeout); };
  }, []);
  const show = (n: number) => step >= n;
  return (
    <div className="max-w-xl mx-auto mb-8 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden text-left">
      <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <span className="ml-2 text-[11px] text-gray-400 bg-gray-100 rounded-full px-3 py-0.5">app.simpulx.com/inbox</span>
      </div>
      <div className="p-4 space-y-2.5 min-h-[240px]">
        <div className={`max-w-[80%] rounded-xl rounded-tl-sm bg-gray-100 px-3 py-2 text-[12.5px] text-gray-800 transition-all duration-500 ${show(1) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
          Halo, saya lihat iklannya. Unit yang DP 20 juta masih ada?
        </div>
        {show(2) && !show(3) && (
          <div className="flex items-center gap-1.5 justify-end text-[11px] text-gray-400">
            Simpuler sedang mengetik
            <span className="flex gap-0.5">{[0, 1, 2].map((i) => (
              <span key={i} className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />))}
            </span>
          </div>
        )}
        <div className={`ml-auto max-w-[80%] rounded-xl rounded-tr-sm bg-emerald-700 px-3 py-2 text-[12.5px] text-white transition-all duration-500 ${show(3) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
          <span className="inline-block text-[9px] font-bold bg-white/20 rounded px-1.5 mb-1">AI</span><br />
          Masih ada, Kak. DP mulai 20 juta, cicilan mulai Rp7,5 jt per bulan. Rencananya untuk keluarga atau usaha?
        </div>
        <div className={`flex items-center gap-2.5 pt-1 transition-opacity duration-500 ${show(4) ? "opacity-100" : "opacity-0"}`}>
          <span className="text-[10.5px] text-gray-400">Lead score</span>
          <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
            <span className="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-1000" style={{ width: show(4) ? "82%" : "0%" }} />
          </span>
          <b className="text-[13px] text-gray-900 tabular-nums">82</b>
        </div>
        <div className={`inline-block rounded-lg bg-emerald-50 text-emerald-700 text-[11.5px] font-bold px-3 py-1.5 transition-all duration-500 ${show(5) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}>
          Diserahkan ke Agent Satu
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const [menu, setMenu] = useState<"signup" | "topup">("signup");
  // Wizard dua layar: layar 1 pilih paket, layar 2 isi data. pkg kosong = layar 1.
  const [pkg, setPkg] = useState("");
  // Input seat dipegang sebagai STRING: memaksa Number(value)||1 di onChange
  // membuat field mustahil dikosongkan (selalu membal ke 1, terasa terkunci).
  // Angka efektifnya di-clamp saat dipakai dan saat blur.
  const [seatsStr, setSeatsStr] = useState("3");
  const seats = Math.max(1, Math.min(100, parseInt(seatsStr, 10) || 1));
  const [form, setForm] = useState({ org_name: "", industry: "", name: "", email: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Step bukti transfer (khusus permintaan berbayar): id request + status upload.
  const [proofFor, setProofFor] = useState<string | null>(null);
  const [proofSent, setProofSent] = useState(false);
  const [payInfo, setPayInfo] = useState<{ bank: string; account: string; holder: string } | null>(null);
  const proofFileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch("/api/public/payment-info").then((r) => r.json()).then(setPayInfo).catch(() => setPayInfo(null));
  }, []);
  const [err, setErr] = useState("");
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  const tier = SIGNUP_TIERS.find((t) => t.key === pkg);
  const pack = TOPUP_PACKS.find((t) => t.key === pkg);
  const isTrial = menu === "signup" && pkg === "trial";

  const total = useMemo(() => {
    if (menu === "topup") return pack ? pack.credits * pack.perCredit : 0;
    if (!tier) return 0;
    const monthly = tier.price * (isTrial ? 1 : seats);
    // Tahunan = 12 bulan harga penuh, tanpa promo. Angka finalnya tetap
    // dihitung ulang server, ini cuma tampilan.
    return billing === "annual" && !isTrial ? monthly * 12 : monthly;
  }, [menu, tier, pack, seats, isTrial, billing]);

  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }
  // Wizard per layar, bukan form yang muncul di bawah: memilih paket MENGGANTI
  // tampilan ke layar isian (dengan tombol kembali), sehingga tidak ada urusan
  // scroll sama sekali. scrollTo(0,0) supaya layar baru mulai dari atas.
  function choose(key: string) {
    setPkg(key);
    const tr = SIGNUP_TIERS.find((x) => x.key === key);
    if (tr && tr.minSeats > 1) setSeatsStr((sv) => String(Math.max(parseInt(sv, 10) || 1, tr.minSeats)));
    window.scrollTo({ top: 0 });
  }
  function back() {
    setPkg("");
    setErr("");
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    setErr("");
    if (!form.name.trim() || !form.email.includes("@")) { setErr(t("reg.errNameEmail")); return; }
    if (menu === "signup" && !form.org_name.trim()) { setErr(t("reg.errOrg")); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/public/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: menu, package: pkg, seats, billing, ...form }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json().catch(() => ({}));
      // Berbayar (total > 0): lanjut ke layar pembayaran + upload bukti.
      // Gratis (trial): tidak ada yang perlu dibayar, langsung selesai.
      if (total > 0 && data.id) {
        setProofFor(data.id);
        window.scrollTo({ top: 0 });
      } else {
        setDone(true);
      }
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }

  async function uploadProof(f: File) {
    if (!proofFor) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData(); fd.append("file", f);
      const r = await fetch(`/api/public/register/${proofFor}/proof`, { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      setProofSent(true);
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }

  if (proofFor && !done) {
    return (
      <Shell>
        <div className="max-w-md mx-auto py-10">
          <h1 className="text-[22px] font-extrabold text-gray-900 mb-1">{t("reg.proofTitle")}</h1>
          <p className="text-[13.5px] text-gray-500 mb-5">{t("reg.proofSub")}</p>

          <div className="rounded-2xl border-2 border-emerald-600 bg-emerald-50/40 p-4 mb-4">
            <p className="text-[11.5px] text-gray-500">{t("reg.total")}</p>
            <p className="text-[24px] font-extrabold text-gray-900 leading-tight break-words">{rp(total)}</p>
            {/* Rekening dari server (env), BUKAN hardcode: nomor rekening itu data
                operasional, dan nomor salah yang tertanam di kode mengirim uang
                customer ke antah berantah. */}
            {payInfo && payInfo.account ? (
              <div className="mt-3 pt-3 border-t border-emerald-600/20 text-[13.5px]">
                <p className="text-[11.5px] text-gray-500 mb-0.5">{t("reg.transferTo")}</p>
                <p className="font-bold text-gray-900">{payInfo.bank} {payInfo.account}</p>
                <p className="text-gray-600">a.n. {payInfo.holder}</p>
              </div>
            ) : (
              <p className="mt-3 pt-3 border-t border-emerald-600/20 text-[12.5px] text-gray-500">{t("reg.paymentInfoByEmail")}</p>
            )}
          </div>

          <input ref={proofFileRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadProof(f); e.target.value = ""; }} />
          {proofSent ? (
            <p className="inline-flex items-center gap-2 text-[14px] font-semibold text-emerald-700 mb-4">
              <Check className="w-4 h-4" />{t("reg.proofUploaded")}
            </p>
          ) : (
            <button onClick={() => proofFileRef.current?.click()} disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-dashed border-gray-300 text-[13.5px] font-bold text-gray-700 hover:border-emerald-600 hover:text-emerald-700 outline-none disabled:opacity-60 mb-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{t("reg.uploadProof")}
            </button>
          )}
          {!proofSent && <p className="text-[11.5px] text-gray-400 mb-4">{t("reg.proofHint")}</p>}
          {err && <p className="text-[12.5px] text-red-600 mb-3">{err}</p>}

          <div className="flex items-center gap-3">
            <button onClick={() => setDone(true)}
              className="flex-1 h-11 rounded-xl bg-emerald-600 text-white text-[14px] font-bold hover:bg-emerald-700 outline-none">
              {t("reg.finish")}
            </button>
            {!proofSent && (
              <button onClick={() => setDone(true)} className="text-[12.5px] font-semibold text-gray-400 hover:text-gray-600 outline-none">
                {t("reg.proofLater")}
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 grid place-items-center mx-auto mb-4"><Check className="w-7 h-7" /></div>
          <h1 className="text-[22px] font-extrabold text-gray-900 mb-2">{t("reg.doneTitle")}</h1>
          <p className="text-[14px] text-gray-500 leading-relaxed">
            {t("reg.doneBody", { kind: menu === "signup" ? t("reg.kindSignup") : t("reg.kindTopup"), email: form.email })}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center mb-8">
        <h1 className="text-[30px] sm:text-[42px] font-extrabold text-gray-900 tracking-tight leading-tight">
          {menu === "signup" ? t("reg.headline") : t("reg.topupHeadline")}
        </h1>
      </div>

      {!pkg && (<>
      <LiveDemo />
      {/* Layar 1: pilih menu + paket. */}
      <div className="flex items-center justify-center gap-1 p-1 bg-gray-100 rounded-xl w-fit mx-auto mb-8">
        {([["signup", t("reg.menuSignup")], ["topup", t("reg.menuTopup")]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setMenu(k); setPkg(""); setDone(false); }}
            className={`px-4 h-9 rounded-lg text-[13.5px] font-semibold transition-colors outline-none ${
              menu === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>
            {label}
          </button>
        ))}
      </div>

      {menu === "signup" && (
        <div className="flex items-center justify-center gap-2 mb-6 text-[13px] font-semibold">
          <span className={billing === "monthly" ? "text-gray-900" : "text-gray-400"}>{t("reg.monthly")}</span>
          <button onClick={() => setBilling(billing === "monthly" ? "annual" : "monthly")}
            aria-label="annual switch"
            className={`relative w-11 h-6 rounded-full transition-colors outline-none ${billing === "annual" ? "bg-emerald-600" : "bg-gray-300"}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${billing === "annual" ? "left-[22px]" : "left-0.5"}`} />
          </button>
          <span className={billing === "annual" ? "text-gray-900" : "text-gray-400"}>{t("reg.annual")}</span>
        </div>
      )}

      {menu === "signup" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10 max-w-6xl mx-auto">
          {SIGNUP_TIERS.map((t, ti) => (
            <button key={t.key} onClick={() => choose(t.key)}
              className={`relative text-left rounded-2xl border-2 p-5 transition-all outline-none hover:-translate-y-1.5 hover:shadow-xl ${
                pkg === t.key ? "border-emerald-600 bg-emerald-50/40 shadow-md" : "border-gray-200 bg-white hover:border-emerald-600/40"}`}>
              {t.highlight && (
                <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10.5px] font-bold">{i18n("reg.popular")}</span>
              )}
              <p className="text-[16px] font-extrabold text-gray-900">{t.name}</p>
              <p className="text-[12px] text-gray-500 mb-3">{t.tagline}</p>
              <p className="text-[24px] font-extrabold text-gray-900">
                {/* Tahunan = 12 bulan harga penuh, TANPA promo gratis 2 bulan. */}
                {t.price === 0 ? i18n("reg.free") : rp(billing === "annual" ? t.price * 12 : t.price)}
                <span className="text-[11px] font-medium text-gray-400"> /{billing === "annual" && t.price > 0 ? i18n("reg.perSeatYear") : t.per}</span>
              </p>
              <ul className="mt-3 space-y-1.5">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-1.5 text-[12px] text-gray-600">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-[1px]" />{f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4 mb-10 max-w-3xl mx-auto">
          {TOPUP_PACKS.map((t, ti) => (
            <button key={t.key} onClick={() => choose(t.key)}
              className={`text-left rounded-2xl border-2 p-4 transition-all outline-none hover:-translate-y-1 hover:shadow-lg ${
                pkg === t.key ? "border-emerald-600 bg-emerald-50/40 shadow-md" : "border-gray-200 bg-white hover:border-emerald-600/40"}`}>
              <p className="text-[14px] font-extrabold text-gray-900">{t.name}</p>
              <p className="text-[20px] font-extrabold text-gray-900 mt-1">{t.credits.toLocaleString("id-ID")} <span className="text-[11px] font-medium text-gray-400">kredit</span></p>
              <p className="text-[12px] text-gray-500 mt-1">{rp(t.perCredit)} / kredit</p>
              <p className="text-[13px] font-bold text-emerald-700 mt-2">{rp(t.credits * t.perCredit)}</p>
            </button>
          ))}
        </div>
      )}

      <p className="text-center text-[13.5px] text-gray-400">{t("reg.pickHint")}</p>
      </>)}

      {/* Layar 2: ringkasan paket + form, dengan tombol kembali. */}
      {pkg && (
      <div key={pkg} className="max-w-lg mx-auto">
        <button onClick={back}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-gray-900 mb-4 outline-none">
          <ArrowLeft className="w-4 h-4" /> {t("reg.changePkg")}
        </button>

        {/* Ringkasan pilihan, supaya layar ini berdiri sendiri tanpa harus ingat
            card yang tadi diklik. */}
        <div className="rounded-2xl border-2 border-emerald-600 bg-emerald-50/40 p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-extrabold text-gray-900">
              {menu === "signup" ? tier?.name : `Top Up ${pack?.name}`}
            </p>
            <p className="text-[12px] text-gray-500">
              {menu === "signup"
                ? (isTrial ? "7 hari, 50 kredit, 1 seat" : `${rp(tier?.price || 0)} /seat /bulan, bonus ${tier?.credits} kredit`)
                : `${(pack?.credits || 0).toLocaleString("id-ID")} kredit, ${rp(pack?.perCredit || 0)} /kredit`}
            </p>
          </div>
          <p className="text-[17px] font-extrabold text-gray-900 shrink-0">{total === 0 ? t("reg.free") : rp(total)}</p>
        </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="grid gap-3">
          {menu === "signup" && (
            <>
              <Field label={t("reg.orgName")} value={form.org_name} onChange={(v) => set("org_name", v)} placeholder="PT Maju Jaya" />
              <div>
                <Label>{t("reg.industry")}</Label>
                <select value={form.industry} onChange={(e) => set("industry", e.target.value)} className={INPUT}>
                  <option value="">{t("reg.pickIndustry")}</option>
                  {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              {!isTrial && (
                <div>
                  <Label>{t("reg.seats")}</Label>
                  <input type="text" inputMode="numeric" value={seatsStr}
                    onChange={(e) => setSeatsStr(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                    onBlur={() => setSeatsStr(String(Math.max(tier?.minSeats || 1, seats)))}
                    className={INPUT} />
                </div>
              )}
            </>
          )}
          <Field label={t("reg.yourName")} value={form.name} onChange={(v) => set("name", v)} placeholder={t("reg.fullName")} />
          <Field label={t("reg.email")} value={form.email} onChange={(v) => set("email", v)} placeholder="nama@bisnis.com" type="email" />
          <Field label={t("reg.phone")} value={form.phone} onChange={(v) => set("phone", v)} placeholder="08xxxxxxxxxx" />
          {menu === "topup" && (
            <Field label={t("reg.orgNameRegistered")} value={form.org_name} onChange={(v) => set("org_name", v)} placeholder={t("reg.orgNameRegisteredPh")} />
          )}
          <Field label={t("reg.note")} value={form.note} onChange={(v) => set("note", v)} placeholder="" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-gray-100">
          <div>
            <p className="text-[11.5px] text-gray-500">{t("reg.total")}</p>
            <p className="text-[18px] font-extrabold text-gray-900">{total === 0 ? "Gratis" : rp(total)}</p>
            {menu === "signup" && !isTrial && (
              <p className="text-[11px] text-gray-400">
                {seats} seat &times; {rp(tier?.price || 0)}{billing === "annual" ? ` × 12 (${t("reg.billedAnnually")})` : " /bulan"}
              </p>
            )}
          </div>
          <button onClick={submit} disabled={busy}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-emerald-600 text-white text-[14px] font-bold hover:bg-emerald-700 transition-colors outline-none disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {menu === "signup" ? (isTrial ? t("reg.startTrial") : t("reg.signupNow")) : t("reg.sendRequest")}
          </button>
        </div>
        {err && <p className="text-[12.5px] text-red-600 mt-3">{err}</p>}
        <p className="text-[11.5px] text-gray-400 mt-4">
          {t("reg.disclaimer")}
        </p>
      </div>
      </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // data-public-site melepas overflow:hidden milik shell app (globals.css),
    // tanpa itu halaman render penuh tapi TIDAK BISA discroll.
    <div data-public-site className="min-h-screen bg-gray-50 text-gray-900">
      <header className="max-w-5xl mx-auto flex items-center justify-between px-5 py-5">
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg overflow-hidden shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/simpulx_logo.png" alt="Simpulx" className="w-full h-full object-cover" />
          </div>
          <span className="text-[19px] font-extrabold tracking-tight">Simpul<span className="text-amber-500">x</span></span>
        </a>
        <a href="/login" className="text-[13px] font-semibold text-gray-600 hover:text-gray-900">{t("reg.login")}</a>
      </header>
      <main className="max-w-5xl mx-auto px-5 pb-20">{children}</main>
    </div>
  );
}

const INPUT = "w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-[13.5px] outline-none focus:border-emerald-600 transition-colors";
function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12px] font-semibold text-gray-600 mb-1">{children}</label>;
}
function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={INPUT} />
    </div>
  );
}
