const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticate, restrictTo } = require("../middleware/authMiddleware");

router.use(authenticate);

// only an Admin can grant another Admin
router.post("/grant", restrictTo("admin"), adminController.grantAdmin);

module.exports = router;
