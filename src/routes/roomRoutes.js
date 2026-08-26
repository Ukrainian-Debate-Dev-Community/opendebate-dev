const express = require("express");
const router = express.Router();
const roomController = require("../controllers/roomController");
const scoreController = require("../controllers/scoreController");
const feedbackController = require("../controllers/feedbackController");
const {
  verifyToken,
  restrictToOwnOrg,
  restrictToChair,
} = require("../middleware/authMiddleware");

router.use(verifyToken);

// any user can submit the feedback
router.post("/:roomId/feedback", feedbackController.submitFeedback);

router.delete("/:roomId", restrictToOwnOrg, roomController.deleteRoom);
router.post("/:roomId/scores", restrictToChair, scoreController.submitScores);

module.exports = router;
