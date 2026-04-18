// Prisma client singleton - prevents multiple instances in Next.js dev hot-reload

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaDatasourceUrl: string | undefined;
};

const DEFAULT_SQLITE_URL = "file:./prisma/dev.db";

function getDatasourceUrl() {
  const configured = process.env.DATABASE_URL?.trim();

  if (!configured) {
    return DEFAULT_SQLITE_URL;
  }

  // PostgreSQL / Supabase — use as-is (schema.prisma provider must be "postgresql")
  if (configured.startsWith("postgresql://") || configured.startsWith("postgres://")) {
    return configured;
  }

  // SQLite file path — use as-is
  if (configured.startsWith("file:")) {
    return configured;
  }

  // Unrecognised format — fall back to default SQLite
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[prisma] Unrecognised DATABASE_URL format "${configured}". Falling back to ${DEFAULT_SQLITE_URL}.`
    );
  }
  return DEFAULT_SQLITE_URL;
}

const datasourceUrl = getDatasourceUrl();

const shouldReuseClient =
  globalForPrisma.prisma && globalForPrisma.prismaDatasourceUrl === datasourceUrl;

export const prisma: PrismaClient =
  shouldReuseClient
    ? (globalForPrisma.prisma as PrismaClient)
    : new PrismaClient({
        datasources: {
          db: { url: datasourceUrl },
        },
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaDatasourceUrl = datasourceUrl;
}
