const express = require("express");
const router = express.Router();
const formatController = require("../controllers/formatController");
const {
  verifyToken,
  restrictToAdmin,
} = require("../middleware/authMiddleware");

router.use(verifyToken);

router.get("/", formatController.getAllFormats);
router.get("/:formatId", formatController.getFormat);

router.post("/", restrictToAdmin, formatController.createFormat);
router.put("/:formatId", restrictToAdmin, formatController.updateFormat);
router.delete("/:formatId", restrictToAdmin, formatController.deleteFormat);
router.patch(
  "/:formatId/restore",
  restrictToAdmin,
  formatController.restoreFormat,
);

module.exports = router;
