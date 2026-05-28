const express = require("express");
const router = express.Router();
const teamController = require("../controllers/teamController");
const roomController = require("../controllers/roomController");
const roundController = require("../controllers/roundController");
const {
  verifyToken,
  restrictToOwnOrg,
} = require("../middleware/authMiddleware");

router.use(verifyToken);

// rounds
router.get("/:roundId", roundController.getRoundById);
router.put("/:roundId", restrictToOwnOrg, roundController.updateRound);
router.delete("/:roundId", restrictToOwnOrg, roundController.deleteRound);

// teams
router.get("/:roundId/teams", teamController.getRoundTeams);
router.post("/:roundId/teams", restrictToOwnOrg, teamController.createTeam);
router.put("/teams/:teamId", restrictToOwnOrg, teamController.updateTeam);
router.delete("/teams/:teamId", restrictToOwnOrg, teamController.deleteTeam);

// rooms
router.get("/:roundId/rooms", roomController.getRoundRooms);
router.post("/:roundId/rooms", restrictToOwnOrg, roomController.createRoom);

module.exports = router;
