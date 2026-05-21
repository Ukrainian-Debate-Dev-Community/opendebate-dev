const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const userController = require("../controllers/userController");
const statsController = require("../controllers/statsController");
const participantController = require("../controllers/eventParticipantController");
const { verifyToken } = require("../middleware/authMiddleware");

// tighter cap on login to slow brute-force; relies on `trust proxy` for real client IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    status: "fail",
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// public
router.post("/register", userController.createUser);
router.post("/login", loginLimiter, userController.login);

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
