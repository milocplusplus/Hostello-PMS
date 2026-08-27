import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Token receipts are uploaded through a Server Action; the 1 MB default
    // rejects an ordinary phone screenshot.
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [
      {
        // Android only offers to install a download it recognises as a package,
        // and static hosting would otherwise serve this as octet-stream.
        source: "/app/hostello.apk",
        headers: [
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          { key: "Content-Disposition", value: 'attachment; filename="hostello.apk"' },
        ],
      },
      {
        // Chrome fetches this to verify the app owns the domain; without the
        // JSON type it ignores the file and the app keeps its address bar.
        source: "/.well-known/assetlinks.json",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

export default nextConfig;
