const express = require("express");
const router = express.Router();
const formatController = require("../controllers/formatController");
const {
  verifyToken,
  restrictToAdmin,
} = require("../middleware/authMiddleware");

router.use(verifyToken);

router.get("/", formatController.getAllFormats);
router.get("/:id", formatController.getFormat);

router.post("/", restrictToAdmin, formatController.createFormat);
router.put("/:id", restrictToAdmin, formatController.updateFormat);
router.delete("/:id", restrictToAdmin, formatController.deleteFormat);

module.exports = router;
