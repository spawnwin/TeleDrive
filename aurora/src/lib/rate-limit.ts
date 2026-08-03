import type { NextRequest } from 'next/server'

// Simple in-memory sliding-window rate limiter.
// Per-process only; enough to stop abuse of auth / Yandex proxy endpoints.

const buckets = new Map<string, number[]>()
const MAX_BUCKETS = 10_000

function sweep(windowMs: number) {
  if (buckets.size < MAX_BUCKETS) return
  const now = Date.now()
  for (const [key, hits] of buckets) {
    if (hits.length === 0 || now - hits[hits.length - 1]! > windowMs) {
      buckets.delete(key)
    }
  }
}

/** Returns true when the call is allowed, false when the limit is exceeded. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    return false
  }
  hits.push(now)
  buckets.set(key, hits)
  sweep(windowMs)
  return true
}

export function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
    return parts[parts.length - 1] || 'unknown'
  }
  return req.headers.get('x-real-ip') ?? 'unknown'
}
