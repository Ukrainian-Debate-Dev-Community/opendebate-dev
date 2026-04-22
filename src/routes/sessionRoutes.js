const express = require("express");
const router = express.Router();
const sessionController = require("../controllers/sessionController");
const { authenticate, restrictTo } = require("../middleware/authMiddleware");

// the child routers
const waitlistRoutes = require("./waitlistRoutes");
const teamRoutes = require("./teamRoutes");
const roomRoutes = require("./roomRoutes");

// I can cover authentication in parent, lmao
router.use(authenticate);

router.use("/:sessionId/waitlist", waitlistRoutes);
router.use("/:sessionId/teams", teamRoutes);
router.use("/:sessionId/rooms", roomRoutes);

// Session core routes
router.get("/holding/:holdingId", sessionController.getHoldingSessions);
router.post("/", restrictTo("owner"), sessionController.createSession);
router.put("/:id", restrictTo("owner"), sessionController.updateSession);
router.delete("/:id", restrictTo("owner"), sessionController.deleteSession);

module.exports = router;
