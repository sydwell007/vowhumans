import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: { root: path.resolve(__dirname, "../..") },
  transpilePackages: ["@vowhumans/commercial-core", "@vowhumans/persona-schema"],
  poweredByHeader: false,
  async redirects() {
    return ["dashboard","personas","knowledge","voices","faces","gesture-profiles","live-sessions","presenter-studio","applications","usage","identity-consent","api-keys","safety","audit-logs","settings"].map((section) => ({ source: `/${section}`, destination: `/studio/${section}`, permanent: false }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: `default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://api.vowhumans.com wss://*.livekit.cloud; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; font-src 'self' data:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests` },
        ],
      },
    ];
  },
};

export default nextConfig;
