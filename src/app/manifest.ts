import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hostello PMS",
    short_name: "Hostello",
    description: "Property management for Hostello's co-hosting portfolio",
    // The installed app opens on /login: it sends anyone already signed in on to
    // /, which routes admins to /admin and owners to /client. ("/" itself is the
    // public landing page for a signed-out visitor.) The id is the app's identity,
    // independent of the launch URL.
    id: "/",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07060c",
    theme_color: "#07060c",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
