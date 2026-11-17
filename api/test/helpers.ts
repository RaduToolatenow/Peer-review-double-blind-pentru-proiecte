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
  await prisma.$executeRawUnsafe('TRUNCATE users, session, rubrics, classes, assignments CASCADE');
}

export async function createUser(prisma: PrismaService, email: string, password: string, role: Role) {
  return prisma.user.create({
    data: { email, passwordHash: await argon2.hash(password), fullName: `Test ${role}`, role },
  });
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** A rubric draft with one criterion and two levels. */
export async function createRubric(prisma: PrismaService, createdById: string, title = 'Grilă de test') {
  return prisma.rubric.create({
    data: {
      title,
      createdById,
      criteria: {
        create: {
          title: 'Calitatea codului',
          weight: 1,
          position: 1,
          levels: { create: [{ score: 1, descriptor: 'Slab' }, { score: 2, descriptor: 'Bun' }] },
        },
      },
    },
    include: { criteria: { include: { levels: true } } },
  });
}

let teamCounter = 0;

/** A class with the given number of teams, each with a unique join code. */
export async function createClass(prisma: PrismaService, createdById: string, teamCount = 1, name = 'Grupa 231') {
  return prisma.class.create({
    data: {
      name,
      createdById,
      teams: {
        create: Array.from({ length: teamCount }, (_, index) => {
          teamCounter += 1;
          return { name: `Echipa ${index + 1}`, joinCode: `TEST-${teamCounter}` };
        }),
      },
    },
    include: { teams: { orderBy: { name: 'asc' } } },
  });
}

/** Sends a rubric to a class by creating the assignment directly in the database. */
export async function createAssignment(
  prisma: PrismaService,
  createdById: string,
  rubricId: string,
  classId: string,
  reviewDeadline = new Date(Date.now() + 14 * DAY_MS),
) {
  return prisma.assignment.create({
    data: {
      title: 'Tema de test',
      k: 2,
      submissionDeadline: new Date(reviewDeadline.getTime() - 7 * DAY_MS),
      reviewDeadline,
      disputeDeadline: new Date(reviewDeadline.getTime() + 7 * DAY_MS),
      createdById,
      rubricId,
      classId,
    },
  });
}
