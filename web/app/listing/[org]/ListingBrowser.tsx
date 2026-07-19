"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Bath, BedDouble, Heart, LandPlot, LayoutGrid, MapPin, Rows3, Ruler,
  Search, SlidersHorizontal, X,
} from "lucide-react";
import { rupiah, type ListingIndex, type PublicListing } from "@/lib/public-listings";
import { useFavourites } from "./useFavourites";

// Buyer-facing browsing over the server-rendered inventory. The whole published
// set is already in the HTML (good for SEO + instant first paint), so filtering,
// sorting and view switching are pure array work with no extra round-trip.

const PRICE_STEPS = [
  { label: "Semua harga", min: 0, max: Infinity },
  { label: "Di bawah Rp 500 juta", min: 0, max: 500_000_000 },
  { label: "Rp 500 juta - 1 M", min: 500_000_000, max: 1_000_000_000 },
  { label: "Rp 1 M - 2 M", min: 1_000_000_000, max: 2_000_000_000 },
  { label: "Di atas Rp 2 M", min: 2_000_000_000, max: Infinity },
];

const SORTS = [
  { key: "recommended", label: "Paling sesuai" },
  { key: "price_asc", label: "Harga terendah" },
  { key: "price_desc", label: "Harga tertinggi" },
  { key: "land_desc", label: "Tanah terluas" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

export default function ListingBrowser({ data }: { data: ListingIndex }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [city, setCity] = useState("");
  const [priceIdx, setPriceIdx] = useState(0);
  const [beds, setBeds] = useState(0);
  const [cert, setCert] = useState("");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [onlyFav, setOnlyFav] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const { favs, toggle, isFav } = useFavourites(data.org.slug);
  const accent = data.org.accent || "#0E5B54";

  const certs = useMemo(
    () => Array.from(new Set(data.listings.map((l) => l.certificate).filter(Boolean) as string[])).sort(),
    [data.listings],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const price = PRICE_STEPS[priceIdx];
    const out = data.listings.filter((l) => {
      if (needle && !`${l.title} ${l.location_area ?? ""} ${l.city ?? ""} ${l.description ?? ""}`.toLowerCase().includes(needle)) return false;
      if (type && l.property_type !== type) return false;
      if (city && l.city !== city) return false;
      if (cert && l.certificate !== cert) return false;
      if (beds && (l.bedrooms ?? 0) < beds) return false;
      const p = l.price ?? 0;
      if (priceIdx > 0 && !(p >= price.min && p < price.max)) return false;
      if (onlyFav && !isFav(l.slug)) return false;
      return true;
    });
    const by: Record<SortKey, (a: PublicListing, b: PublicListing) => number> = {
      recommended: () => 0, // server order already puts the org's own priority first
      price_asc: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
      price_desc: (a, b) => (b.price ?? 0) - (a.price ?? 0),
      land_desc: (a, b) => (b.land_area ?? 0) - (a.land_area ?? 0),
    };
    return sort === "recommended" ? out : [...out].sort(by[sort]);
  }, [data.listings, q, type, city, cert, beds, priceIdx, onlyFav, isFav, sort]);

  const activeCount = [q, type, city, cert, beds || "", priceIdx || "", onlyFav ? "1" : ""].filter(Boolean).length;
  const reset = () => { setQ(""); setType(""); setCity(""); setCert(""); setBeds(0); setPriceIdx(0); setOnlyFav(false); };

  return (
    <section className="mx-auto max-w-[1440px] px-5">
      {/* Search + quick type chips, the pattern buyers know from the big portals. */}
      <div className="sticky top-[73px] z-10 -mx-5 px-5 py-3 bg-[#FAFAF8]/95 backdrop-blur border-b border-black/[0.06]">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama unit, area, atau kata kunci"
              className="w-full h-12 pl-10 pr-3 rounded-xl border border-black/10 bg-white text-[14.5px] placeholder:text-black/35 outline-none focus:border-[#0E5B54] focus:ring-4 focus:ring-[#0E5B54]/10 transition-all" />
          </div>
          <button onClick={() => setShowFilters((v) => !v)}
            className="h-12 px-4 rounded-xl border border-black/10 bg-white text-[13.5px] font-semibold inline-flex items-center gap-2 hover:border-black/25 transition-colors shrink-0">
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filter</span>
            {activeCount > 0 && (
              <span className="grid place-items-center min-w-5 h-5 px-1 rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: accent }}>{activeCount}</span>
            )}
          </button>
          {favs.length > 0 && (
            <button onClick={() => setOnlyFav((v) => !v)} aria-label="Unit tersimpan"
              style={onlyFav ? { backgroundColor: accent, borderColor: accent } : undefined}
              className={`h-12 px-4 rounded-xl border text-[13.5px] font-semibold inline-flex items-center gap-2 transition-colors shrink-0 ${onlyFav ? "text-white" : "bg-white border-black/10 hover:border-black/25"}`}>
              <Heart className={`w-4 h-4 ${onlyFav ? "fill-current" : ""}`} />{favs.length}
            </button>
          )}
        </div>

        {/* Type chips: one tap to the thing most buyers filter by first. */}
        {data.facets.types.length > 1 && (
          <div className="flex gap-2 mt-2.5 overflow-x-auto no-scrollbar">
            <Chip active={!type} onClick={() => setType("")} accent={accent}>Semua</Chip>
            {data.facets.types.map((tp) => (
              <Chip key={tp} active={type === tp} onClick={() => setType(type === tp ? "" : tp)} accent={accent}>{tp}</Chip>
            ))}
          </div>
        )}

        {showFilters && (
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Field label="Kota">
              <select value={city} onChange={(e) => setCity(e.target.value)} className={SELECT}>
                <option value="">Semua kota</option>
                {data.facets.cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Harga">
              <select value={priceIdx} onChange={(e) => setPriceIdx(Number(e.target.value))} className={SELECT}>
                {PRICE_STEPS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Kamar tidur">
              <select value={beds} onChange={(e) => setBeds(Number(e.target.value))} className={SELECT}>
                <option value={0}>Semua</option>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+ kamar</option>)}
              </select>
            </Field>
            {certs.length > 0 && (
              <Field label="Sertifikat">
                <select value={cert} onChange={(e) => setCert(e.target.value)} className={SELECT}>
                  <option value="">Semua</option>
                  {certs.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            )}
          </div>
        )}
      </div>

      {/* Result bar: count, sort, view mode. */}
      <div className="flex items-center justify-between gap-3 pt-5 pb-3 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="text-[13.5px] text-black/60"><span className="font-bold text-black/80">{filtered.length}</span> unit ditampilkan</p>
          {activeCount > 0 && (
            <button onClick={reset} style={{ color: accent }} className="inline-flex items-center gap-1 text-[12.5px] font-semibold hover:underline">
              <X className="w-3.5 h-3.5" />Hapus filter
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 pl-3 pr-8 rounded-lg border border-black/10 bg-white text-[13px] font-medium outline-none focus:border-[#0E5B54] transition-colors">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <div className="hidden sm:flex items-center rounded-lg border border-black/10 bg-white p-0.5">
            {([["grid", LayoutGrid], ["list", Rows3]] as const).map(([mode, Icon]) => (
              <button key={mode} onClick={() => setView(mode)} aria-label={mode === "grid" ? "Tampilan kartu" : "Tampilan daftar"}
                className={`grid place-items-center w-8 h-8 rounded-md transition-colors ${view === mode ? "bg-black/[0.06] text-black" : "text-black/40 hover:text-black/70"}`}>
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-semibold text-[16px]">Tidak ada unit yang cocok</p>
          <p className="text-[13.5px] text-black/50 mt-1">Coba longgarkan filter, atau hubungi kami untuk pilihan lain.</p>
          <button onClick={reset} className="mt-4 h-10 px-5 rounded-full text-white text-[13.5px] font-semibold" style={{ backgroundColor: accent }}>Hapus semua filter</button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-8">
          {filtered.map((l, i) => <Card key={l.id} org={data.org.slug} l={l} fav={isFav(l.slug)} onFav={() => toggle(l.slug)} accent={accent} idx={i} />)}
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-8">
          {filtered.map((l, i) => <Row key={l.id} org={data.org.slug} l={l} fav={isFav(l.slug)} onFav={() => toggle(l.slug)} accent={accent} idx={i} />)}
        </div>
      )}
    </section>
  );
}

const SELECT = "w-full h-10 px-3 rounded-lg border border-black/10 bg-white text-[13px] outline-none focus:border-[#0E5B54] transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-black/40 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Chip({ active, onClick, accent, children }: { active: boolean; onClick: () => void; accent: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={active ? { backgroundColor: accent, borderColor: accent } : undefined}
      className={`shrink-0 h-9 px-4 rounded-full border text-[13px] font-semibold transition-colors ${active ? "text-white" : "bg-white border-black/10 text-black/70 hover:border-black/30"}`}>
      {children}
    </button>
  );
}

// Specs as icon+value pairs rather than a run-on string: it is what buyers scan.
function Specs({ l, className = "" }: { l: PublicListing; className?: string }) {
  const items = [
    l.bedrooms ? { Icon: BedDouble, v: l.bedrooms } : null,
    l.bathrooms ? { Icon: Bath, v: l.bathrooms } : null,
    l.land_area ? { Icon: LandPlot, v: `${l.land_area}m²` } : null,
    l.building_area ? { Icon: Ruler, v: `${l.building_area}m²` } : null,
  ].filter(Boolean) as { Icon: typeof BedDouble; v: string | number }[];
  if (!items.length) return null;
  return (
    <div className={`flex items-center gap-3 text-[12.5px] text-black/60 ${className}`}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1"><it.Icon className="w-3.5 h-3.5 text-black/35" />{it.v}</span>
      ))}
    </div>
  );
}

function FavButton({ fav, onFav }: { fav: boolean; onFav: () => void }) {
  return (
    <button onClick={onFav} aria-label={fav ? "Hapus dari favorit" : "Simpan ke favorit"}
      className="absolute top-3 right-3 grid place-items-center w-9 h-9 rounded-full bg-white/95 hover:bg-white shadow-sm transition-colors">
      <Heart className={`w-4 h-4 ${fav ? "fill-[#E11D48] text-[#E11D48]" : "text-black/50"}`} />
    </button>
  );
}

function Card({ org, l, fav, onFav, accent, idx = 0 }: { org: string; l: PublicListing; fav: boolean; onFav: () => void; accent: string; idx?: number }) {
  const cover = l.photos?.[0]?.url;
  return (
    <article className="lst-card group relative rounded-2xl bg-white border border-black/[0.06] overflow-hidden transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_14px_40px_rgba(0,0,0,0.10)]"
      style={{ animation: "lstFadeUp .5s cubic-bezier(.16,1,.3,1) both", animationDelay: `${Math.min(idx, 11) * 45}ms` }}>
      <Link href={`/listing/${org}/${l.slug}`} className="block relative aspect-[4/3] bg-black/[0.04]">
        {cover ? (
          <Image src={cover} alt={l.title} fill sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, (max-width:1280px) 33vw, 25vw"
            className="object-cover group-hover:scale-[1.02] transition-transform duration-300" unoptimized />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-black/20 text-[13px]">Tanpa foto</div>
        )}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {l.property_type && <span className="px-2.5 py-1 rounded-full bg-white/95 text-[11px] font-bold">{l.property_type}</span>}
          {l.certificate && <span className="px-2.5 py-1 rounded-full bg-black/60 text-white text-[11px] font-bold">{l.certificate}</span>}
        </div>
        {(l.photos?.length ?? 0) > 1 && (
          <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/55 text-white text-[11px] font-semibold">{l.photos.length} foto</span>
        )}
      </Link>
      <FavButton fav={fav} onFav={onFav} />
      <div className="p-4">
        <p className="text-[17px] font-bold tracking-tight">{rupiah(l.price)}</p>
        <Link href={`/listing/${org}/${l.slug}`} className="mt-1.5 block text-[14.5px] font-semibold hover:underline line-clamp-1" style={{ textDecorationColor: accent }}>{l.title}</Link>
        <Specs l={l} className="mt-2" />
        {(l.location_area || l.city) && (
          <p className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-black/45">
            <MapPin className="w-3.5 h-3.5" />{[l.location_area, l.city].filter(Boolean).join(", ")}
          </p>
        )}
      </div>
    </article>
  );
}

function Row({ org, l, fav, onFav, accent, idx = 0 }: { org: string; l: PublicListing; fav: boolean; onFav: () => void; accent: string; idx?: number }) {
  const cover = l.photos?.[0]?.url;
  return (
    <article className="lst-card relative flex gap-4 rounded-2xl bg-white border border-black/[0.06] overflow-hidden transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
      style={{ animation: "lstFadeUp .5s cubic-bezier(.16,1,.3,1) both", animationDelay: `${Math.min(idx, 11) * 40}ms` }}>
      <Link href={`/listing/${org}/${l.slug}`} className="relative w-[180px] sm:w-[260px] shrink-0 aspect-[4/3] bg-black/[0.04]">
        {cover && <Image src={cover} alt={l.title} fill sizes="260px" className="object-cover" unoptimized />}
        {l.property_type && <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-white/95 text-[10.5px] font-bold">{l.property_type}</span>}
      </Link>
      <div className="flex-1 min-w-0 py-4 pr-12">
        <p className="text-[18px] font-bold tracking-tight">{rupiah(l.price)}</p>
        <Link href={`/listing/${org}/${l.slug}`} className="mt-1 block text-[15px] font-semibold hover:underline line-clamp-1" style={{ textDecorationColor: accent }}>{l.title}</Link>
        <Specs l={l} className="mt-2" />
        {(l.location_area || l.city) && (
          <p className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-black/45">
            <MapPin className="w-3.5 h-3.5" />{[l.location_area, l.city].filter(Boolean).join(", ")}
          </p>
        )}
        {l.description && <p className="mt-2 text-[13px] text-black/55 line-clamp-2 hidden sm:block">{l.description}</p>}
      </div>
      <FavButton fav={fav} onFav={onFav} />
    </article>
  );
}
