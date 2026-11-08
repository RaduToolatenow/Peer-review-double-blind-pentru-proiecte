import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { requireEnv } from '../src/env';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedAccounts } from '../src/users/seed-accounts';

config({ path: join(__dirname, '../../.env'), quiet: true });

async function main(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }) });
  try {
    await seedAccounts(prisma, {
      admin: requireEnv('SEED_ADMIN_PASSWORD'),
      professor: requireEnv('SEED_PROFESSOR_PASSWORD'),
      student: requireEnv('SEED_STUDENT_PASSWORD'),
    });
    console.log('Seeded 3 test accounts.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
