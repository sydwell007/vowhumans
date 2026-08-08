import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VowHumans — AI Digital Workforce",
    short_name: "VowHumans",
    description: "Build, deploy and govern a disclosed AI digital workforce.",
    start_url: "/",
    display: "standalone",
    background_color: "#050816",
    theme_color: "#050816",
    icons: [
      { src: "/brand/vowhumans-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/vowhumans-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
