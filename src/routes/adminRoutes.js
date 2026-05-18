const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const {
  verifyToken,
  restrictToAdmin,
} = require("../middleware/authMiddleware");

router.use(verifyToken);

router.post("/grant", restrictToAdmin, adminController.grantAdmin);

module.exports = router;
