const express = require("express");
const router = express.Router();
const roomController = require("../controllers/roomController");
const roundController = require("../controllers/roundController");
const {
  verifyToken,
  restrictToOwnOrg,
} = require("../middleware/authMiddleware");

router.use(verifyToken);

// rounds
router.get("/:roundId", roundController.getRoundById);
router.put("/:roundId", restrictToOwnOrg, roundController.updateRound);
router.delete("/:roundId", restrictToOwnOrg, roundController.deleteRound);
router.patch(
  "/:roundId/restore",
  restrictToOwnOrg,
  roundController.restoreRound,
);

// rooms
router.get("/:roundId/rooms", roomController.getRoundRooms);
router.post("/:roundId/rooms", restrictToOwnOrg, roomController.createRoom);

module.exports = router;
