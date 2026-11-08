import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { config } from 'dotenv';

export default function globalSetup(): void {
  config({ path: join(__dirname, '../../.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is missing. See .env.example.');
  }
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
