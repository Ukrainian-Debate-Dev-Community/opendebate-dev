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

router.delete("/:roomId", restrictToOwnOrg, roomController.deleteRoom);
router.post("/:roomId/scores", restrictToChair, scoreController.submitScores);

module.exports = router;
