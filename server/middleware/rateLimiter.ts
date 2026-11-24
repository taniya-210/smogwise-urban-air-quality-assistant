import type express from 'express';
import type { RateLimitConfig } from '../../types/smogwise.ts';

const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 10;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 2000;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const activeStores = new Set<Map<string, RateLimitBucket>>();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDefaultRateLimitConfig(): RateLimitConfig {
  return {
    maxRequests: parsePositiveInt(
      process.env.RATE_LIMIT_MAX_REQUESTS,
      DEFAULT_RATE_LIMIT_MAX_REQUESTS
    ),
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
  };
}

function extractClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function resetAllRateLimitersForTesting(): void {
  for (const store of activeStores) {
    store.clear();
  }
}

/**
 * Configurable per-IP fixed-window rate limiter middleware.
 * Defaults to 10 requests per minute (configurable via RATE_LIMIT_MAX_REQUESTS and RATE_LIMIT_WINDOW_MS).
 */
export function createIpRateLimiter(
  overrides: Partial<RateLimitConfig> = {}
): express.RequestHandler {
  const defaults = getDefaultRateLimitConfig();
  const maxRequests = overrides.maxRequests ?? defaults.maxRequests;
  const windowMs = overrides.windowMs ?? defaults.windowMs;
  const buckets = new Map<string, RateLimitBucket>();
  activeStores.add(buckets);

  return (req, res, next) => {
    const now = Date.now();

    // Lazily evict expired entries to bound memory usage without open timer handles
    if (buckets.size >= MAX_TRACKED_CLIENTS) {
      for (const [key, entry] of buckets) {
        if (entry.resetAt <= now) {
          buckets.delete(key);
        }
      }
      if (buckets.size >= MAX_TRACKED_CLIENTS) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey) buckets.delete(oldestKey);
      }
    }

    const clientIp = extractClientIp(req);
    const existing = buckets.get(clientIp);
    let bucket: RateLimitBucket;

    if (!existing || existing.resetAt <= now) {
      bucket = { count: 1, resetAt: now + windowMs };
      buckets.set(clientIp, bucket);
    } else {
      bucket = existing;
      bucket.count += 1;
    }

    const remaining = Math.max(0, maxRequests - bucket.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(retryAfterSeconds));

    if (bucket.count > maxRequests) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: `Too many requests from your IP address. Limit is ${maxRequests} requests per ${Math.round(windowMs / 1000)} seconds. Please retry in ${retryAfterSeconds}s.`,
        retryAfterSeconds,
      });
      return;
    }

    next();
  };
}
