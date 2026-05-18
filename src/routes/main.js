const express = require("express");
const router = express.Router();

const userRoutes = require("./userRoutes");
const adminRoutes = require("./adminRoutes");
const organisationRoutes = require("./organisationRoutes");
const formatRoutes = require("./formatRoutes");
const eventRoutes = require("./eventRoutes");
const roundRoutes = require("./roundRoutes");
const roomRoutes = require("./roomRoutes");

router.use("/users", userRoutes);
router.use("/admins", adminRoutes);
router.use("/organisations", organisationRoutes);
router.use("/formats", formatRoutes);
router.use("/events", eventRoutes);

router.use("/rounds", roundRoutes);
router.use("/rooms", roomRoutes);

module.exports = router;
