import request from 'supertest';
import * as password from '../src/auth/password';
import { Role } from '../src/generated/prisma/enums';
import { clearDatabase, createTestApp, createUser } from './helpers';

const PASSWORD = 'o-parola-de-test-lunga';
const STUDENT = 'student@test.example';
const ADMIN = 'admin@test.example';
const BAD_CREDENTIALS = 'Email sau parolă greșite.';

describe('authentication', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const http = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.prisma);
    await createUser(ctx.prisma, STUDENT, PASSWORD, Role.STUDENT);
    await createUser(ctx.prisma, ADMIN, PASSWORD, Role.ADMIN);
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function loggedInAs(email: string) {
    const agent = request.agent(http());
    await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    return agent;
  }

  it('logs in with an httpOnly cookie and never returns the hash', async () => {
    const res = await request(http()).post('/api/auth/login').send({ email: STUDENT, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: STUDENT, role: 'STUDENT' });
    expect(res.body).not.toHaveProperty('passwordHash');
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('sid=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(http()).post('/api/auth/login').send({ email: STUDENT, password: 'gresita' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(BAD_CREDENTIALS);
  });

  it('answers an unknown email exactly like a wrong password', async () => {
    const res = await request(http()).post('/api/auth/login').send({ email: 'nimeni@test.example', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(BAD_CREDENTIALS);
  });

  it('rejects an invalid body with 400 and a useful message', async () => {
    const res = await request(http()).post('/api/auth/login').send({ email: 'nu-e-email' });

    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.arrayContaining(['Introdu o adresă de email validă.', 'Introdu parola.']));
  });

  it('rejects SQL injection attempts without a server error', async () => {
    const inEmail = await request(http()).post('/api/auth/login').send({ email: "' OR 1=1 --", password: PASSWORD });
    const inPassword = await request(http()).post('/api/auth/login').send({ email: STUDENT, password: "' OR '1'='1" });

    expect(inEmail.status).toBe(400);
    expect(inPassword.status).toBe(401);
    expect(await ctx.prisma.user.count()).toBe(2);
  });

  describe('attempt limit (D-017)', () => {
    const TOO_MANY = /^Prea multe încercări nereușite\. Încearcă din nou peste \d+ minute\.$/;
    const login = (email: string, password: string) =>
      request(http()).post('/api/auth/login').send({ email, password });

    async function failTimes(email: string, times: number) {
      for (let i = 0; i < times; i += 1) {
        await login(email, 'gresita').expect(401);
      }
    }

    /** Inserts failures directly, as if they happened the given minutes ago. */
    async function insertFailures(email: string, ip: string, count: number, minutesAgo = 0) {
      const createdAt = new Date(Date.now() - minutesAgo * 60 * 1000);
      await ctx.prisma.loginFailure.createMany({
        data: Array.from({ length: count }, () => ({ email, ip, createdAt })),
      });
    }

    /** The IP the server records for supertest requests. */
    async function testIp() {
      await login('ip-probe@test.example', 'gresita').expect(401);
      const row = await ctx.prisma.loginFailure.findFirstOrThrow({ where: { email: 'ip-probe@test.example' } });
      await ctx.prisma.loginFailure.deleteMany({ where: { email: 'ip-probe@test.example' } });
      return row.ip;
    }

    it('answers 429 after 5 wrong passwords', async () => {
      await failTimes(STUDENT, 5);

      const res = await login(STUDENT, 'gresita');

      expect(res.status).toBe(429);
      expect(res.body.message).toMatch(TOO_MANY);
    });

    it('refuses even the correct password while blocked', async () => {
      await failTimes(STUDENT, 5);

      await login(STUDENT, PASSWORD).expect(429);
    });

    it('blocks an unknown email the same way, so it does not reveal which emails exist', async () => {
      await failTimes('nimeni@test.example', 5);

      const res = await login('nimeni@test.example', 'gresita');

      expect(res.status).toBe(429);
      expect(res.body.message).toMatch(TOO_MANY);
    });

    it('resets the count after a successful login', async () => {
      await failTimes(STUDENT, 4);
      await login(STUDENT, PASSWORD).expect(200);

      await failTimes(STUDENT, 4);
      await login(STUDENT, PASSWORD).expect(200);
    });

    it('ends the block 15 minutes after the latest failure', async () => {
      await insertFailures(STUDENT, await testIp(), 5, 16);

      await login(STUDENT, PASSWORD).expect(200);
    });

    it('blocks any email from an IP with 50 failures', async () => {
      await insertFailures('altcineva@test.example', await testIp(), 50);

      const res = await login(ADMIN, PASSWORD);

      expect(res.status).toBe(429);
      expect(res.body.message).toMatch(TOO_MANY);
    });

    it('runs the password check for an unknown email too, so the time is the same', async () => {
      const verify = jest.spyOn(password, 'verifyPassword');
      try {
        await login('nimeni@test.example', PASSWORD).expect(401);

        expect(verify).toHaveBeenCalledTimes(1);
      } finally {
        verify.mockRestore();
      }
    });
  });

  it('answers 401 on /me without a session', async () => {
    await request(http()).get('/api/auth/me').expect(401);
  });

  it('returns the user and role on /me with a session', async () => {
    const agent = await loggedInAs(STUDENT);

    const res = await agent.get('/api/auth/me').expect(200);

    expect(res.body).toMatchObject({ email: STUDENT, role: 'STUDENT' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('invalidates the session on logout, even for the old cookie', async () => {
    const login = await request(http()).post('/api/auth/login').send({ email: STUDENT, password: PASSWORD }).expect(200);
    const oldCookie = login.headers['set-cookie'];

    await request(http()).post('/api/auth/logout').set('Cookie', oldCookie).expect(204);

    await request(http()).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
  });

  it('forbids a student from listing users', async () => {
    const agent = await loggedInAs(STUDENT);

    await agent.get('/api/users').expect(403);
  });

  it('lets an admin list staff without hashes, and count students only (D-014)', async () => {
    const agent = await loggedInAs(ADMIN);

    const res = await agent.get('/api/users').expect(200);

    expect(res.body.staff).toHaveLength(1);
    expect(res.body.studentCount).toBe(1);
    for (const user of res.body.staff) {
      expect(user).not.toHaveProperty('passwordHash');
    }
  });
});
