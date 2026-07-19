import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchIndex } from "@/lib/public-listings";
import ListingBrowser from "./ListingBrowser";

// Public, indexable listing site for one client organisation.
// Server-rendered so the inventory is in the HTML for crawlers and the first
// paint carries real content; filtering then happens client-side.

type Props = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await params;
  const data = await fetchIndex(org);
  if (!data) return { title: "Listing tidak ditemukan" };
  const count = data.listings.length;
  const cities = data.facets.cities.slice(0, 4).join(", ");
  const title = `Properti Dijual ${cities ? `di ${cities} ` : ""}| ${data.org.name}`;
  const description = count
    ? `${count} pilihan properti dari ${data.org.name}${cities ? ` di ${cities}` : ""}. Lihat harga, luas tanah dan bangunan, foto, lalu hubungi kami langsung lewat WhatsApp.`
    : `Katalog properti ${data.org.name}.`;
  return {
    title,
    description,
    openGraph: {
      title, description, type: "website",
      images: data.listings.find((l) => l.photos?.[0]?.url)?.photos[0].url
        ? [{ url: data.listings.find((l) => l.photos?.[0]?.url)!.photos[0].url }]
        : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function OrgListingPage({ params }: Props) {
  const { org } = await params;
  const data = await fetchIndex(org);
  if (!data) notFound();
  const accent = data.org.accent || "#0E5B54";

  return (
    <main className="min-h-screen bg-[#FAFAF8] text-[#12211F]">
      <header className="border-b border-black/[0.06] bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-[1440px] px-5 py-4 flex items-center justify-between gap-4">
          {/* The client's logo is the site's identity, so it is sized to lead the
              header rather than sit as a favicon next to the name. */}
          <div className="min-w-0 flex items-center gap-3.5">
            {data.org.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.org.logo} alt={data.org.name}
                className="h-11 sm:h-14 w-auto max-w-[200px] object-contain shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-[16px] sm:text-[18px] font-bold tracking-tight truncate">{data.org.name}</p>
              <p className="text-[12px] sm:text-[13px] text-black/50 truncate">{data.org.tagline || "Katalog properti"}</p>
            </div>
          </div>
          {data.org.whatsapp && (
            <a href={`https://wa.me/${data.org.whatsapp.replace(/[^\d]/g, "")}`}
              target="_blank" rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-2 h-9 px-4 rounded-full text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
              style={{ backgroundColor: accent }}>
              Hubungi Kami
            </a>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] px-5 pt-10 pb-6">
        <h1 className="text-[28px] sm:text-[36px] font-bold tracking-tight leading-[1.15] max-w-2xl">
          Temukan properti yang pas untuk Anda
        </h1>
        <p className="mt-3 text-[15px] text-black/60 max-w-xl">
          {data.listings.length} unit tersedia. Saring sesuai kebutuhan, lalu hubungi kami
          langsung lewat WhatsApp untuk info lengkap dan jadwal survei.
        </p>
      </section>

      <ListingBrowser data={data} />

      <footer className="mt-16 border-t border-black/[0.06] py-8">
        <div className="mx-auto max-w-[1440px] px-5 text-[12px] text-black/40">
          &copy; {new Date().getFullYear()} {data.org.name}
        </div>
      </footer>
    </main>
  );
}
