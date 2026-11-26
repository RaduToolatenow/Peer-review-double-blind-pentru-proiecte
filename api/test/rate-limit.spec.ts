import { RateLimiter } from '../src/rate-limit';

describe('request counter (D-031)', () => {
  it('lets 120 requests pass in a minute and tells the 121st how long to wait', () => {
    const limiter = new RateLimiter(120, 60_000);
    for (let i = 0; i < 120; i += 1) {
      expect(limiter.hit('user:a', 1_000 + i)).toBeNull();
    }
    expect(limiter.hit('user:a', 31_000)).toBe(30);
    expect(limiter.hit('user:a', 60_999)).toBe(1);
  });

  it('starts a new window once the minute has passed', () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.hit('ip:1', 0);
    limiter.hit('ip:1', 1);
    expect(limiter.hit('ip:1', 2)).not.toBeNull();
    expect(limiter.hit('ip:1', 60_000)).toBeNull();
  });

  it('counts each key on its own', () => {
    const limiter = new RateLimiter(1, 60_000);
    expect(limiter.hit('user:a', 0)).toBeNull();
    expect(limiter.hit('user:a', 1)).not.toBeNull();
    expect(limiter.hit('user:b', 2)).toBeNull();
    expect(limiter.hit('ip:127.0.0.1', 3)).toBeNull();
  });

  it('forgets keys whose window has ended', () => {
    const limiter = new RateLimiter(5, 60_000);
    limiter.hit('user:a', 0);
    limiter.hit('user:b', 10);
    expect(limiter.size).toBe(2);
    limiter.hit('user:c', 60_010);
    expect(limiter.size).toBe(1);
  });
});
