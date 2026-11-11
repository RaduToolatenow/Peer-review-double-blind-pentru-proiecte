import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { requireEnv } from './env';

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

/** Applies the settings shared by the real server and the tests. Returns the session store. */
export function configureApp(app: NestExpressApplication) {
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    // The host's proxy terminates HTTPS; without this, secure cookies are never sent.
    app.set('trust proxy', 1);
  }

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const PgStore = connectPgSimple(session);
  const store = new PgStore({ conString: requireEnv('DATABASE_URL'), tableName: 'session' });

  app.use(
    session({
      name: 'sid',
      secret: requireEnv('SESSION_SECRET'),
      store,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: SESSION_MAX_AGE_MS },
    }),
  );

  return store;
}
