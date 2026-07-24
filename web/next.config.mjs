/** @type {import('next').NextConfig} */
// redeploy: re-trigger CI after the chat-reply web image failed to build/push.
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
