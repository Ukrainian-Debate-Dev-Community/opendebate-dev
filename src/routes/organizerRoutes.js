const express = require("express");
const router = express.Router({ mergeParams: true });
const organizerController = require("../controllers/organizerController");
const { restrictToOwnOrg } = require("../middleware/authMiddleware");

// inherited path /api/events/:eventId/organizers
router.get("/", organizerController.getEventOrganizers);

router.post("/", restrictToOwnOrg, organizerController.addOrganizer);
router.delete(
  "/:targetUserId",
  restrictToOwnOrg,
  organizerController.removeOrganizer,
);

module.exports = router;
