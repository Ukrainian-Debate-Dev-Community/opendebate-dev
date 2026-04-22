const express = require("express");
const router = express.Router();
const holdingController = require("../controllers/holdingController");
const { authenticate, restrictTo } = require("../middleware/authMiddleware");

router.use(authenticate); // require login for everything

router.get("/", holdingController.getAllHoldings);
router.get("/:id", holdingController.getHolding);

// restricted
router.post("/", restrictTo("admin"), holdingController.createHolding);
router.put("/:id", restrictTo("owner"), holdingController.updateHolding);
router.delete("/:id", restrictTo("owner"), holdingController.deleteHolding);

router.post("/:id/owners", restrictTo("owner"), holdingController.addOwner);
router.delete(
  "/:id/owners/:ownerId",
  restrictTo("admin"),
  holdingController.removeOwner,
);

module.exports = router;
