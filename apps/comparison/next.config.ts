import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  serverExternalPackages: ["playwright", "sharp", "@modelcontextprotocol/sdk", "ajv"],
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  devIndicators: false,
  // OAuth callback codes and signed resource URLs must not reach development logs.
  logging: false,
};
export default config;
