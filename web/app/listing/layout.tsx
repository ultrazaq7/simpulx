import type { Metadata, Viewport } from "next";

// The public listing microsites live OUTSIDE the app shell (no sidebar, no auth),
// so they get their own layout. Declaring viewport here guarantees correct
// mobile rendering for these pages no matter what the root layout does, and
// metadataBase makes the relative OG/canonical URLs resolve to absolute ones,
// which is what WhatsApp and search crawlers need when a unit link is shared.

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0E5B54",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://app.simpulx.com"),
};

export default function ListingLayout({ children }: { children: React.ReactNode }) {
  return <div className="font-sans antialiased">{children}</div>;
}
