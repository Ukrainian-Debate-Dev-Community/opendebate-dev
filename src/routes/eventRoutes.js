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
router.post("/:organisationId", restrictToOwnOrg, eventController.createEvent); // updated authMiddleware will allow Owners to create events
router.put("/:eventId", restrictToOwnOrg, eventController.updateEvent);
router.delete("/:eventId", restrictToOwnOrg, eventController.deleteEvent);

module.exports = router;
