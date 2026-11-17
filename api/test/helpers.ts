import { join } from 'node:path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { config } from 'dotenv';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { Role } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

export function useTestDatabase(): void {
  config({ path: join(__dirname, '../../.env'), quiet: true });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.SESSION_SECRET = 'secret-used-only-by-tests';
}

export async function createTestApp() {
  useTestDatabase();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  const sessionStore = configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    close: async () => {
      await app.close();
      await sessionStore.close();
    },
  };
}

export async function clearDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE users, session, rubrics, assignments CASCADE');
}

export async function createUser(prisma: PrismaService, email: string, password: string, role: Role) {
  return prisma.user.create({
    data: { email, passwordHash: await argon2.hash(password), fullName: `Test ${role}`, role },
  });
}
