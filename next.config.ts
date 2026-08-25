import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Token receipts are uploaded through a Server Action; the 1 MB default
    // rejects an ordinary phone screenshot.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
