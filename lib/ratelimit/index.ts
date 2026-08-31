import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Limiter = Pick<Ratelimit, "limit">;

const noopLimiter: Limiter = {
  limit: async () => ({
    success: true,
    limit: 0,
    remaining: 999,
    reset: Date.now(),
    pending: Promise.resolve(),
  }),
};

function createLimiter(
  prefix: string,
  limit: number,
  window: `${number} s` | `${number} m` | `${number} h` | `${number} d`,
): Limiter {
  // Skip rate limits in local dev — otherwise 3/hr blocks repeated login testing
  if (process.env.NODE_ENV !== "production") return noopLimiter;

  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;
  if (!url || !token) return noopLimiter;

  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix,
  });
}

export const magicLinkByEmail = createLimiter("rl:magic:email", 3, "1 h");
export const magicLinkByIp = createLimiter("rl:magic:ip", 3, "1 h");
export const generatorByUser = createLimiter("rl:gen:user", 10, "1 d");
export const generatorByIp = createLimiter("rl:gen:ip", 100, "1 d");
export const applicationByUser = createLimiter("rl:app:user", 3, "60 d");
export const verifyByIp = createLimiter("rl:verify:ip", 100, "1 h");
export const adminByIp = createLimiter("rl:admin:ip", 200, "1 h");
export const sessionAgentByUser = createLimiter("rl:session-agent:user", 40, "1 h");
export const accountEmailChangeByUser = createLimiter("rl:account-email:user", 3, "1 h");
