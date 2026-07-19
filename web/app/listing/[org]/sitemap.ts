import type { MetadataRoute } from "next";
import { fetchIndex } from "@/lib/public-listings";

// Per-org sitemap: /listing/{org}/sitemap.xml. Each client site is indexed on its
// own, so a crawler that finds one tenant never has to crawl the whole platform
// to discover that tenant's units.

export const revalidate = 3600;

export default async function sitemap({ params }: { params: { org: string } }): Promise<MetadataRoute.Sitemap> {
  const org = params.org;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.simpulx.com").replace(/\/$/, "");
  const data = await fetchIndex(org);
  if (!data) return [];
  return [
    { url: `${base}/listing/${org}`, changeFrequency: "daily", priority: 1 },
    ...data.listings.map((l) => ({
      url: `${base}/listing/${org}/${l.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
