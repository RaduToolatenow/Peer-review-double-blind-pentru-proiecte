import type { NextFunction, Request, Response } from 'express';

const TOO_MANY = 'Prea multe cereri. Așteaptă un minut și încearcă din nou.';

/**
 * D-031: requests per key in fixed windows, kept in memory. A restart forgets the counts,
 * which is fine for a one-minute window. Ended windows are removed once per window.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private nextSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Counts one request; null when it may pass, otherwise the seconds until the window ends. */
  hit(key: string, now = Date.now()): number | null {
    if (now >= this.nextSweep) {
      for (const [k, w] of this.windows) {
        if (w.resetAt <= now) this.windows.delete(k);
      }
      this.nextSweep = now + this.windowMs;
    }
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return window.count > this.limit ? Math.ceil((window.resetAt - now) / 1000) : null;
  }

  get size(): number {
    return this.windows.size;
  }
}

/** D-031: counts each /api request per signed-in account, or per IP without a session; the health check is free. */
export function rateLimit(limiter: RateLimiter) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (request.path === '/health') {
      next();
      return;
    }
    const userId = request.session?.userId;
    const wait = limiter.hit(userId ? `user:${userId}` : `ip:${request.ip}`);
    if (wait === null) {
      next();
      return;
    }
    response.setHeader('Retry-After', String(wait));
    response.status(429).json({ statusCode: 429, message: TOO_MANY });
  };
}
