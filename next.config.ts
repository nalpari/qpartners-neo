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
    // 콘텐츠 첨부 합계 정책 50MB + multipart boundary/헤더 오버헤드 여유.
    // 기본값 10MB 로는 단일 50MB upload 가 잘려 multipart 파싱 실패(400) 발생.
    proxyClientMaxBodySize: "60mb",
  },
};

export default nextConfig;
