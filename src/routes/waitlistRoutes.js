const express = require("express");
const router = express.Router({ mergeParams: true }); // mergeParams is here to grant access to :sessionId from the parent router
const waitlistController = require("../controllers/waitlistController");
const { restrictTo } = require("../middleware/authMiddleware");

// base path is /sessions/:sessionId/waitlist
router.post("/join", waitlistController.joinWaitlist);
router.delete("/leave", waitlistController.leaveWaitlist);
router.get("/", restrictTo("owner"), waitlistController.getSessionWaitlist);

module.exports = router;
