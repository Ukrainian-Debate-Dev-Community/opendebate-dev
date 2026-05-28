const express = require("express");
const router = express.Router();
const roomController = require("../controllers/roomController");
const scoreController = require("../controllers/scoreController");
const {
  verifyToken,
  restrictToOwnOrg,
  restrictToChair,
} = require("../middleware/authMiddleware");

router.use(verifyToken);

// inherited path /api/rooms/:roomId
router.delete("/:roomId", restrictToOwnOrg, roomController.deleteRoom);
router.post("/:roomId/scores", restrictToChair, scoreController.submitScores);

module.exports = router;
