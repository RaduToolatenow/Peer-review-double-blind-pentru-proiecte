import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { config } from 'dotenv';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

config({ path: join(__dirname, '../../.env'), quiet: true });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  // D-006: one origin. The React build is served here when it exists.
  const webRoot = join(__dirname, '../../web/dist');
  if (existsSync(webRoot)) {
    app.useStaticAssets(webRoot);
    app.use((req: { method: string; path: string }, res: { sendFile(path: string): void }, next: () => void) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        res.sendFile(join(webRoot, 'index.html'));
      } else {
        next();
      }
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
