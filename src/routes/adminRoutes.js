const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const {
  verifyToken,
  restrictToAdmin,
} = require("../middleware/authMiddleware");

router.use(verifyToken);

router.post("/grant", restrictToAdmin, adminController.grantAdmin);
router.post("/anonymise", restrictToAdmin, adminController.anonymiseUser);

module.exports = router;
