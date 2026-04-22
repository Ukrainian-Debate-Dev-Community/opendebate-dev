const express = require("express");
const router = express.Router({ mergeParams: true });
const teamController = require("../controllers/teamController");
const { restrictTo } = require("../middleware/authMiddleware");

// base path is /sessions/:sessionId/teams
router.post("/register", teamController.registerTeam);
router.get("/", teamController.getSessionTeams);

router.post("/", restrictTo("owner"), teamController.createTeam);
router.put("/:teamId", restrictTo("owner"), teamController.updateTeam);
router.delete("/:teamId", restrictTo("owner"), teamController.deleteTeam);

module.exports = router;
