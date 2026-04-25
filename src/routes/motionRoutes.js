const express = require("express");
const router = express.Router({ mergeParams: true });
const motionController = require("../controllers/motionController");
const { restrictTo } = require("../middleware/authMiddleware");

// base path is /sessions/:sessionId/motion
// anyone can try to fetch the motion
router.get("/", motionController.getMotion);

router.post("/", restrictTo("owner"), motionController.createMotion);
router.put("/", restrictTo("owner"), motionController.updateMotion);
router.delete("/", restrictTo("owner"), motionController.deleteMotion);

module.exports = router;
