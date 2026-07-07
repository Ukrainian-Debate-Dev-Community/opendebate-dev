const express = require("express");
const router = express.Router();
const feedbackController = require("../controllers/feedbackController");
const {
  verifyToken,
  restrictToAdmin,
} = require("../middleware/authMiddleware");

router.use(verifyToken);

router.delete(
  "/:feedbackId",
  restrictToAdmin,
  feedbackController.deleteFeedback,
);

module.exports = router;
