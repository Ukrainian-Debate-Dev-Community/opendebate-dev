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
router.get("/:organisationId", orgController.getOrganisation);

router.post("/", restrictToAdmin, orgController.createOrganisation);
router.put(
  "/:organisationId",
  restrictToOwnOrg,
  orgController.updateOrganisation,
);
router.delete(
  "/:organisationId",
  restrictToAdmin,
  orgController.deleteOrganisation,
);
router.patch(
  "/:organisationId/restore",
  restrictToAdmin,
  orgController.restoreOrganisation,
);

router.post(
  "/:organisationId/owners",
  restrictToOwnOrg,
  orgController.addOwner,
);
router.delete(
  "/:organisationId/owners/:ownerId",
  restrictToAdmin,
  orgController.removeOwner,
);

module.exports = router;
