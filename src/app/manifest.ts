import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hostello PMS",
    short_name: "Hostello",
    description: "Property management for Hostello's co-hosting portfolio",
    // "/" reads the session and sends admins to /admin, owners to /client,
    // so the installed app lands on the right home screen for whoever signed in.
    // A stable identity for the installed app, independent of the launch URL.
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0910",
    theme_color: "#0a0910",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
