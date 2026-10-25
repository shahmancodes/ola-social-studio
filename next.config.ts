import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { agentUpgrade: "security" },
  serverExternalPackages: ["playwright", "sharp"],
  devIndicators: false,
};

export default nextConfig;
