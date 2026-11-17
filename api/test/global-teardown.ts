import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Empties the test database after the run. Migrations stop when a table they reshape has
 * rows, so leftover test rows would block the next migration on the test database.
 */
export default async function globalTeardown(): Promise<void> {
  config({ path: join(__dirname, '../../.env'), quiet: true });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) });
  try {
    await prisma.$executeRawUnsafe('TRUNCATE users, session, rubrics, classes, assignments CASCADE');
  } finally {
    await prisma.$disconnect();
  }
}
