const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

router.post("/", userController.createUser);
router.put("/:id/password", userController.updatePassword);
router.put("/:id/username", userController.updateUsername);
router.delete("/:id", userController.deleteUser);

module.exports = router;
