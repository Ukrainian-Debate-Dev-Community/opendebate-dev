const express = require("express");
const router = express.Router({ mergeParams: true });
const participantController = require("../controllers/eventParticipantController");
const { restrictToOwnOrg } = require("../middleware/authMiddleware");

// inherited path /api/events/:eventId/participants
router.get("/", participantController.getEventParticipants);
router.post("/", restrictToOwnOrg, participantController.addParticipant);
router.put(
  "/:participantId",
  restrictToOwnOrg,
  participantController.updateParticipant,
);
router.delete(
  "/:participantId",
  restrictToOwnOrg,
  participantController.removeParticipant,
);

module.exports = router;
