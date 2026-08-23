import { createHmac } from "node:crypto";
import { Redis } from "@upstash/redis";
import { checkRateLimit, checkRateLimitBatch, type RateResult } from "@/lib/rate-limit";

export type RateLimitFailureMode = "local-fallback" | "fail-closed";

export interface DistributedRateResult extends RateResult {
  limit: number;
  resetAt: number;
  degraded: boolean;
  infrastructureFailure: boolean;
}

export interface RateLimitRequest {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
}

const SINGLE_WINDOW_SCRIPT = `
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local ttl = redis.call("PTTL", KEYS[1])

if current >= limit then
  if ttl < 0 then
    redis.call("PEXPIRE", KEYS[1], window)
    ttl = window
  end
  return {0, 0, ttl}
end

if current == 0 then
  redis.call("SET", KEYS[1], 1, "PX", window)
  current = 1
else
  current = redis.call("INCR", KEYS[1])
  if ttl < 0 then
    redis.call("PEXPIRE", KEYS[1], window)
    ttl = window
  end
end

return {1, math.max(limit - current, 0), redis.call("PTTL", KEYS[1])}
`;

// All dimensions are checked before any of them is incremented. This prevents
// login IP quota from being consumed when the identifier quota is already full.
const COMPOSITE_WINDOW_SCRIPT = `
local min_remaining = 2147483647
local max_ttl = 0

for i = 1, #KEYS do
  local arg_index = ((i - 1) * 2) + 1
  local limit = tonumber(ARGV[arg_index])
  local window = tonumber(ARGV[arg_index + 1])
  local current = tonumber(redis.call("GET", KEYS[i]) or "0")
  local ttl = redis.call("PTTL", KEYS[i])
  if current >= limit then
    if ttl < 0 then
      redis.call("PEXPIRE", KEYS[i], window)
      ttl = window
    end
    return {0, 0, ttl}
  end
end

for i = 1, #KEYS do
  local arg_index = ((i - 1) * 2) + 1
  local limit = tonumber(ARGV[arg_index])
  local window = tonumber(ARGV[arg_index + 1])
  local current = tonumber(redis.call("GET", KEYS[i]) or "0")
  local ttl = redis.call("PTTL", KEYS[i])

  if current == 0 then
    redis.call("SET", KEYS[i], 1, "PX", window)
    current = 1
  else
    current = redis.call("INCR", KEYS[i])
    if ttl < 0 then
      redis.call("PEXPIRE", KEYS[i], window)
    end
  end

  min_remaining = math.min(min_remaining, math.max(limit - current, 0))
  max_ttl = math.max(max_ttl, redis.call("PTTL", KEYS[i]))
end

return {1, min_remaining, max_ttl}
`;

let redisClient: Redis | null | undefined;
let warnedAboutMissingRedis = false;

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function getTimeoutMs(): number {
  const configured = Number(process.env.RATE_LIMIT_REDIS_TIMEOUT_MS || "750");
  return Number.isFinite(configured) && configured >= 100 && configured <= 5000 ? configured : 750;
}

function getKeySecret(): string {
  return process.env.RATE_LIMIT_KEY_SECRET?.trim()
    || process.env.JWT_SECRET?.trim()
    || "local-development-rate-limit-secret";
}

function getEnvironmentName(): string {
  return (process.env.VERCEL_ENV || process.env.NODE_ENV || "development").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function shouldFailClosed(failureMode: RateLimitFailureMode): boolean {
  return failureMode === "fail-closed" && (process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL_ENV));
}

function safeScope(scope: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(scope)) {
    throw new Error("Invalid rate limit scope");
  }
  return scope;
}

function buildRedisKey(scope: string, identifier: string): string {
  const digest = createHmac("sha256", getKeySecret()).update(identifier).digest("hex");
  return `agm:rl:v1:${getEnvironmentName()}:${safeScope(scope)}:${digest}`;
}

function localDecision(
  request: RateLimitRequest,
  result: RateResult,
): DistributedRateResult {
  const resetMs = result.ok ? request.windowMs : Math.max(1, result.retryAfterMs);
  return {
    ...result,
    limit: request.limit,
    resetAt: Date.now() + resetMs,
    degraded: true,
    infrastructureFailure: false,
  };
}

function infrastructureDecision(request: RateLimitRequest): DistributedRateResult {
  return {
    ok: false,
    remaining: 0,
    retryAfterMs: 2000,
    limit: request.limit,
    resetAt: Date.now() + 2000,
    degraded: false,
    infrastructureFailure: true,
  };
}

async function evalWithTimeout<T extends unknown[]>(redis: Redis, script: string, keys: string[], args: string[]): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Redis rate limit timeout")), getTimeoutMs());
  });
  try {
    return await Promise.race([redis.eval<string[], T>(script, keys, args), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseReply(reply: unknown, request: RateLimitRequest): DistributedRateResult {
  if (!Array.isArray(reply) || reply.length < 3) throw new Error("Invalid Redis rate limit response");
  const allowed = Number(reply[0]) === 1;
  const remaining = Math.max(0, Number(reply[1]));
  const ttl = Math.max(1, Number(reply[2]));
  if (!Number.isFinite(remaining) || !Number.isFinite(ttl)) throw new Error("Invalid Redis rate limit values");
  return {
    ok: allowed,
    remaining,
    retryAfterMs: allowed ? 0 : ttl,
    limit: request.limit,
    resetAt: Date.now() + ttl,
    degraded: false,
    infrastructureFailure: false,
  };
}

function validateRequest(request: RateLimitRequest): void {
  if (!request.identifier || request.identifier.length > 1024) throw new Error("Invalid rate limit identifier");
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 1_000_000) throw new Error("Invalid rate limit limit");
  if (!Number.isInteger(request.windowMs) || request.windowMs < 1000 || request.windowMs > 7 * 24 * 60 * 60 * 1000) throw new Error("Invalid rate limit window");
}

export function isRedisRateLimitConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
}

export async function checkDistributedRateLimit(
  request: RateLimitRequest,
  failureMode: RateLimitFailureMode = "local-fallback",
): Promise<DistributedRateResult> {
  validateRequest(request);
  const redis = getRedisClient();
  if (!redis) {
    if (!warnedAboutMissingRedis) {
      warnedAboutMissingRedis = true;
      console.warn("[RateLimit] Redis env vars are missing; using local fallback.");
    }
    if (shouldFailClosed(failureMode)) return infrastructureDecision(request);
    return localDecision(request, checkRateLimit(buildRedisKey(request.scope, request.identifier), request.limit, request.windowMs));
  }

  try {
    const reply = await evalWithTimeout<number[]>(
      redis,
      SINGLE_WINDOW_SCRIPT,
      [buildRedisKey(request.scope, request.identifier)],
      [String(request.limit), String(request.windowMs)],
    );
    return parseReply(reply, request);
  } catch (error) {
    console.error("[RateLimit] Redis check failed:", error instanceof Error ? error.message : "unknown error");
    if (shouldFailClosed(failureMode)) return infrastructureDecision(request);
    return localDecision(request, checkRateLimit(buildRedisKey(request.scope, request.identifier), request.limit, request.windowMs));
  }
}

export async function checkDistributedRateLimitBatch(
  requests: RateLimitRequest[],
  failureMode: RateLimitFailureMode = "local-fallback",
): Promise<DistributedRateResult> {
  if (requests.length === 0) throw new Error("At least one rate limit request is required");
  requests.forEach(validateRequest);
  const redis = getRedisClient();
  const primary = requests[0];
  if (!redis) {
    if (!warnedAboutMissingRedis) {
      warnedAboutMissingRedis = true;
      console.warn("[RateLimit] Redis env vars are missing; using local fallback.");
    }
    if (failureMode === "fail-closed") return infrastructureDecision(primary);
    const result = checkRateLimitBatch(requests.map((request) => ({
      key: buildRedisKey(request.scope, request.identifier),
      limit: request.limit,
      windowMs: request.windowMs,
    })));
    return localDecision(primary, result);
  }

  try {
    const reply = await evalWithTimeout<number[]>(
      redis,
      COMPOSITE_WINDOW_SCRIPT,
      requests.map((request) => buildRedisKey(request.scope, request.identifier)),
      requests.flatMap((request) => [String(request.limit), String(request.windowMs)]),
    );
    return parseReply(reply, primary);
  } catch (error) {
    console.error("[RateLimit] Redis composite check failed:", error instanceof Error ? error.message : "unknown error");
    if (failureMode === "fail-closed") return infrastructureDecision(primary);
    const result = checkRateLimitBatch(requests.map((request) => ({
      key: buildRedisKey(request.scope, request.identifier),
      limit: request.limit,
      windowMs: request.windowMs,
    })));
    return localDecision(primary, result);
  }
}
