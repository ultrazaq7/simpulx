import type { Metadata } from "next";

// Server layout purely for metadata: the page itself is a client component and
// cannot export metadata, and a public page without a <title> looks broken in
// the tab bar and in link previews.
export const metadata: Metadata = {
  title: "Daftar Simpulx - Inbox WhatsApp + AI untuk Tim Sales",
  description:
    "Semua lead WhatsApp kebalas. Satu inbox bersama, AI yang balas duluan dan follow-up, laporan iklan sampai closing. Free trial 7 hari.",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
