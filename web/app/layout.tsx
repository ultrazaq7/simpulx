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
        {/* NOTE: no static <title> here on purpose. A declarative <title> in this
            "use client" root layout gets re-asserted by React during hydration,
            clobbering the correct title (set by the inline script below) with a
            bare "Simpulx" flash on every refresh. The inline script sets the real
            title during head parse; Shell's effect maintains it across navigation. */}
        <meta name="description" content="Simpulx - Omnichannel inbox for sales teams. Manage WhatsApp, Instagram, Telegram and more from one place." />
        <meta name="theme-color" content="#2D8B73" />
        <link rel="icon" href="/favicon_squircle.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/simpulx_logo.png" />
        {/* Set the tab title from the path during head parse so reloads don't flash
            a bare "Simpulx" before the app sets the real title. */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t={'/dashboard/general-report':'General Report','/dashboard/campaign-performance':'Campaign Performance','/dashboard/creative-insights':'Creative Insights','/dashboard':'General Report','/inbox':'My Inbox','/contacts':'Contacts','/campaigns':'Campaigns','/broadcasts':'Broadcasts','/templates':'Message Templates','/automation':'Automation','/channels':'Channels','/integrations':'Web API','/account':'Account Settings','/settings/general':'General','/settings/custom-fields':'Custom Fields','/settings/people':'Team Members','/settings/roles':'Roles & Permissions','/settings/campaigns':'Campaigns','/settings/templates':'Message Templates','/settings/automation':'Automation','/settings/wa-forms':'WhatsApp Forms','/settings/quick-replies':'Quick Replies','/settings/channels':'Channel','/settings/web-api':'Web API','/settings/ads-analytics':'Ads & Analytics','/settings/organization':'Organization','/settings/audit':'System Logs','/settings/notifications':'Notifications','/settings':'Settings'};var p=location.pathname,best='',ti='';for(var k in t){if(p.indexOf(k)===0&&k.length>best.length){best=k;ti=t[k];}}document.title=(ti?ti+' - ':'')+'Simpulx';}catch(e){}" }} />
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
