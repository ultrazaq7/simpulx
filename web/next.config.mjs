/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // lean production image (server.js + minimal deps)
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
