import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Enable Web Workers
    config.output.globalObject = "globalThis";
    return config;
  },
  experimental: {
    // Enable server actions for AI endpoint
    serverActions: { allowedOrigins: ["localhost:3000", "localhost:3001", "localhost:3002"] },
  },
};

export default nextConfig;
