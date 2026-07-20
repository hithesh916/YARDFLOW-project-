// Single shared PrismaClient. In dev, Next.js hot-reload would otherwise create
// a new client on every reload and exhaust DB connections, so we cache it on the
// global object. In production (Vercel) this module is loaded per serverless
// instance; keep DATABASE_URL's connection_limit low so we don't exhaust the
// cPanel MySQL per-user connection cap.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
