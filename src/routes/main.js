const express = require("express");
const router = express.Router();

const userRoutes = require("./userRoutes");
const holdingRoutes = require("./holdingRoutes");
const sessionRoutes = require("./sessionRoutes");
const adminRoutes = require("./adminRoutes");

router.use("/users", userRoutes);
router.use("/holdings", holdingRoutes);
router.use("/sessions", sessionRoutes);
router.use("/admins", adminRoutes);

module.exports = router;
