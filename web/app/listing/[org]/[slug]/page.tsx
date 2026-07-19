import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchListing, rupiah, specLine } from "@/lib/public-listings";
import ListingDetailView from "./ListingDetailView";

// Public unit page: the one URL the AI shares in chat and the visitor shares on
// WhatsApp, so it carries full OG metadata and structured data for search.

type Props = { params: Promise<{ org: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org, slug } = await params;
  const data = await fetchListing(org, slug);
  if (!data) return { title: "Unit tidak ditemukan" };
  const l = data.listing;
  const where = [l.location_area, l.city].filter(Boolean).join(", ");
  const title = `${l.title}${where ? ` - ${where}` : ""} | ${data.org.name}`;
  const description = [
    l.property_type ?? "Properti", where ? `di ${where}` : "",
    rupiah(l.price), specLine(l),
  ].filter(Boolean).join(" · ").slice(0, 300);
  const cover = l.photos?.[0]?.url;
  return {
    title, description,
    openGraph: {
      title, description, type: "article",
      images: cover ? [{ url: cover, width: 1200, height: 900, alt: l.title }] : undefined,
    },
    twitter: { card: cover ? "summary_large_image" : "summary", title, description, images: cover ? [cover] : undefined },
    robots: { index: true, follow: true },
  };
}

export default async function ListingDetailPage({ params }: Props) {
  const { org, slug } = await params;
  const data = await fetchListing(org, slug);
  if (!data) notFound();
  const l = data.listing;

  // schema.org so the unit can surface as a rich result.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Residence",
    name: l.title,
    description: l.description ?? undefined,
    image: (l.photos ?? []).map((p) => p.url).slice(0, 6),
    address: {
      "@type": "PostalAddress",
      streetAddress: l.address ?? undefined,
      addressLocality: l.city ?? undefined,
      addressCountry: "ID",
    },
    ...(l.latitude && l.longitude
      ? { geo: { "@type": "GeoCoordinates", latitude: l.latitude, longitude: l.longitude } }
      : {}),
    ...(l.price ? { offers: { "@type": "Offer", price: l.price, priceCurrency: "IDR", availability: "https://schema.org/InStock" } } : {}),
    ...(l.building_area ? { floorSize: { "@type": "QuantitativeValue", value: l.building_area, unitCode: "MTK" } } : {}),
    ...(l.bedrooms ? { numberOfRooms: l.bedrooms } : {}),
  };

  return (
    <main className="min-h-screen bg-[#FAFAF8] text-[#12211F]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="border-b border-black/[0.06] bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-[1200px] px-5 py-4 flex items-center justify-between gap-4">
          <Link href={`/listing/${org}`} className="text-[13px] font-semibold text-black/60 hover:text-black transition-colors">
            &larr; Semua unit
          </Link>
          <p className="text-[14px] font-bold truncate">{data.org.name}</p>
        </div>
      </header>

      <ListingDetailView data={data} orgSlug={org} />

      {data.related.length > 0 && (
        <section className="mx-auto max-w-[1200px] px-5 pb-16">
          <h2 className="text-[18px] font-bold mb-4">Unit lain yang mungkin cocok</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {data.related.map((r) => (
              <Link key={r.id} href={`/listing/${org}/${r.slug}`}
                className="rounded-xl bg-white border border-black/[0.06] overflow-hidden hover:shadow-md transition-shadow">
                <div className="aspect-[4/3] bg-black/[0.04] relative">
                  {r.photos?.[0]?.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photos[0].url} alt={r.title} className="absolute inset-0 w-full h-full object-cover" />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-[15px] font-bold">{rupiah(r.price)}</p>
                  <p className="text-[13px] font-semibold line-clamp-1">{r.title}</p>
                  <p className="text-[12px] text-black/50 mt-0.5">{[r.location_area, r.city].filter(Boolean).join(", ")}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
