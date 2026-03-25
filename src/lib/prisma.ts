import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

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
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
