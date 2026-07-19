"use client";
import { useState } from "react";
import { MapPin, ExternalLink } from "lucide-react";

// Google Maps EMBED API is free and unlimited (unlike the JS/Static APIs that bill
// per load), so the placeholder is the REAL map, blurred, with the actions over it
// -- a proper snapshot instead of a hatch pattern. "Tampilkan peta" un-blurs and
// makes it interactive; "Google Maps" opens the app. `apiKey` comes from the
// server page (process.env.MAPS_KEY), so it is set in the server .env with no
// rebuild; without a key we degrade to a plain "open in Maps" card.

export default function ListingMap({ lat, lng, title, apiKey }: { lat: number; lng: number; title: string; apiKey?: string }) {
  const [shown, setShown] = useState(false);
  const external = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  if (!apiKey) {
    return (
      <a href={external} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-between gap-3 rounded-2xl border border-black/[0.06] bg-white px-5 py-4 hover:border-black/20 transition-colors">
        <span className="inline-flex items-center gap-2 text-[14px] font-semibold"><MapPin className="w-4 h-4 text-black/40" />Lihat lokasi di Google Maps</span>
        <ExternalLink className="w-4 h-4 text-black/40" />
      </a>
    );
  }

  const src = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${lat},${lng}&zoom=16`;

  return (
    <div className="space-y-2">
      <div className="relative rounded-2xl overflow-hidden border border-black/[0.06] aspect-[16/9] bg-black/[0.04]">
        <iframe
          title={`Peta lokasi ${title}`}
          src={src}
          className="w-full h-full transition-[filter] duration-500"
          style={{ filter: shown ? "none" : "blur(7px)", pointerEvents: shown ? "auto" : "none" }}
          loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        {!shown && (
          <div className="absolute inset-0 grid place-items-center bg-white/5">
            <div className="text-center">
              <p className="text-[12.5px] font-semibold text-black/70 mb-2.5 drop-shadow-sm">Perkiraan lokasi</p>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setShown(true)}
                  className="h-10 px-5 rounded-full bg-[#12211F] text-white text-[13.5px] font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.18)] hover:opacity-90 transition-opacity">
                  Tampilkan peta
                </button>
                <a href={external} target="_blank" rel="noopener noreferrer"
                  className="h-10 px-4 rounded-full border border-black/15 bg-white text-[13.5px] font-semibold inline-flex items-center gap-1.5 shadow-sm hover:border-black/30 transition-colors">
                  Google Maps <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
      {shown && (
        <a href={external} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-black/60 hover:text-black transition-colors">
          Buka di Google Maps <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}
