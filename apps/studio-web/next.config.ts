import type { NextConfig } from "next";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

// .env.local etc. live at the monorepo root, not in this app's own directory — Next.js
// only auto-loads env files from its own directory by default, so load the root's
// explicitly. This mutates process.env once at server startup; every subsequent
// request handler in this process sees the values via the normal process.env global.
loadEnvConfig(path.resolve(__dirname, "../.."));

const nextConfig: NextConfig = {
  // Vercel packages the Next.js output itself; standalone is for our Docker image.
  output: process.env.VERCEL ? undefined : "standalone",
  turbopack: { root: path.resolve(__dirname, "../..") },
  transpilePackages: ["@vowhumans/commercial-core", "@vowhumans/persona-schema"],
  // pdf-parse in particular has a known bundler-import gotcha (a debug harness in its
  // own index.js that misfires under tree-shaking) — keep these as plain Node externals.
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse", "mammoth", "exceljs"],
  // pdf-parse loads the PDF.js worker dynamically at runtime, which prevents Next's
  // output tracer from discovering it. Keep the worker and canvas runtime beside the
  // embed-session function so lesson PDFs can be extracted on Vercel.
  outputFileTracingIncludes: {
    "/api/public/v1/embed-sessions": [
      "../../node_modules/pdfjs-dist/legacy/build/**/*",
      "../../node_modules/@napi-rs/canvas/**/*",
      "../../node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
    ],
  },
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
      {
        // /embed is the one path meant to be iframed by arbitrary partner sites
        // (PlugConnect, GoalVow Academies, etc). Next.js applies headers from every
        // matching block and, when two blocks set the same key, the more specific
        // source's value wins — so only Content-Security-Policy needs restating
        // here. It's still paired with X-Frame-Options: SAMEORIGIN from the block
        // above, but every evergreen browser gives frame-ancestors precedence over
        // X-Frame-Options when both are present, so that stale SAMEORIGIN is
        // harmlessly ignored rather than needing to be unset. Wide open to any
        // origin for now (Milestone 4 will narrow this to each application's
        // registered embed origin).
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: `default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://api.vowhumans.com wss://*.livekit.cloud; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; font-src 'self' data:; frame-ancestors *; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests` },
        ],
      },
    ];
  },
};

export default nextConfig;
