import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.slack-edge.com" },
      { protocol: "https", hostname: "avatars.slack-edge.com" },
    ],
    unoptimized: true,
  },
  serverExternalPackages: ["bun:sqlite"],
};

export default nextConfig;
