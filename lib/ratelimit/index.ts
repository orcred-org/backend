import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

// TODO: restore limits before going live
// 100 magic link requests per email per hour (relaxed for testing)
export const magicLinkByEmail = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 h"),
  prefix: "rl:magic:email",
});

// 100 magic link requests per IP per hour (relaxed for testing)
export const magicLinkByIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 h"),
  prefix: "rl:magic:ip",
});

// 10 generator requests per user per day
export const generatorByUser = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 d"),
  prefix: "rl:gen:user",
});

// 100 generator requests per IP per day (public generator abuse prevention)
export const generatorByIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 d"),
  prefix: "rl:gen:ip",
});

// 3 applications per user per 60 days
export const applicationByUser = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "60 d"),
  prefix: "rl:app:user",
});

// 100 credential verifications per IP per hour
export const verifyByIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 h"),
  prefix: "rl:verify:ip",
});

// 200 admin requests per hour
export const adminByIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(200, "1 h"),
  prefix: "rl:admin:ip",
});
