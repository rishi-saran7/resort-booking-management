import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained build under .next/standalone — required for Docker
  output: "standalone",
};

export default nextConfig;
