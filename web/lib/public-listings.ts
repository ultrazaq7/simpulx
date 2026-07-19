// Server-side data access for the public per-client listing site.
//
// These pages are unauthenticated and indexable, so they fetch on the SERVER
// (never through lib/api.ts, which attaches a JWT and runs in the browser).
// INTERNAL_API_URL lets the container talk to the gateway over the private
// network; it falls back to the public URL for local dev.

export type ListingPhoto = { url: string; name?: string };

export type PublicListing = {
  id: string;
  slug: string;
  title: string;
  property_type: string | null;
  price: number | null;
  location_area: string | null;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  land_area: number | null;
  building_area: number | null;
  certificate: string | null;
  description: string | null;
  photos: ListingPhoto[];
};

// Branding makes each client's microsite look like THEIR site (own logo, colour
// and tagline), set in Settings > Listing Properti and stored on the org.
export type PublicOrg = {
  name: string; slug: string; whatsapp: string;
  logo?: string; accent?: string; tagline?: string;
};

export type ListingIndex = {
  org: PublicOrg;
  listings: PublicListing[];
  facets: { types: string[]; cities: string[] };
};

export type ListingDetail = {
  org: PublicOrg;
  listing: PublicListing;
  related: PublicListing[];
};

function apiBase(): string {
  return (
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8080"
  ).replace(/\/$/, "");
}

// Published inventory changes rarely; revalidate keeps the site fast and cheap
// (it also caps how often public traffic can hit the gateway).
const REVALIDATE = 60;

export async function fetchIndex(org: string, search?: Record<string, string>): Promise<ListingIndex | null> {
  const qs = new URLSearchParams(search ?? {}).toString();
  const url = `${apiBase()}/api/public/listings/${encodeURIComponent(org)}${qs ? `?${qs}` : ""}`;
  try {
    const r = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!r.ok) return null;
    return (await r.json()) as ListingIndex;
  } catch {
    return null;
  }
}

export async function fetchListing(org: string, slug: string): Promise<ListingDetail | null> {
  const url = `${apiBase()}/api/public/listings/${encodeURIComponent(org)}/${encodeURIComponent(slug)}`;
  try {
    const r = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!r.ok) return null;
    return (await r.json()) as ListingDetail;
  } catch {
    return null;
  }
}

// "Rp 1,25 M" / "Rp 850 juta" — how prices are actually spoken in Indonesian
// property listings; full digits are unreadable at a glance in a card grid.
export function rupiah(n: number | null | undefined): string {
  if (n == null || n <= 0) return "Harga sesuai permintaan";
  if (n >= 1_000_000_000) {
    const v = (n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
    return `Rp ${v} M`;
  }
  return `Rp ${Math.round(n / 1_000_000).toLocaleString("id-ID")} juta`;
}

export function specLine(l: PublicListing): string {
  const bits: string[] = [];
  if (l.bedrooms) bits.push(`${l.bedrooms} KT`);
  if (l.bathrooms) bits.push(`${l.bathrooms} KM`);
  if (l.land_area) bits.push(`LT ${l.land_area} m²`);
  if (l.building_area) bits.push(`LB ${l.building_area} m²`);
  return bits.join(" · ");
}

// wa.me deep link: the visitor taps, WhatsApp opens with the unit already named,
// and once they hit send it lands in the inbox as a normal lead the AI picks up.
// That is why there is no separate lead form: the conversation IS the conversion.
export function waLink(org: PublicOrg, listing?: PublicListing, pageUrl?: string): string {
  const phone = (org.whatsapp || "").replace(/[^\d]/g, "");
  const lines = listing
    ? [`Halo ${org.name}, saya tertarik dengan unit "${listing.title}".`,
       listing.price ? `Harga: ${rupiah(listing.price)}` : "",
       pageUrl ? `Link: ${pageUrl}` : "",
       "Boleh minta info lebih lengkap?"]
    : [`Halo ${org.name}, saya sedang mencari properti. Boleh dibantu?`];
  const text = encodeURIComponent(lines.filter(Boolean).join("\n"));
  return phone ? `https://wa.me/${phone}?text=${text}` : "#";
}
