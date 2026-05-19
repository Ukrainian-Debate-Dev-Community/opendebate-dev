const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

const { sequelize } = require("./models");
const apiRoutes = require("./routes/main");

const errorHandler = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 3000;

// middleware
app.use(helmet()); // headers security
app.use(cors()); // cross-origin requests
app.use(express.json()); // json parse

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
app.use("/api", apiRoutes);

// error handler middleware
app.use(errorHandler);

// db connect and server start
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log("Database connection has been established successfully.");

    app.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    process.exitCode = 1;
  }
};

startServer();
