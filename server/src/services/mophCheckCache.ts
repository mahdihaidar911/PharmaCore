import type { MophParsedRow } from "./mophImport.js";

type CachedCheck = {
  rows: MophParsedRow[];
  sourceUrl: string;
  sourceLabel: string;
  createdAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, CachedCheck>();

function purgeExpired() {
  const now = Date.now();
  for (const [id, entry] of cache) {
    if (now - entry.createdAt > TTL_MS) {
      cache.delete(id);
    }
  }
}

export function storeMophCheck(
  rows: MophParsedRow[],
  meta: { sourceUrl: string; sourceLabel: string },
): string {
  purgeExpired();
  const checkId = crypto.randomUUID();
  cache.set(checkId, {
    rows,
    sourceUrl: meta.sourceUrl,
    sourceLabel: meta.sourceLabel,
    createdAt: Date.now(),
  });
  return checkId;
}

export function getMophCheck(checkId: string): CachedCheck | null {
  purgeExpired();
  const entry = cache.get(checkId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    cache.delete(checkId);
    return null;
  }
  return entry;
}
