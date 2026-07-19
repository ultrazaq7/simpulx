"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Bath, BedDouble, Check, ChevronLeft, ChevronRight, FileText, Heart, LandPlot,
  MapPin, Maximize2, Phone, Ruler, Share2, ShieldCheck, X,
} from "lucide-react";
import { rupiah, waLink, type ListingDetail } from "@/lib/public-listings";
import { useFavourites } from "../useFavourites";
import ListingMap from "./ListingMap";

const DESC_CLAMP = 420; // chars before the "Muat lebih banyak" fold

export default function ListingDetailView({ data, orgSlug }: { data: ListingDetail; orgSlug: string }) {
  const l = data.listing;
  const photos = l.photos ?? [];
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const { toggle, isFav } = useFavourites(orgSlug);
  const fav = isFav(l.slug);
  const accent = data.org.accent || "#0E5B54";

  const pageUrl = typeof window !== "undefined" ? window.location.href : undefined;
  const wa = waLink(data.org, l, pageUrl);
  const phone = (data.org.whatsapp || "").replace(/[^\d]/g, "");
  const features = Array.isArray(l.attributes?.features) ? (l.attributes!.features as string[]) : [];

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) { try { await navigator.share({ title: l.title, url }); return; } catch { /* dismissed */ } }
    try { await navigator.clipboard.writeText(url); alert("Tautan disalin"); } catch { /* ignore */ }
  }

  // Big spec tiles (what buyers scan first), then a detail table for the rest.
  const tiles = [
    l.land_area ? { icon: LandPlot, label: "Luas tanah", value: `${l.land_area} m²` } : null,
    l.building_area ? { icon: Ruler, label: "Luas bangunan", value: `${l.building_area} m²` } : null,
    l.bedrooms ? { icon: BedDouble, label: "Kamar tidur", value: String(l.bedrooms) } : null,
    l.bathrooms ? { icon: Bath, label: "Kamar mandi", value: String(l.bathrooms) } : null,
  ].filter(Boolean) as { icon: typeof BedDouble; label: string; value: string }[];

  const rows = [
    l.property_type ? ["Tipe properti", l.property_type] : null,
    l.certificate ? ["Sertifikat", l.certificate] : null,
    l.location_area ? ["Area", l.location_area] : null,
    l.city ? ["Kota", l.city] : null,
  ].filter(Boolean) as [string, string][];

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setActive((i) => (i + 1) % photos.length);
      else if (e.key === "ArrowLeft") setActive((i) => (i - 1 + photos.length) % photos.length);
      else if (e.key === "Escape") setLightbox(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, photos.length]);

  const longDesc = (l.description ?? "").length > DESC_CLAMP;
  const descShown = descOpen || !longDesc ? l.description : l.description!.slice(0, DESC_CLAMP) + "…";

  return (
    <>
      {/* Magazine gallery: a big cover with a thumbnail grid beside it (rumah123). */}
      <section className="mx-auto max-w-[1200px] px-5 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-[1.7fr_1fr] gap-2 rounded-2xl overflow-hidden">
          <button onClick={() => photos.length && setLightbox(true)} className="relative aspect-[16/11] bg-black/[0.04]">
            {photos[active]?.url ? (
              <Image src={photos[active].url} alt={l.title} fill sizes="(max-width:768px) 100vw, 700px" className="object-cover" priority unoptimized />
            ) : <div className="absolute inset-0 grid place-items-center text-black/25">Tanpa foto</div>}
            {photos.length > 0 && (
              <span className="absolute bottom-3 left-3 h-8 px-3 rounded-full bg-black/55 text-white text-[12px] font-semibold inline-flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5" />{photos.length} foto
              </span>
            )}
          </button>
          {photos.length > 1 && (
            <div className="hidden md:grid grid-rows-2 gap-2">
              {[1, 2].map((idx) => photos[idx] && (
                <button key={idx} onClick={() => { setActive(idx); setLightbox(true); }} className="relative bg-black/[0.04] overflow-hidden">
                  <Image src={photos[idx].url} alt="" fill sizes="350px" className="object-cover" unoptimized />
                  {idx === 2 && photos.length > 3 && (
                    <span className="absolute inset-0 bg-black/45 grid place-items-center text-white text-[15px] font-bold">
                      +{photos.length - 3} foto
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {photos.length > 1 && (
          <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {photos.map((p, i) => (
              <button key={p.url + i} onClick={() => setActive(i)}
                className={`relative w-20 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-colors ${i === active ? "" : "border-transparent opacity-70 hover:opacity-100"}`}
                style={i === active ? { borderColor: accent } : undefined}>
                <Image src={p.url} alt="" fill sizes="80px" className="object-cover" unoptimized />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-[1200px] px-5 pt-8 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {l.property_type && <span className="inline-block px-2.5 py-1 rounded-full bg-black/[0.05] text-[12px] font-bold">{l.property_type}</span>}
              <p className="mt-3 text-[30px] sm:text-[34px] font-bold tracking-tight" style={{ color: accent }}>{rupiah(l.price)}</p>
              <h1 className="mt-1 text-[19px] sm:text-[22px] font-bold tracking-tight leading-snug">{l.title}</h1>
              {(l.location_area || l.city) && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[14px] text-black/55">
                  <MapPin className="w-4 h-4 shrink-0" />{[l.address, l.location_area, l.city].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => toggle(l.slug)} aria-label="Simpan" className="grid place-items-center w-10 h-10 rounded-full border border-black/10 bg-white hover:border-black/25 transition-colors">
                <Heart className={`w-4 h-4 ${fav ? "fill-[#E11D48] text-[#E11D48]" : "text-black/50"}`} />
              </button>
              <button onClick={share} aria-label="Bagikan" className="grid place-items-center w-10 h-10 rounded-full border border-black/10 bg-white hover:border-black/25 transition-colors">
                <Share2 className="w-4 h-4 text-black/50" />
              </button>
            </div>
          </div>

          {tiles.length > 0 && (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {tiles.map((f) => (
                <div key={f.label} className="rounded-xl bg-white border border-black/[0.06] px-4 py-3.5">
                  <f.icon className="w-[18px] h-[18px] text-black/35" />
                  <p className="mt-2 text-[16px] font-bold leading-none">{f.value}</p>
                  <p className="text-[11.5px] text-black/45 mt-1">{f.label}</p>
                </div>
              ))}
            </div>
          )}

          {features.length > 0 && (
            <div className="mt-8">
              <h2 className="text-[17px] font-bold mb-3">Overview</h2>
              <div className="flex flex-wrap gap-2">
                {features.map((f) => (
                  <span key={f} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/[0.04] text-[13px] font-medium">
                    <Check className="w-3.5 h-3.5" style={{ color: accent }} />{f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className="mt-8">
              <h2 className="text-[17px] font-bold mb-3">Spesifikasi</h2>
              <dl className="rounded-xl border border-black/[0.06] overflow-hidden">
                {rows.map(([k, v], i) => (
                  <div key={k} className={`flex items-center justify-between px-4 py-3 text-[14px] ${i % 2 ? "bg-black/[0.015]" : ""}`}>
                    <dt className="text-black/50">{k}</dt>
                    <dd className="font-semibold text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {l.description && (
            <div className="mt-8">
              <h2 className="text-[17px] font-bold mb-2">Deskripsi</h2>
              <p className="text-[15px] leading-relaxed text-black/70 whitespace-pre-line">{descShown}</p>
              {longDesc && (
                <button onClick={() => setDescOpen((v) => !v)} className="mt-2 text-[13.5px] font-semibold hover:underline" style={{ color: accent }}>
                  {descOpen ? "Muat lebih sedikit" : "Muat lebih banyak"}
                </button>
              )}
            </div>
          )}

          {l.latitude && l.longitude && (
            <div className="mt-8">
              <h2 className="text-[17px] font-bold mb-3">Lokasi</h2>
              <ListingMap lat={l.latitude} lng={l.longitude} title={l.title} />
            </div>
          )}
        </div>

        {/* Contact card (rumah123 style): identity + phone + WhatsApp. */}
        <aside className="lg:sticky lg:top-24">
          <div className="rounded-2xl bg-white border border-black/[0.06] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-3">
              {data.org.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.org.logo} alt={data.org.name} className="w-12 h-12 rounded-full object-contain bg-black/[0.03] shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full grid place-items-center text-white text-[16px] font-bold shrink-0" style={{ backgroundColor: accent }}>
                  {data.org.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[15px] font-bold truncate">{data.org.name}</p>
                <p className="text-[12px] text-black/45 truncate">{data.org.tagline || "Tim penjualan"}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-[12.5px] text-black/50">
              <ShieldCheck className="w-4 h-4" style={{ color: accent }} />Terverifikasi Simpulx
            </div>
            <a href={wa} target="_blank" rel="noopener noreferrer"
              className="mt-4 w-full h-12 rounded-xl text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}>
              Tanya lewat WhatsApp
            </a>
            {phone && (
              <a href={`tel:+${phone}`} className="mt-2 w-full h-11 rounded-xl border border-black/10 text-[14px] font-semibold inline-flex items-center justify-center gap-2 hover:border-black/25 transition-colors">
                <Phone className="w-4 h-4" />+{phone}
              </a>
            )}
            <p className="mt-3 text-[11.5px] text-black/40 leading-relaxed flex items-start gap-1.5">
              <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Anda akan diarahkan ke WhatsApp dengan detail unit ini agar tim kami bisa langsung membantu.
            </p>
          </div>
        </aside>
      </section>

      {/* Mobile sticky action bar. */}
      <div className="lg:hidden sticky bottom-0 z-20 border-t border-black/[0.06] bg-white/95 backdrop-blur px-5 py-3 mt-8">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold truncate">{rupiah(l.price)}</p>
            <p className="text-[11.5px] text-black/45 truncate">{l.title}</p>
          </div>
          {phone && (
            <a href={`tel:+${phone}`} aria-label="Telepon" className="grid place-items-center w-11 h-11 rounded-xl border border-black/15 shrink-0">
              <Phone className="w-4 h-4" />
            </a>
          )}
          <a href={wa} target="_blank" rel="noopener noreferrer" className="h-11 px-5 rounded-xl text-white text-[14px] font-semibold inline-flex items-center shrink-0" style={{ backgroundColor: accent }}>WhatsApp</a>
        </div>
      </div>

      {lightbox && photos[active]?.url && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col p-4" onClick={() => setLightbox(false)}>
          <div className="flex justify-between items-center text-white/80 mb-2">
            <span className="text-[13px]">{active + 1} / {photos.length}</span>
            <button aria-label="Tutup" className="hover:text-white"><X className="w-6 h-6" /></button>
          </div>
          <div className="relative flex-1" onClick={(e) => e.stopPropagation()}>
            <Image src={photos[active].url} alt={l.title} fill sizes="100vw" className="object-contain" unoptimized />
            {photos.length > 1 && (
              <>
                <button aria-label="Sebelumnya" onClick={() => setActive((i) => (i - 1 + photos.length) % photos.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 grid place-items-center w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 text-white transition-colors">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button aria-label="Berikutnya" onClick={() => setActive((i) => (i + 1) % photos.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 text-white transition-colors">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
          {photos.length > 1 && (
            <div className="mt-3 flex gap-2 justify-center overflow-x-auto no-scrollbar" onClick={(e) => e.stopPropagation()}>
              {photos.map((p, i) => (
                <button key={i} onClick={() => setActive(i)} className={`relative w-16 h-12 rounded overflow-hidden shrink-0 ${i === active ? "ring-2 ring-white" : "opacity-60"}`}>
                  <Image src={p.url} alt="" fill sizes="64px" className="object-cover" unoptimized />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
