const rateLimit = require("express-rate-limit");
const net = require("net");

const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX = 200;

const envInt = (name, fallback) => {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

// Loopback + RFC1918 private ranges
const INTERNAL_V4 = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
];

const isInternalIp = (address) => {
  if (!address || typeof address !== "string") return false;
  // strip IPv4-mapped IPv6 prefix (::ffff:127.0.0.1)
  const ip = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (ip === "::1") return true;
  if (!net.isIPv4(ip)) return false;
  return INTERNAL_V4.some((range) => range.test(ip));
};

// Exempt internal clients (Elixir gateway, docker network, loopback) from
// rate limiting. Keyed on the actual socket peer address — never req.ip,
// which honours X-Forwarded-For under `trust proxy` and could be spoofed
// by an external client to escape the limit.
const skipInternal = (req) =>
  isInternalIp(req.socket && req.socket.remoteAddress);

const createLimiter = (options) =>
  rateLimit({
    standardHeaders: true, // return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // disable the `X-RateLimit-*` headers
    skip: skipInternal,
    ...options,
  });

const apiLimiter = createLimiter({
  windowMs: envInt("RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS),
  max: envInt("RATE_LIMIT_MAX", DEFAULT_MAX),
  message: {
    status: "fail",
    message:
      "Too many requests from this IP, please try again after 15 minutes.",
  },
});

// tighter cap on login to slow brute-force; relies on `trust proxy` for real client IP.
const loginLimiter = createLimiter({
  windowMs: envInt("RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS),
  max: 10,
  message: {
    status: "fail",
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
});

module.exports = {
  apiLimiter,
  loginLimiter,
  createLimiter,
  isInternalIp,
  skipInternal,
};
