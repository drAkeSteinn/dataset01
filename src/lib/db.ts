import { PrismaClient } from '@prisma/client'
import { ensureDatabaseReady } from '@/lib/db-init'

/**
 * Initialize the database before creating PrismaClient.
 * This ensures:
 * - The db/ directory exists
 * - The database file exists (creates it if not)
 * - The schema is applied
 *
 * This fixes "Error code 14: Unable to open the database file" on fresh installs.
 */
ensureDatabaseReady()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
