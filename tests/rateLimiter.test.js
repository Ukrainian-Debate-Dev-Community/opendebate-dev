const express = require("express");
const request = require("supertest");
const {
  createLimiter,
  isInternalIp,
} = require("../src/middleware/rateLimiter");

// Builds an app mirroring src/app.js limiter setup (trust proxy = 1).
// `socketAddress` fakes the TCP peer address so external clients can be
// simulated from supertest's loopback connection.
const buildApp = (limiter, socketAddress) => {
  const app = express();
  app.set("trust proxy", 1);
  if (socketAddress) {
    app.use((req, _res, next) => {
      Object.defineProperty(req, "socket", {
        value: { remoteAddress: socketAddress },
        configurable: true,
      });
      next();
    });
  }
  app.use(limiter);
  app.get("/", (_req, res) => res.status(200).json({ ok: true }));
  return app;
};

describe("isInternalIp", () => {
  test("accepts loopback addresses", () => {
    expect(isInternalIp("127.0.0.1")).toBe(true);
    expect(isInternalIp("127.1.2.3")).toBe(true);
    expect(isInternalIp("::1")).toBe(true);
    expect(isInternalIp("::ffff:127.0.0.1")).toBe(true);
  });

  test("accepts private ranges", () => {
    expect(isInternalIp("10.0.0.5")).toBe(true);
    expect(isInternalIp("10.255.255.255")).toBe(true);
    expect(isInternalIp("172.16.0.1")).toBe(true);
    expect(isInternalIp("172.31.255.254")).toBe(true);
    expect(isInternalIp("192.168.1.10")).toBe(true);
    expect(isInternalIp("::ffff:10.1.2.3")).toBe(true);
  });

  test("rejects public and out-of-range addresses", () => {
    expect(isInternalIp("8.8.8.8")).toBe(false);
    expect(isInternalIp("203.0.113.9")).toBe(false);
    expect(isInternalIp("11.0.0.1")).toBe(false);
    expect(isInternalIp("172.15.0.1")).toBe(false);
    expect(isInternalIp("172.32.0.1")).toBe(false);
    expect(isInternalIp("193.168.1.1")).toBe(false);
    expect(isInternalIp("::ffff:203.0.113.9")).toBe(false);
    expect(isInternalIp("2001:db8::1")).toBe(false);
  });

  test("rejects missing or malformed input", () => {
    expect(isInternalIp(undefined)).toBe(false);
    expect(isInternalIp(null)).toBe(false);
    expect(isInternalIp("")).toBe(false);
    expect(isInternalIp("not-an-ip")).toBe(false);
    expect(isInternalIp("10.0.0")).toBe(false);
  });
});

describe("rate limiter internal exemption", () => {
  test("internal socket (private range) bypasses the limiter", async () => {
    const app = buildApp(
      createLimiter({ windowMs: 60 * 1000, max: 2 }),
      "10.0.0.7",
    );
    for (let i = 0; i < 6; i++) {
      const res = await request(app).get("/");
      expect(res.statusCode).toBe(200);
    }
  });

  test("real loopback connection bypasses the limiter", async () => {
    // no faked socket: supertest connects over loopback
    const app = buildApp(createLimiter({ windowMs: 60 * 1000, max: 1 }));
    for (let i = 0; i < 4; i++) {
      const res = await request(app).get("/");
      expect(res.statusCode).toBe(200);
    }
  });

  test("external socket is still limited", async () => {
    const app = buildApp(
      createLimiter({ windowMs: 60 * 1000, max: 3 }),
      "203.0.113.9",
    );
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/");
      expect(res.statusCode).toBe(200);
    }
    const blocked = await request(app).get("/");
    expect(blocked.statusCode).toBe(429);
  });

  test("X-Forwarded-For spoofing does not grant the exemption", async () => {
    const app = buildApp(
      createLimiter({ windowMs: 60 * 1000, max: 3 }),
      "203.0.113.9",
    );
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .get("/")
        .set("X-Forwarded-For", "127.0.0.1");
      expect(res.statusCode).toBe(200);
    }
    const blocked = await request(app)
      .get("/")
      .set("X-Forwarded-For", "127.0.0.1");
    expect(blocked.statusCode).toBe(429);
  });
});

describe("rate limit env configuration", () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.resetModules();
  });

  test("RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS override apiLimiter", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      RATE_LIMIT_MAX: "2",
      RATE_LIMIT_WINDOW_MS: "60000",
    };
    jest.resetModules();
    const { apiLimiter } = require("../src/middleware/rateLimiter");

    const app = buildApp(apiLimiter, "203.0.113.50");
    for (let i = 0; i < 2; i++) {
      const res = await request(app).get("/");
      expect(res.statusCode).toBe(200);
    }
    const blocked = await request(app).get("/");
    expect(blocked.statusCode).toBe(429);
  });

  test("invalid env values fall back to defaults (200 per window)", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      RATE_LIMIT_MAX: "not-a-number",
      RATE_LIMIT_WINDOW_MS: "-5",
    };
    jest.resetModules();
    const { apiLimiter } = require("../src/middleware/rateLimiter");

    const app = buildApp(apiLimiter, "203.0.113.51");
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBe("200");
    expect(res.headers["ratelimit-policy"]).toBe("200;w=900");
  });
});
