"use client";
import { useState } from "react";
import { MapPin, ExternalLink } from "lucide-react";

// Google Maps costs money PER MAP LOAD, and most visitors never scroll to the map
// at all. So nothing is requested until the visitor asks for it: until then this
// renders a static placeholder. One tap swaps in the embed (a single load), and
// "Buka di Google Maps" leaves for the app without costing a load at all.
//
// `apiKey` is passed in from the server page (which reads process.env.MAPS_KEY at
// request time) rather than a NEXT_PUBLIC build-time var, so the key can be set in
// the server .env without a rebuild. Empty key -> the "open in Maps" fallback.

export default function ListingMap({ lat, lng, title, apiKey }: { lat: number; lng: number; title: string; apiKey?: string }) {
  const [shown, setShown] = useState(false);
  const key = apiKey;
  const external = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  if (shown && key) {
    return (
      <div className="space-y-2">
        <div className="rounded-2xl overflow-hidden border border-black/[0.06] aspect-[16/9] bg-black/[0.04]">
          <iframe
            title={`Peta lokasi ${title}`}
            src={`https://www.google.com/maps/embed/v1/place?key=${key}&q=${lat},${lng}&zoom=16`}
            className="w-full h-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen />
        </div>
        <a href={external} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-black/60 hover:text-black transition-colors">
          Buka di Google Maps <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
      <div className="aspect-[16/9] relative grid place-items-center bg-[repeating-linear-gradient(45deg,#F3F4F1_0px,#F3F4F1_12px,#EDEEEA_12px,#EDEEEA_24px)]">
        <div className="text-center px-6">
          <MapPin className="w-6 h-6 mx-auto text-black/30" />
          <p className="mt-2 text-[13.5px] font-semibold text-black/70">Lihat lokasi di peta</p>
          <p className="text-[12px] text-black/45 mt-0.5">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            {key && (
              <button onClick={() => setShown(true)}
                className="h-9 px-4 rounded-full bg-[#12211F] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity">
                Tampilkan peta
              </button>
            )}
            <a href={external} target="_blank" rel="noopener noreferrer"
              className="h-9 px-4 rounded-full border border-black/15 bg-white text-[13px] font-semibold inline-flex items-center gap-1.5 hover:border-black/30 transition-colors">
              Google Maps <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
