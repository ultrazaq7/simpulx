"use client";
import { useState } from "react";
import Image from "next/image";
import { Bath, BedDouble, FileText, Heart, LandPlot, MapPin, Maximize2, Ruler, Share2, X } from "lucide-react";
import { rupiah, waLink, type ListingDetail } from "@/lib/public-listings";
import { useFavourites } from "../useFavourites";
import ListingMap from "./ListingMap";

export default function ListingDetailView({ data, orgSlug }: { data: ListingDetail; orgSlug: string }) {
  const l = data.listing;
  const photos = l.photos ?? [];
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const { toggle, isFav } = useFavourites(orgSlug);
  const fav = isFav(l.slug);
  const accent = data.org.accent || "#0E5B54";

  const pageUrl = typeof window !== "undefined" ? window.location.href : undefined;
  const wa = waLink(data.org, l, pageUrl);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) { try { await navigator.share({ title: l.title, url }); return; } catch { /* dismissed */ } }
    try { await navigator.clipboard.writeText(url); alert("Tautan disalin"); } catch { /* ignore */ }
  }

  const facts = [
    l.bedrooms ? { icon: BedDouble, label: "Kamar tidur", value: String(l.bedrooms) } : null,
    l.bathrooms ? { icon: Bath, label: "Kamar mandi", value: String(l.bathrooms) } : null,
    l.land_area ? { icon: LandPlot, label: "Luas tanah", value: `${l.land_area} m²` } : null,
    l.building_area ? { icon: Ruler, label: "Luas bangunan", value: `${l.building_area} m²` } : null,
    l.certificate ? { icon: FileText, label: "Sertifikat", value: l.certificate } : null,
  ].filter(Boolean) as { icon: typeof BedDouble; label: string; value: string }[];

  return (
    <>
      <section className="mx-auto max-w-[1200px] px-5 pt-6">
        {/* Gallery: one big cover + thumbnails, tap to open full screen. */}
        <div className="rounded-2xl overflow-hidden bg-black/[0.04] relative aspect-[16/10]">
          {photos[active]?.url ? (
            <Image src={photos[active].url} alt={l.title} fill sizes="(max-width:1024px) 100vw, 840px"
              className="object-cover" priority unoptimized />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-black/25">Tanpa foto</div>
          )}
          {photos.length > 0 && (
            <button onClick={() => setLightbox(true)} aria-label="Perbesar foto"
              className="absolute bottom-3 right-3 h-9 px-3 rounded-full bg-white/95 text-[12.5px] font-semibold inline-flex items-center gap-1.5 hover:bg-white transition-colors">
              <Maximize2 className="w-3.5 h-3.5" />{photos.length} foto
            </button>
          )}
        </div>
        {photos.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => (
              <button key={p.url + i} onClick={() => setActive(i)}
                className={`relative w-24 h-16 rounded-lg overflow-hidden shrink-0 border-2 transition-colors ${i === active ? "border-black/70" : "border-transparent"}`}>
                <Image src={p.url} alt="" fill sizes="96px" className="object-cover" unoptimized />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-[1200px] px-5 pt-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {l.property_type && <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: accent }}>{l.property_type}</p>}
              <h1 className="mt-1 text-[26px] sm:text-[32px] font-bold tracking-tight leading-tight">{l.title}</h1>
              {(l.location_area || l.city) && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[14px] text-black/55">
                  <MapPin className="w-4 h-4" />{[l.address, l.location_area, l.city].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => toggle(l.slug)} aria-label="Simpan"
                className="grid place-items-center w-10 h-10 rounded-full border border-black/10 bg-white hover:border-black/25 transition-colors">
                <Heart className={`w-4 h-4 ${fav ? "fill-[#E11D48] text-[#E11D48]" : "text-black/50"}`} />
              </button>
              <button onClick={share} aria-label="Bagikan"
                className="grid place-items-center w-10 h-10 rounded-full border border-black/10 bg-white hover:border-black/25 transition-colors">
                <Share2 className="w-4 h-4 text-black/50" />
              </button>
            </div>
          </div>

          <p className="mt-5 text-[30px] font-bold tracking-tight">{rupiah(l.price)}</p>

          {facts.length > 0 && (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {facts.map((f) => (
                <div key={f.label} className="rounded-xl bg-white border border-black/[0.06] px-4 py-3">
                  <f.icon className="w-4 h-4 text-black/35" />
                  <p className="mt-2 text-[15px] font-bold">{f.value}</p>
                  <p className="text-[11.5px] text-black/45">{f.label}</p>
                </div>
              ))}
            </div>
          )}

          {l.description && (
            <div className="mt-8">
              <h2 className="text-[18px] font-bold mb-2">Tentang unit ini</h2>
              <p className="text-[15px] leading-relaxed text-black/70 whitespace-pre-line">{l.description}</p>
            </div>
          )}

          {l.latitude && l.longitude && (
            <div className="mt-8">
              <h2 className="text-[18px] font-bold mb-3">Lokasi</h2>
              <ListingMap lat={l.latitude} lng={l.longitude} title={l.title} />
            </div>
          )}
        </div>

        {/* Sticky contact card: the whole page exists to produce this tap. */}
        <aside className="lg:sticky lg:top-24">
          <div className="rounded-2xl bg-white border border-black/[0.06] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.05)]">
            <p className="text-[13px] text-black/55">Tertarik dengan unit ini?</p>
            <p className="mt-1 text-[15px] font-bold">{data.org.name}</p>
            {data.org.tagline && <p className="mt-0.5 text-[12.5px] text-black/45">{data.org.tagline}</p>}
            <a href={wa} target="_blank" rel="noopener noreferrer"
              className="mt-4 w-full h-12 rounded-xl text-white text-[15px] font-semibold inline-flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}>
              Tanya lewat WhatsApp
            </a>
            <p className="mt-3 text-[11.5px] text-black/40 leading-relaxed">
              Anda akan diarahkan ke WhatsApp dengan detail unit ini agar tim kami bisa langsung membantu.
            </p>
          </div>
        </aside>
      </section>

      {/* Mobile: a persistent bar so the contact action is never scrolled away. */}
      <div className="lg:hidden sticky bottom-0 z-20 border-t border-black/[0.06] bg-white/95 backdrop-blur px-5 py-3 mt-8">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold truncate">{rupiah(l.price)}</p>
            <p className="text-[11.5px] text-black/45 truncate">{l.title}</p>
          </div>
          <a href={wa} target="_blank" rel="noopener noreferrer"
            className="h-11 px-5 rounded-xl text-white text-[14px] font-semibold inline-flex items-center shrink-0"
            style={{ backgroundColor: accent }}>WhatsApp</a>
        </div>
      </div>

      {lightbox && photos[active]?.url && (
        <div className="fixed inset-0 z-50 bg-black/90 grid place-items-center p-4" onClick={() => setLightbox(false)}>
          <button aria-label="Tutup" className="absolute top-4 right-4 text-white/80 hover:text-white"><X className="w-6 h-6" /></button>
          <div className="relative w-full max-w-4xl aspect-[4/3]">
            <Image src={photos[active].url} alt={l.title} fill sizes="100vw" className="object-contain" unoptimized />
          </div>
        </div>
      )}
    </>
  );
}
