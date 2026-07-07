const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const roundController = require("../controllers/roundController");
const feedbackController = require("../controllers/feedbackController");
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

// creating round and reading all
router.get("/:eventId/rounds", roundController.getEventRounds);
router.post("/:eventId/rounds", restrictToOwnOrg, roundController.createRound);

// get all feedback entries
router.get("/:eventId/feedback", feedbackController.getEventFeedback);

// event CRUD
router.get(
  "/organisation/:organisationId",
  eventController.getOrganisationEvents,
);
router.post("/:organisationId", restrictToOwnOrg, eventController.createEvent); // updated authMiddleware will allow Owners to create events
router.put("/:eventId", restrictToOwnOrg, eventController.updateEvent);
router.delete("/:eventId", restrictToOwnOrg, eventController.deleteEvent);

module.exports = router;
