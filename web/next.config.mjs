/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // lean production image (server.js + minimal deps)
};
export default nextConfig;
