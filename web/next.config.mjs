/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // lean production image (server.js + minimal deps)
  // puppeteer must NOT be webpack-bundled (dynamic requires + a browser binary);
  // keep it external so the standalone server can require it at runtime. It drives
  // the headless PDF routes (/api/ads-report/pdf, /api/campaigns/[id]/report-pdf).
  experimental: {
    serverComponentsExternalPackages: ["puppeteer"],
  },
  // Cache the brand/static assets so the logo, favicon, and splash don't refetch
  // on every page load (they change rarely; a week keeps them fresh enough).
  // Public sales demo: a self-contained static deck at /public/demo.html served
  // on the clean /demo path. It carries its own <head> and styles, so it renders
  // outside the app shell (no auth, no providers).
  async rewrites() {
    return [{ source: "/demo", destination: "/demo.html" }];
  },
  async headers() {
    const oneWeek = "public, max-age=604800, stale-while-revalidate=86400";
    const assets = [
      "/simpulx_logo.png",
      "/splash_logo.png",
      "/favicon.png",
      "/favicon.svg",
      "/favicon_squircle.svg",
    ];
    return assets.map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: oneWeek }],
    }));
  },
};
export default nextConfig;
