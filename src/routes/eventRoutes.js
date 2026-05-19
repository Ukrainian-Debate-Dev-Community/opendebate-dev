const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const {
  verifyToken,
  restrictToOwnOrg,
} = require("../middleware/authMiddleware");

// child routers
const motionRoutes = require("./motionRoutes");
const participantRoutes = require("./eventParticipantRoutes");
const organizerRoutes = require("./organizerRoutes");

router.use(verifyToken);

// pass the eventId down
router.use("/:eventId/motions", motionRoutes);
router.use("/:eventId/participants", participantRoutes);
router.use("/:eventId/organizers", organizerRoutes);

// event CRUD
router.get(
  "/organisation/:organisationId",
  eventController.getOrganisationEvents,
);
router.post("/", restrictToOwnOrg, eventController.createEvent);
router.put("/:id", restrictToOwnOrg, eventController.updateEvent);
router.delete("/:id", restrictToOwnOrg, eventController.deleteEvent);

module.exports = router;
