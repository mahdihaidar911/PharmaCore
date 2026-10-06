/** Small in-memory fixed-window limiter. Sufficient for a single on-premise server process. */
export function createRateLimiter(options: { max: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    /** Records a hit and returns false when the key is over its limit. */
    hit(key: string): boolean {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + options.windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= options.max;
    },
    isBlocked(key: string): boolean {
      const entry = hits.get(key);
      return Boolean(entry && entry.resetAt > Date.now() && entry.count >= options.max);
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
