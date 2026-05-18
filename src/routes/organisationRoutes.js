const express = require("express");
const router = express.Router();
const orgController = require("../controllers/organisationController");
const {
  verifyToken,
  restrictToAdmin,
  restrictToOwnOrg,
} = require("../middleware/authMiddleware");

router.use(verifyToken);

router.get("/", orgController.getAllOrganisations);
router.get("/:id", orgController.getOrganisation);

router.post("/", restrictToAdmin, orgController.createOrganisation);
router.put("/:id", restrictToOwnOrg, orgController.updateOrganisation);
router.delete("/:id", restrictToOwnOrg, orgController.deleteOrganisation);

router.post("/:id/owners", restrictToOwnOrg, orgController.addOwner);
router.delete(
  "/:id/owners/:ownerId",
  restrictToAdmin,
  orgController.removeOwner,
);

module.exports = router;
