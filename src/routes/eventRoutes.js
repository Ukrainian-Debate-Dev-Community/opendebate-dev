const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const roundController = require("../controllers/roundController");
const feedbackController = require("../controllers/feedbackController");
const teamController = require("../controllers/teamController");
const standingsController = require("../controllers/standingsController");
const eventParticipantController = require("../controllers/eventParticipantController");
const {
  verifyToken,
  restrictToOwnOrg,
} = require("../middleware/authMiddleware");

// child routers
const motionRoutes = require("./motionRoutes");
const participantRoutes = require("./eventParticipantRoutes");
const organizerRoutes = require("./organizerRoutes");
const conflictRoutes = require("./conflictRoutes");

router.use(verifyToken);

// pass the eventId down
router.use("/:eventId/motions", motionRoutes);
router.use("/:eventId/participants", participantRoutes);
router.use("/:eventId/organizers", organizerRoutes);
router.use("/:eventId/conflicts", conflictRoutes);

// creating round and reading all
router.get("/:eventId/rounds", roundController.getEventRounds);
router.post("/:eventId/rounds", restrictToOwnOrg, roundController.createRound);

// release all rounds
router.patch(
  "/:eventId/rounds/release-all",
  restrictToOwnOrg,
  roundController.releaseAllRounds,
);

// get all feedback entries
router.get(
  "/:eventId/feedback",
  restrictToOwnOrg,
  feedbackController.getEventFeedback,
);

// bulk elimination (team and participants)
router.patch(
  "/:eventId/eliminations",
  restrictToOwnOrg,
  eventParticipantController.updateEliminations,
);

// get speaker/team standings
router.get("/:eventId/standings/teams", standingsController.getTeamStandings);
router.get(
  "/:eventId/standings/speakers",
  standingsController.getSpeakerStandings,
);

// teams
router.get("/:eventId/teams", teamController.getEventTeams);
router.post("/:eventId/teams", restrictToOwnOrg, teamController.createTeam);
router.put(
  "/:eventId/teams/:teamId",
  restrictToOwnOrg,
  teamController.updateTeam,
);
router.delete(
  "/:eventId/teams/:teamId",
  restrictToOwnOrg,
  teamController.deleteTeam,
);

// event CRUD
router.get(
  "/organisation/:organisationId",
  eventController.getOrganisationEvents,
);
router.post("/:organisationId", restrictToOwnOrg, eventController.createEvent);
router.put("/:eventId", restrictToOwnOrg, eventController.updateEvent);
router.delete("/:eventId", restrictToOwnOrg, eventController.deleteEvent);

module.exports = router;
