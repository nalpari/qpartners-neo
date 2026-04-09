import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["dev.q-partners.q-cells.jp", "121.168.9.37:8080"],
  reactCompiler: true,
  output: "standalone",
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
