import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse uses fs — ensure it's not bundled for edge runtime
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
