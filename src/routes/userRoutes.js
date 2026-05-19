const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const statsController = require("../controllers/statsController");
const participantController = require("../controllers/eventParticipantController");
const { verifyToken } = require("../middleware/authMiddleware");

// public
router.post("/register", userController.createUser);
router.post("/login", userController.login);

router.use(verifyToken);

// self-management
router.put("/password", userController.updatePassword);
router.put("/username", userController.updateUsername);
router.delete("/", userController.deleteUser);

// stats and identity
router.get("/:id/stats", statsController.getUserStats);
router.post(
  "/claim-participant/:participantId",
  participantController.claimIdentity,
);

module.exports = router;
