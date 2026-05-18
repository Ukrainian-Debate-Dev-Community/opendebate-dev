const express = require("express");
const router = express.Router({ mergeParams: true });
const motionController = require("../controllers/motionController");
const { restrictToOwnOrg } = require("../middleware/authMiddleware");

// inherited path /api/events/:eventId/motions
router.get("/", motionController.getMotions);
router.get("/:motionId", motionController.getMotionById);

router.post("/", restrictToOwnOrg, motionController.createMotion);
router.put("/:motionId", restrictToOwnOrg, motionController.updateMotion);
router.delete("/:motionId", restrictToOwnOrg, motionController.deleteMotion);

module.exports = router;
