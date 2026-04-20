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
  // instrumentation.ts 는 runtime=nodejs 에서만 실제 실행되지만 webpack 은 Edge 빌드에도
  // 번들링 시도 → auto-retry-batch 체인(prisma/mariadb/nodemailer) 이 resolve 실패.
  // Edge 빌드에서 해당 체인을 IgnorePlugin 으로 배제 (런타임 가드가 실행 자체를 막음).
  webpack: (config, { nextRuntime, webpack }) => {
    if (nextRuntime === "edge") {
      config.plugins = config.plugins ?? [];
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^@\/lib\/mass-mail\/auto-retry-batch$/,
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
