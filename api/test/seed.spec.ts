import * as argon2 from 'argon2';
import { seedAccounts } from '../src/users/seed-accounts';
import { clearDatabase, createTestApp } from './helpers';

describe('seeded accounts', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
    await clearDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('stores passwords only as argon2id hashes', async () => {
    const passwords = { admin: 'parola-admin-test', professor: 'parola-prof-test', student: 'parola-student-test' };

    await seedAccounts(ctx.prisma, passwords);

    const users = await ctx.prisma.user.findMany();
    expect(users).toHaveLength(3);
    for (const user of users) {
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(Object.values(passwords)).not.toContain(user.passwordHash);
    }
    const student = users.find((user) => user.role === 'STUDENT');
    expect(await argon2.verify(student!.passwordHash, passwords.student)).toBe(true);
  });
});
