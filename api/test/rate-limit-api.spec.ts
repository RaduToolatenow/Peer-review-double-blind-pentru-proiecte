import request from 'supertest';
import { Role } from '../src/generated/prisma/enums';
import { clearDatabase, createTestApp, signedIn } from './helpers';

const TOO_MANY = 'Prea multe cereri. Așteaptă un minut și încearcă din nou.';

describe('request limit per account (D-031)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
    await clearDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('answers 429 with a wait time after 120 requests a minute, and not to another account on the same IP', async () => {
    const { agent } = await signedIn(ctx, 'grabit@test.example', Role.STUDENT);
    const { agent: other } = await signedIn(ctx, 'coleg@test.example', Role.STUDENT);

    for (let i = 0; i < 120; i += 1) {
      await agent.get('/api/auth/me').expect(200);
    }
    const blocked = await agent.get('/api/auth/me').expect(429);
    expect(blocked.body).toEqual({ statusCode: 429, message: TOO_MANY });
    const wait = Number(blocked.headers['retry-after']);
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(60);

    await other.get('/api/auth/me').expect(200);
    await agent.get('/api/health').expect(200);
  });
});

describe('request limit without a session (D-031)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('counts the IP, and never limits the health check', async () => {
    for (let i = 0; i < 120; i += 1) {
      await http().get('/api/auth/me').expect(401);
    }
    const blocked = await http().get('/api/auth/me').expect(429);
    expect(blocked.body.message).toBe(TOO_MANY);
    for (let i = 0; i < 5; i += 1) {
      await http().get('/api/health').expect(200);
    }
  });
});
