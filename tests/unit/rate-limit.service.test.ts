import { beforeEach, describe, expect, it } from "vitest";
import { createRateLimiter, defaultRateLimitRules } from "@/services/rate-limit.service";

describe("createRateLimiter", () => {
  let now = 0;
  const limiter = createRateLimiter({
    rules: { authentication: { limit: 3, windowMs: 60_000 } },
    now: () => now,
  });

  beforeEach(() => {
    now = 0;
  });

  it("allows requests up to the configured limit and blocks the next one", () => {
    expect(limiter.check("authentication", "ip:1").allowed).toBe(true);
    expect(limiter.check("authentication", "ip:1").allowed).toBe(true);
    expect(limiter.check("authentication", "ip:1").allowed).toBe(true);

    const blocked = limiter.check("authentication", "ip:1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000);
  });

  it("isolates buckets per key", () => {
    limiter.check("authentication", "ip:2");
    limiter.check("authentication", "ip:2");
    limiter.check("authentication", "ip:2");
    expect(limiter.check("authentication", "ip:2").allowed).toBe(false);
    expect(limiter.check("authentication", "ip:3").allowed).toBe(true);
  });

  it("resets the window after it expires", () => {
    limiter.check("authentication", "ip:4");
    limiter.check("authentication", "ip:4");
    limiter.check("authentication", "ip:4");
    expect(limiter.check("authentication", "ip:4").allowed).toBe(false);

    now = 60_001;
    expect(limiter.check("authentication", "ip:4").allowed).toBe(true);
  });

  it("fails loudly on an unknown rule instead of silently allowing", () => {
    expect(() => limiter.check("unknown-rule" as never, "ip:5")).toThrowError(/unknown/i);
  });

  it("ships documented, overridable rules for the sensitive surfaces", () => {
    expect(Object.keys(defaultRateLimitRules).sort()).toEqual([
      "authentication",
      "customRequest",
      "recovery",
      "registration",
      "sensitive",
    ]);
    for (const rule of Object.values(defaultRateLimitRules)) {
      expect(rule.limit).toBeGreaterThan(0);
      expect(rule.windowMs).toBeGreaterThan(0);
    }
  });
});
