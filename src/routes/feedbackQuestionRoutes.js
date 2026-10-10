const express = require("express");
const router = express.Router({ mergeParams: true });
const feedbackQuestionController = require("../controllers/feedbackQuestionController");
const { restrictToOwnOrg } = require("../middleware/authMiddleware");

// inherited path /api/events/:eventId/feedback-questions
// anyone signed in reads the form; the event's owners/organisers edit it
router.get("/", feedbackQuestionController.getQuestions);
router.post("/", restrictToOwnOrg, feedbackQuestionController.createQuestion);
router.patch(
  "/:questionId",
  restrictToOwnOrg,
  feedbackQuestionController.updateQuestion,
);
router.delete(
  "/:questionId",
  restrictToOwnOrg,
  feedbackQuestionController.deleteQuestion,
);

module.exports = router;
