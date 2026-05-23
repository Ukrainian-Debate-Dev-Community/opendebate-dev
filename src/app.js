const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const { sequelize } = require("./models");
const apiRoutes = require("./routes/main");

const AppError = require("./utils/AppError");
const errorHandler = require("./middleware/errorHandler");

// fail-fast on missing/weak JWT_SECRET so tokens are never signed with `undefined`
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET missing or too short (≥32 chars required)");
}

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window
  message: {
    status: "fail",
    message:
      "Too many requests from this IP, please try again after 15 minutes.",
  },
  standardHeaders: true, // return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // disable the `X-RateLimit-*` headers
});

// CORS allowlist from env (comma-separated). Empty/missing → no cross-origin browser access.
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: { "default-src": ["'none'"] },
    },
  }),
);
app.use(cors({ origin: corsOrigins, credentials: false }));
app.use(express.json({ limit: "100kb" }));

// kubelet probes — mounted at root so the Gateway HTTPRoute (/api/*) keeps them off the public path
app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok" }));

app.get("/readyz", async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});

// routes
app.use("/api", apiLimiter, apiRoutes);

// JSON 404 for unknown routes so API clients don't break on default HTML
app.use((req, _res, next) =>
  next(new AppError(`Route ${req.originalUrl} not found.`, 404)),
);

// error handler middleware
app.use(errorHandler);

// db connect and server start
let server;
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connection has been established successfully.");

    server = app.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    process.exitCode = 1;
  }
};

// structured logging for stray async failures, then exit (process.exit is required
// to fail-fast on undefined state — exitCode wouldn't terminate while handles linger).
/* eslint-disable n/no-process-exit, promise/catch-or-return */
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

// graceful shutdown — drain HTTP, close DB pool, then exit
["SIGTERM", "SIGINT"].forEach((signal) => {
  process.on(signal, () => {
    console.log(`[${signal}] received — shutting down`);
    if (!server) {
      sequelize.close().finally(() => process.exit(0));
      return;
    }
    server.close(async () => {
      try {
        await sequelize.close();
      } finally {
        process.exit(0);
      }
    });
  });
});
/* eslint-enable n/no-process-exit, promise/catch-or-return */

if (require.main === module) {
  startServer();
}
