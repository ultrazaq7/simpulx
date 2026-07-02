"use client";
import { useState } from "react";
import { Inter } from "next/font/google";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./globals.css";
import { cn } from "@/lib/utils";

// Inter: the modern SaaS workhorse (Linear/Vercel/Stripe). Self-hosted + optimized
// by Next, exposed as the --font-sans CSS variable used across the design system.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});


import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/lib/i18n";
import NextTopLoader from "nextjs-toploader";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false } },
  }));

  return (
    <html lang="en" className={cn(inter.variable, "font-sans")}>
      <head>
        <meta charSet="utf-8" />
        <title>Simpulx</title>
        <meta name="description" content="Simpulx - Omnichannel inbox for sales teams. Manage WhatsApp, Instagram, Telegram and more from one place." />
        <meta name="theme-color" content="#2D8B73" />
        <link rel="icon" href="/favicon_squircle.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/simpulx_logo.png" />
        {/* Set the tab title from the path during head parse so reloads don't flash
            a bare "Simpulx" before the app sets the real title. */}
        <script dangerouslySetInnerHTML={{ __html: "try{var m={dashboard:'Dashboard',inbox:'My Inbox',contacts:'Contacts',campaigns:'Campaigns',broadcasts:'Broadcasts',templates:'Message Templates',automation:'Automation',channels:'Channels',integrations:'Web API',settings:'Settings',account:'Account'};var s=location.pathname.split('/')[1];document.title=(m[s]?m[s]+' - ':'')+'Simpulx';}catch(e){}" }} />
        <script src="/lame.min.js"></script>
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <NextTopLoader color="#059669" height={3} showSpinner={false} />
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </I18nProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
