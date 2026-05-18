const express = require("express");
const router = express.Router();
const teamController = require("../controllers/teamController");
const roomController = require("../controllers/roomController");
const {
  verifyToken,
  restrictToOwnOrg,
} = require("../middleware/authMiddleware");

router.use(verifyToken);

// teams
router.get("/:roundId/teams", teamController.getRoundTeams);
router.post("/:roundId/teams", restrictToOwnOrg, teamController.createTeam);
router.put("/teams/:teamId", restrictToOwnOrg, teamController.updateTeam);
router.delete("/teams/:teamId", restrictToOwnOrg, teamController.deleteTeam);

// rooms
router.get("/:roundId/rooms", roomController.getRoundRooms);
router.post("/:roundId/rooms", restrictToOwnOrg, roomController.createRoom);

module.exports = router;
