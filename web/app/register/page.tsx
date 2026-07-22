"use client";
// Public onboarding page: register a new business, or top up credits for an
// existing one. Two menus on one page because both end in the same place — a
// request a human approves — and a returning customer should not have to hunt
// for a different URL to buy more credits.
//
// Nothing here activates anything. Submitting creates a pending request and the
// operator activates it from the platform panel, so the page can be public
// without letting anyone provision themselves.
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Loader2, Sparkles, Zap, Building2 } from "lucide-react";

const SIGNUP_TIERS = [
  {
    key: "trial", name: "Free Trial", price: 0, per: "7 hari",
    credits: 50, highlight: false,
    tagline: "Coba dulu, tanpa kartu, tanpa komitmen",
    features: ["7 hari akses penuh", "50 kredit balasan AI", "1 seat", "Semua fitur inbox + AI"],
  },
  {
    key: "starter", name: "Starter", price: 100_000, per: "seat / bulan",
    credits: 200, highlight: false,
    tagline: "Untuk tim kecil yang mulai serius",
    features: ["Bonus 200 kredit AI", "Inbox WhatsApp bersama", "Round-robin antar sales", "Laporan performa dasar"],
  },
  {
    key: "growth", name: "Growth", price: 150_000, per: "seat / bulan",
    credits: 200, highlight: true,
    tagline: "Paling banyak dipilih",
    features: ["Semua fitur Starter", "AI nurture + follow-up penuh", "Campaign & broadcast", "Laporan iklan (Meta/TikTok/Google)"],
  },
  {
    key: "business", name: "Business", price: 200_000, per: "seat / bulan",
    credits: 200, highlight: false,
    tagline: "Untuk tim besar + ads dikelola",
    features: ["Semua fitur Growth", "Ads dikelola Simpulx", "Monitoring & alert otomatis", "Dukungan prioritas"],
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

export default function RegisterPage() {
  const [menu, setMenu] = useState<"signup" | "topup">("signup");
  // Wizard dua layar: layar 1 pilih paket, layar 2 isi data. pkg kosong = layar 1.
  const [pkg, setPkg] = useState("");
  const [seats, setSeats] = useState(3);
  const [form, setForm] = useState({ org_name: "", industry: "", name: "", email: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const tier = SIGNUP_TIERS.find((t) => t.key === pkg);
  const pack = TOPUP_PACKS.find((t) => t.key === pkg);
  const isTrial = menu === "signup" && pkg === "trial";

  const total = useMemo(() => {
    if (menu === "topup") return pack ? pack.credits * pack.perCredit : 0;
    if (!tier) return 0;
    return tier.price * (isTrial ? 1 : seats);
  }, [menu, tier, pack, seats, isTrial]);

  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }
  // Wizard per layar, bukan form yang muncul di bawah: memilih paket MENGGANTI
  // tampilan ke layar isian (dengan tombol kembali), sehingga tidak ada urusan
  // scroll sama sekali. scrollTo(0,0) supaya layar baru mulai dari atas.
  function choose(key: string) {
    setPkg(key);
    window.scrollTo({ top: 0 });
  }
  function back() {
    setPkg("");
    setErr("");
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    setErr("");
    if (!form.name.trim() || !form.email.includes("@")) { setErr("Nama dan email yang valid wajib diisi."); return; }
    if (menu === "signup" && !form.org_name.trim()) { setErr("Nama bisnis wajib diisi."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/public/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: menu, package: pkg, seats, ...form }),
      });
      if (!r.ok) throw new Error(await r.text());
      setDone(true);
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 grid place-items-center mx-auto mb-4"><Check className="w-7 h-7" /></div>
          <h1 className="text-[22px] font-extrabold text-gray-900 mb-2">Permintaan diterima</h1>
          <p className="text-[14px] text-gray-500 leading-relaxed">
            Tim Simpulx akan memproses {menu === "signup" ? "pendaftaran" : "top up"} kamu dan menghubungi lewat email
            {" "}<strong className="text-gray-800">{form.email}</strong> begitu aktif. Biasanya kurang dari 1 hari kerja.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center mb-8">
        <h1 className="text-[26px] sm:text-[32px] font-extrabold text-gray-900 tracking-tight">
          {menu === "signup" ? "Mulai jualan lebih pintar di WhatsApp" : "Top up kredit AI"}
        </h1>
        <p className="text-[14.5px] text-gray-500 mt-2 max-w-xl mx-auto">
          {menu === "signup"
            ? "Satu inbox untuk semua sales, AI yang bantu balas dan follow-up lead, laporan iklan sampai closing."
            : "1 kredit = 1 balasan AI ke customer. Kredit tidak hangus selama langganan aktif."}
        </p>
      </div>

      {!pkg && (<>
      {/* Layar 1: pilih menu + paket. */}
      <div className="flex items-center justify-center gap-1 p-1 bg-gray-100 rounded-xl w-fit mx-auto mb-8">
        {([["signup", "Daftar", Building2], ["topup", "Top Up Kredit", Zap]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => { setMenu(k); setPkg(""); setDone(false); }}
            className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-[13.5px] font-semibold transition-colors outline-none ${
              menu === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {menu === "signup" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {SIGNUP_TIERS.map((t) => (
            <button key={t.key} onClick={() => choose(t.key)}
              className={`relative text-left rounded-2xl border-2 p-4 transition-all outline-none ${
                pkg === t.key ? "border-emerald-600 bg-emerald-50/40 shadow-md" : "border-gray-200 bg-white hover:border-gray-300"}`}>
              {t.highlight && (
                <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10.5px] font-bold">POPULER</span>
              )}
              <p className="text-[14px] font-extrabold text-gray-900">{t.name}</p>
              <p className="text-[11.5px] text-gray-500 mb-2">{t.tagline}</p>
              <p className="text-[20px] font-extrabold text-gray-900">
                {t.price === 0 ? "Gratis" : rp(t.price)}
                <span className="text-[11px] font-medium text-gray-400"> /{t.per}</span>
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
        <div className="grid sm:grid-cols-3 gap-3 mb-8 max-w-2xl mx-auto">
          {TOPUP_PACKS.map((t) => (
            <button key={t.key} onClick={() => choose(t.key)}
              className={`text-left rounded-2xl border-2 p-4 transition-all outline-none ${
                pkg === t.key ? "border-emerald-600 bg-emerald-50/40 shadow-md" : "border-gray-200 bg-white hover:border-gray-300"}`}>
              <p className="text-[14px] font-extrabold text-gray-900">{t.name}</p>
              <p className="text-[20px] font-extrabold text-gray-900 mt-1">{t.credits.toLocaleString("id-ID")} <span className="text-[11px] font-medium text-gray-400">kredit</span></p>
              <p className="text-[12px] text-gray-500 mt-1">{rp(t.perCredit)} / kredit</p>
              <p className="text-[13px] font-bold text-emerald-700 mt-2">{rp(t.credits * t.perCredit)}</p>
            </button>
          ))}
        </div>
      )}

      <p className="text-center text-[13.5px] text-gray-400">Pilih paket untuk lanjut ke pengisian data.</p>
      </>)}

      {/* Layar 2: ringkasan paket + form, dengan tombol kembali. */}
      {pkg && (
      <div className="max-w-lg mx-auto">
        <button onClick={back}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 hover:text-gray-900 mb-4 outline-none">
          <ArrowLeft className="w-4 h-4" /> Ganti paket
        </button>

        {/* Ringkasan pilihan, supaya layar ini berdiri sendiri tanpa harus ingat
            card yang tadi diklik. */}
        <div className="rounded-2xl border-2 border-emerald-600 bg-emerald-50/40 p-4 mb-4 flex items-center justify-between gap-3">
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
          <p className="text-[17px] font-extrabold text-gray-900 shrink-0">{total === 0 ? "Gratis" : rp(total)}</p>
        </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <div className="grid gap-3">
          {menu === "signup" && (
            <>
              <Field label="Nama bisnis" value={form.org_name} onChange={(v) => set("org_name", v)} placeholder="cth. Danafin" />
              <div>
                <Label>Industri</Label>
                <select value={form.industry} onChange={(e) => set("industry", e.target.value)} className={INPUT}>
                  <option value="">Pilih industri</option>
                  {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              {!isTrial && (
                <div>
                  <Label>Jumlah seat (sales/agent)</Label>
                  <input type="number" min={1} max={100} value={seats}
                    onChange={(e) => setSeats(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className={INPUT} />
                </div>
              )}
            </>
          )}
          <Field label="Nama kamu" value={form.name} onChange={(v) => set("name", v)} placeholder="Nama lengkap" />
          <Field label="Email" value={form.email} onChange={(v) => set("email", v)} placeholder="nama@bisnis.com" type="email" />
          <Field label="No. WhatsApp" value={form.phone} onChange={(v) => set("phone", v)} placeholder="08xxxxxxxxxx" />
          {menu === "topup" && (
            <Field label="Nama bisnis terdaftar" value={form.org_name} onChange={(v) => set("org_name", v)} placeholder="Nama bisnis di akun Simpulx kamu" />
          )}
          <Field label="Catatan (opsional)" value={form.note} onChange={(v) => set("note", v)} placeholder="" />
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
          <div>
            <p className="text-[11.5px] text-gray-500">Total</p>
            <p className="text-[18px] font-extrabold text-gray-900">{total === 0 ? "Gratis" : rp(total)}</p>
            {menu === "signup" && !isTrial && <p className="text-[11px] text-gray-400">{seats} seat &times; {rp(tier?.price || 0)} /bulan</p>}
          </div>
          <button onClick={submit} disabled={busy}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-emerald-600 text-white text-[14px] font-bold hover:bg-emerald-700 transition-colors outline-none disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {menu === "signup" ? (isTrial ? "Mulai Free Trial" : "Daftar sekarang") : "Kirim permintaan"}
          </button>
        </div>
        {err && <p className="text-[12.5px] text-red-600 mt-3">{err}</p>}
        <p className="text-[11.5px] text-gray-400 mt-4">
          Aktivasi dikonfirmasi manual oleh tim Simpulx, biasanya kurang dari 1 hari kerja. Tidak ada pembayaran otomatis dari halaman ini.
        </p>
      </div>
      </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="max-w-5xl mx-auto flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg overflow-hidden shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/simpulx_logo.png" alt="Simpulx" className="w-full h-full object-cover" />
          </div>
          <span className="text-[19px] font-extrabold tracking-tight">Simpul<span className="text-amber-500">x</span></span>
        </div>
        <a href="/login" className="text-[13px] font-semibold text-gray-600 hover:text-gray-900">Sudah punya akun? Masuk</a>
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
