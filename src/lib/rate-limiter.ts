/**
 * Token-bucket rate limiter for Next.js Edge middleware.
 *
 * In-memory store keyed by (clientIp, endpoint bucket).
 * Each bucket has: tokens, lastRefill, limit, windowMs.
 *
 * Per-endpoint configuration allows different limits for
 * heavy endpoints (audit, anonymise) vs. lightweight ones (health, ping).
 *
 * All rate limit decisions are observable via the RateLimitEntry
 * Prisma model and the x-rate-limit-* response headers.
 */

// ── Types ──

export interface RateLimitConfig {
  limit: number;        // max requests per window
  windowMs: number;     // window duration in ms
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;      // ms until full refill
  limit: number;
  retryAfterMs?: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

// ── Per-endpoint rate limit configuration ──

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // System/observability endpoints — generous
  '/api/system/ping': { limit: 120, windowMs: 60_000 },
  '/api/system/correlated-trace': { limit: 60, windowMs: 60_000 },
  '/api/system/observability/ep-trace': { limit: 30, windowMs: 60_000 },
  '/api/compliance/health': { limit: 120, windowMs: 60_000 },

  // Read endpoints — moderate
  '/api/compliance/findings': { limit: 60, windowMs: 60_000 },
  '/api/compliance/mttr': { limit: 60, windowMs: 60_000 },
  '/api/compliance/policies': { limit: 60, windowMs: 60_000 },
  '/api/compliance/profiles': { limit: 60, windowMs: 60_000 },

  // Write endpoints — stricter
  '/api/compliance/audit': { limit: 10, windowMs: 60_000 },
  '/api/compliance/remediate': { limit: 10, windowMs: 60_000 },
  '/api/compliance/anonymise': { limit: 20, windowMs: 60_000 },
};

// Default limit for unconfigured endpoints
const DEFAULT_LIMIT: RateLimitConfig = { limit: 60, windowMs: 60_000 };

// In-memory bucket store (Edge-compatible — no global Map in MW, use module-level)
const buckets = new Map<string, Bucket>();

// Cleanup old buckets every 5 minutes to prevent memory leaks
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60_000;
const MAX_BUCKETS = 10_000;

function cleanupOldBuckets() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  // Evict buckets older than their window
  for (const [key, bucket] of buckets) {
    const elapsed = now - bucket.lastRefill;
    const config = extractConfigFromKey(key);
    if (elapsed > config.windowMs * 2) {
      buckets.delete(key);
    }
  }

  // Hard cap: if too many buckets, evict oldest entries
  if (buckets.size > MAX_BUCKETS) {
    const entries = Array.from(buckets.entries());
    entries.sort((a, b) => a[1].lastRefill - b[1].lastRefill);
    for (let i = 0; i < entries.length - MAX_BUCKETS + 1000; i++) {
      buckets.delete(entries[i][0]);
    }
  }
}

function extractConfigFromKey(key: string): RateLimitConfig {
  // Key format: "ip:path"
  const colonIdx = key.indexOf(':');
  const path = colonIdx >= 0 ? key.slice(colonIdx + 1) : '';
  return getRateLimitConfig(path);
}

// ── Resolve config for a given pathname ──

export function getRateLimitConfig(pathname: string): RateLimitConfig {
  // Exact match first
  if (RATE_LIMITS[pathname]) return RATE_LIMITS[pathname];

  // Prefix match (longest prefix wins)
  let bestMatch = '';
  for (const key of Object.keys(RATE_LIMITS)) {
    if (pathname.startsWith(key) && key.length > bestMatch.length) {
      bestMatch = key;
    }
  }
  if (bestMatch) return RATE_LIMITS[bestMatch];

  return DEFAULT_LIMIT;
}

// ── Core rate limit check ──

export function checkRateLimit(
  clientIp: string,
  pathname: string,
): RateLimitResult {
  cleanupOldBuckets();

  const config = getRateLimitConfig(pathname);
  const key = `${clientIp}:${pathname}`;
  const now = Date.now();

  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: config.limit, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const refillAmount = (elapsed / config.windowMs) * config.limit;
  bucket.tokens = Math.min(config.limit, bucket.tokens + refillAmount);
  bucket.lastRefill = now;

  // Check if allowed
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    const resetMs = Math.round(((config.limit - bucket.tokens) / config.limit) * config.windowMs);
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetMs,
      limit: config.limit,
    };
  }

  // Rate limited
  const retryAfterMs = Math.round(((1 - bucket.tokens) / config.limit) * config.windowMs);
  return {
    allowed: false,
    remaining: 0,
    resetMs: config.windowMs,
    limit: config.limit,
    retryAfterMs,
  };
}

// ── Get all rate limit configs (for observability/dashboard) ──

export function getAllRateLimitConfigs(): Array<{ path: string; limit: number; windowMs: number; windowSec: number }> {
  return Object.entries(RATE_LIMITS).map(([path, cfg]) => ({
    path,
    limit: cfg.limit,
    windowMs: cfg.windowMs,
    windowSec: cfg.windowMs / 1000,
  }));
}

// ── Get current bucket stats (for observability) ──

export function getBucketStats(): { totalBuckets: number; topConsumers: Array<{ key: string; remaining: number; limit: number }> } {
  const entries = Array.from(buckets.entries())
    .map(([key, bucket]) => ({ key, remaining: Math.floor(bucket.tokens), limit: getRateLimitConfig(key.split(':').slice(1).join(':')).limit }))
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 20);
  return { totalBuckets: buckets.size, topConsumers: entries };
}
