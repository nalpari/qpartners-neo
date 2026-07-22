import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const REQUIRED_DB_ENVS = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function requireEnvInt(name: string): number {
  const raw = requireEnv(name);
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`Env var ${name} must be a positive integer, got: "${raw}"`);
  }
  return num;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaMariaDb({
    host: requireEnv("DB_HOST"),
    port: requireEnvInt("DB_PORT"),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
    // 클라이언트 단 쿼리 타임아웃 30초 — runaway 쿼리로 인한 커넥션 풀 고갈 방어
    queryTimeout: 30_000,
  });
  return new PrismaClient({ adapter });
}

// 모듈 로드 시점(next build의 page data 수집 포함)에 클라이언트를 즉시 생성하면
// DB 환경변수가 없는 빌드 환경에서 실패한다. 첫 쿼리 시점까지 생성을 지연한다.
function createLazyPrismaProxy(): PrismaClient {
  const missing = REQUIRED_DB_ENVS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.warn(
      `[prisma] DB 환경변수 미설정 — 첫 쿼리 시점까지 클라이언트 생성 지연: ${missing.join(", ")}`,
    );
  }

  let instance: PrismaClient | undefined;
  const getInstance = (): PrismaClient => {
    if (!instance) {
      instance = createPrismaClient();
      if (process.env.NODE_ENV !== "production") {
        globalForPrisma.prisma = instance;
      }
    }
    return instance;
  };

  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      const client = getInstance();
      const value = Reflect.get(client, prop);
      return typeof value === "function" ? value.bind(client) : value;
    },
    set(_target, prop, value) {
      return Reflect.set(getInstance(), prop, value);
    },
    has(_target, prop) {
      return Reflect.has(getInstance(), prop);
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createLazyPrismaProxy();
