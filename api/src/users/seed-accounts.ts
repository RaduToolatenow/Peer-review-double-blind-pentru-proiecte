import { hashPassword } from '../auth/password';
import { PrismaClient } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';

export interface SeedPasswords {
  admin: string;
  professor: string;
  student: string;
}

/** Creates or updates the three test accounts. Safe to run more than once. */
export async function seedAccounts(prisma: PrismaClient, passwords: SeedPasswords): Promise<void> {
  const accounts = [
    { email: 'admin@peer-review.test', fullName: 'Cont test admin', role: Role.ADMIN, password: passwords.admin },
    { email: 'profesor@peer-review.test', fullName: 'Cont test profesor', role: Role.PROFESSOR, password: passwords.professor },
    { email: 'student@peer-review.test', fullName: 'Cont test student', role: Role.STUDENT, password: passwords.student },
  ];

  for (const { password, ...account } of accounts) {
    const passwordHash = await hashPassword(password);
    await prisma.user.upsert({
      where: { email: account.email },
      create: { ...account, passwordHash, emailVerifiedAt: new Date() },
      update: { ...account, passwordHash },
    });
  }
}
