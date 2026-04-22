import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim())
    : [],
  reactCompiler: true,
  output: "standalone",
  serverExternalPackages: [
    "isomorphic-dompurify",
    "jsdom",
    "mariadb",
    "@prisma/client",
    "@prisma/adapter-mariadb",
    "nodemailer",
  ],
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
