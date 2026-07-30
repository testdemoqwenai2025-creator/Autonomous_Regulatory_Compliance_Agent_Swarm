import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Force recreate if the cached instance is missing models
// (happens after schema changes in development)
let _db = globalForPrisma.prisma;
if (!_db || !(_db as Record<string, unknown>).correlatedTrace) {
  _db = new PrismaClient({
    log: ['query'],
  })
  globalForPrisma.prisma = _db
}

export const db = _db
