const express = require("express");
const router = express.Router({ mergeParams: true });
const conflictController = require("../controllers/conflictController");
const {
  verifyToken,
  restrictToOwnOrg,
} = require("../middleware/authMiddleware");

router.use(verifyToken);
router.use(restrictToOwnOrg);

router.route("/").get(conflictController.getEventConflicts);
router.route("/").post(conflictController.createConflict);

router.route("/:conflictId").delete(conflictController.deleteConflict);

module.exports = router;
