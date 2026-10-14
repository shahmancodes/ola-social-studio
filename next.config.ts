import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "sharp"],
  devIndicators: false,
};

export default nextConfig;
