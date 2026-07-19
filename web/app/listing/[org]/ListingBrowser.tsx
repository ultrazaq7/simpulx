"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { rupiah, specLine, type ListingIndex, type PublicListing } from "@/lib/public-listings";
import { useFavourites } from "./useFavourites";

// Client-side browsing over the server-rendered inventory. The whole published
// set is already in the HTML (good for SEO + instant first paint), so filtering
// here is a pure array operation with no extra round-trip.

const PRICE_STEPS = [
  { label: "Semua harga", min: 0, max: Infinity },
  { label: "< Rp 500 juta", min: 0, max: 500_000_000 },
  { label: "Rp 500 juta - 1 M", min: 500_000_000, max: 1_000_000_000 },
  { label: "Rp 1 M - 2 M", min: 1_000_000_000, max: 2_000_000_000 },
  { label: "> Rp 2 M", min: 2_000_000_000, max: Infinity },
];

export default function ListingBrowser({ data }: { data: ListingIndex }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [city, setCity] = useState("");
  const [priceIdx, setPriceIdx] = useState(0);
  const [beds, setBeds] = useState(0);
  const [onlyFav, setOnlyFav] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { favs, toggle, isFav } = useFavourites(data.org.slug);
  const accent = data.org.accent || "#0E5B54";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const price = PRICE_STEPS[priceIdx];
    return data.listings.filter((l) => {
      if (needle && !`${l.title} ${l.location_area ?? ""} ${l.city ?? ""} ${l.description ?? ""}`.toLowerCase().includes(needle)) return false;
      if (type && l.property_type !== type) return false;
      if (city && l.city !== city) return false;
      if (beds && (l.bedrooms ?? 0) < beds) return false;
      const p = l.price ?? 0;
      if (priceIdx > 0 && !(p >= price.min && p < price.max)) return false;
      if (onlyFav && !isFav(l.slug)) return false;
      return true;
    });
  }, [data.listings, q, type, city, beds, priceIdx, onlyFav, isFav]);

  const hasFilter = !!(q || type || city || beds || priceIdx || onlyFav);
  const reset = () => { setQ(""); setType(""); setCity(""); setBeds(0); setPriceIdx(0); setOnlyFav(false); };

  return (
    <section className="mx-auto max-w-6xl px-5">
      {/* Search + filter bar */}
      <div className="sticky top-[65px] z-10 -mx-5 px-5 py-3 bg-[#FAFAF8]/95 backdrop-blur border-b border-black/[0.06]">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/35" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama unit, area, atau kata kunci"
              className="w-full h-11 pl-9 pr-3 rounded-xl border border-black/10 bg-white text-[14px] placeholder:text-black/35 outline-none focus:border-[#0E5B54] transition-colors" />
          </div>
          <button onClick={() => setShowFilters((v) => !v)}
            className="h-11 px-4 rounded-xl border border-black/10 bg-white text-[13px] font-semibold inline-flex items-center gap-2 hover:border-black/25 transition-colors">
            <SlidersHorizontal className="w-4 h-4" />Filter
          </button>
          {favs.length > 0 && (
            <button onClick={() => setOnlyFav((v) => !v)}
              style={onlyFav ? { backgroundColor: accent, borderColor: accent } : undefined}
              className={`h-11 px-4 rounded-xl border text-[13px] font-semibold inline-flex items-center gap-2 transition-colors ${onlyFav ? "text-white" : "bg-white border-black/10 hover:border-black/25"}`}>
              <Heart className={`w-4 h-4 ${onlyFav ? "fill-current" : ""}`} />{favs.length}
            </button>
          )}
        </div>

        {showFilters && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)} className={SELECT}>
              <option value="">Semua tipe</option>
              {data.facets.types.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
            </select>
            <select value={city} onChange={(e) => setCity(e.target.value)} className={SELECT}>
              <option value="">Semua kota</option>
              {data.facets.cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={priceIdx} onChange={(e) => setPriceIdx(Number(e.target.value))} className={SELECT}>
              {PRICE_STEPS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
            </select>
            <select value={beds} onChange={(e) => setBeds(Number(e.target.value))} className={SELECT}>
              <option value={0}>Semua kamar</option>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+ kamar tidur</option>)}
            </select>
          </div>
        )}

        {hasFilter && (
          <button onClick={reset} style={{ color: accent }} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold hover:underline">
            <X className="w-3 h-3" />Hapus filter
          </button>
        )}
      </div>

      <p className="pt-5 pb-3 text-[13px] text-black/50">{filtered.length} unit ditampilkan</p>

      {filtered.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-semibold">Tidak ada unit yang cocok</p>
          <p className="text-[13px] text-black/50 mt-1">Coba longgarkan filter atau hubungi kami untuk pilihan lain.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-4">
          {filtered.map((l) => (
            <Card key={l.id} org={data.org.slug} l={l} fav={isFav(l.slug)} onFav={() => toggle(l.slug)} />
          ))}
        </div>
      )}
    </section>
  );
}

const SELECT = "h-10 px-3 rounded-lg border border-black/10 bg-white text-[13px] outline-none focus:border-[#0E5B54] transition-colors";

function Card({ org, l, fav, onFav }: { org: string; l: PublicListing; fav: boolean; onFav: () => void }) {
  const cover = l.photos?.[0]?.url;
  return (
    <article className="group relative rounded-2xl bg-white border border-black/[0.06] overflow-hidden hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-shadow">
      <Link href={`/listing/${org}/${l.slug}`} className="block relative aspect-[4/3] bg-black/[0.04]">
        {cover ? (
          <Image src={cover} alt={l.title} fill sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-[1.02] transition-transform duration-300" unoptimized />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-black/20 text-[13px]">Tanpa foto</div>
        )}
        {l.property_type && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 text-[11px] font-bold">{l.property_type}</span>
        )}
      </Link>
      {/* Sits above the cover link so saving never navigates away. */}
      <button onClick={onFav} aria-label={fav ? "Hapus dari favorit" : "Simpan ke favorit"}
        className="absolute top-3 right-3 grid place-items-center w-9 h-9 rounded-full bg-white/95 hover:bg-white shadow-sm transition-colors">
        <Heart className={`w-4 h-4 ${fav ? "fill-[#E11D48] text-[#E11D48]" : "text-black/50"}`} />
      </button>
      <div className="p-4">
        <p className="text-[17px] font-bold tracking-tight">{rupiah(l.price)}</p>
        <Link href={`/listing/${org}/${l.slug}`} className="mt-0.5 block text-[14px] font-semibold hover:text-[#0E5B54] transition-colors line-clamp-1">{l.title}</Link>
        {specLine(l) && <p className="mt-1 text-[12.5px] text-black/55">{specLine(l)}</p>}
        {(l.location_area || l.city) && (
          <p className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-black/45">
            <MapPin className="w-3.5 h-3.5" />{[l.location_area, l.city].filter(Boolean).join(", ")}
          </p>
        )}
      </div>
    </article>
  );
}
