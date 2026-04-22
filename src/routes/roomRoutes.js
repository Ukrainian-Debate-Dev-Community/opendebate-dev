const express = require("express");
const router = express.Router({ mergeParams: true });
const roomController = require("../controllers/roomController");
const scoreController = require("../controllers/scoreController");
const { restrictTo } = require("../middleware/authMiddleware");

// base path is /sessions/:sessionId/rooms
router.get("/", roomController.getSessionRooms);
router.post("/", restrictTo("owner"), roomController.createRoom);
router.delete("/:roomId", restrictTo("owner"), roomController.deleteRoom);

// score-routing fits here since I need roomId to close it
// only the assigned Judge (or Owner) can submit score
router.put(
  "/:roomId/scores",
  restrictTo("judge"),
  scoreController.submitScores,
);

module.exports = router;
