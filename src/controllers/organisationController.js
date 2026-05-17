const { Organisation, Owner, User } = require("../models");
const AppError = require("../utils/AppError");

const createOrganisation = async (req, res, next) => {
  try {
    const { name, type, online, link, owner_id } = req.body;

    if (!name || !owner_id) {
      throw new AppError(
        "Please provide an organisation name and an initial owner_id.",
        400,
      );
    }

    if (type && !["academic", "personal"].includes(type)) {
      throw new AppError(
        "Organisation type must be strictly 'academic' or 'personal'.",
        400,
      );
    }

    // verify the designated owner actually exists
    const designatedOwner = await User.findByPk(owner_id);
    if (!designatedOwner || designatedOwner.is_deleted) {
      throw new AppError(
        "The designated owner does not exist or is deleted.",
        404,
      );
    }

    const newOrganisation = await Organisation.create({
      name,
      type: type || "academic",
      online: online || false,
      link: link || null,
    });

    await Owner.create({
      user_id: owner_id,
      organisation_id: newOrganisation.id,
    });

    res.status(201).json({ status: "success", data: newOrganisation });
  } catch (error) {
    next(error);
  }
};

const getAllOrganisations = async (req, res, next) => {
  try {
    const organisations = await Organisation.findAll({
      where: { status: "active", is_deleted: false },
    });
    res.status(200).json({ status: "success", data: organisations });
  } catch (error) {
    next(error);
  }
};

const getOrganisation = async (req, res, next) => {
  try {
    const organisation = await Organisation.findByPk(req.params.id, {
      include: [{ model: User, as: "Owners", attributes: ["id", "username"] }],
    });

    if (
      !organisation ||
      organisation.status !== "active" ||
      organisation.is_deleted
    ) {
      throw new AppError("Organisation not found.", 404);
    }
    res.status(200).json({ status: "success", data: organisation });
  } catch (error) {
    next(error);
  }
};

const updateOrganisation = async (req, res, next) => {
  try {
    const { name, type, online, link, status } = req.body;
    const organisation = await Organisation.findByPk(req.params.id);

    if (!organisation || organisation.is_deleted)
      throw new AppError("Organisation not found.", 404);

    if (type && !["academic", "personal"].includes(type)) {
      throw new AppError(
        "Organisation type must be strictly 'academic' or 'personal'.",
        400,
      );
    }

    organisation.name = name || organisation.name;
    if (type) organisation.type = type;
    organisation.online = online !== undefined ? online : organisation.online;
    organisation.link = link !== undefined ? link : organisation.link;
    if (status) organisation.status = status;

    await organisation.save();
    res.status(200).json({ status: "success", data: organisation });
  } catch (error) {
    next(error);
  }
};

const deleteOrganisation = async (req, res, next) => {
  try {
    const organisation = await Organisation.findByPk(req.params.id);

    if (!organisation) throw new AppError("Organisation not found.", 404);

    // Try Hard Delete
    await organisation.destroy();
    res.status(204).json({ status: "success", data: null });
  } catch (error) {
    // Soft Delete fallback
    if (error.name === "SequelizeForeignKeyConstraintError") {
      try {
        const orgToSoftDelete = await Organisation.findByPk(req.params.id);
        orgToSoftDelete.status = "inactive";
        orgToSoftDelete.is_deleted = true;
        await orgToSoftDelete.save();

        return res.status(200).json({
          status: "success",
          message:
            "Organisation has historical events. It has been deactivated instead of deleted.",
        });
      } catch (softDeleteError) {
        return next(softDeleteError);
      }
    }

    // if it was any other error, pass it to the global handler
    next(error);
  }
};

const addOwner = async (req, res, next) => {
  try {
    const organisationId = req.params.id;
    const { targetUserId } = req.body;

    if (!targetUserId)
      throw new AppError("Please provide the targetUserId.", 400);

    const targetUser = await User.findByPk(targetUserId);
    if (!targetUser) throw new AppError("User not found.", 404);

    const existingOwner = await Owner.findOne({
      where: { user_id: targetUserId, organisation_id: organisationId },
    });

    if (existingOwner)
      throw new AppError("User is already an owner of this Organisation.", 400);

    await Owner.create({
      user_id: targetUserId,
      organisation_id: organisationId,
    });

    res
      .status(201)
      .json({ status: "success", message: "Owner added successfully." });
  } catch (error) {
    next(error);
  }
};

const removeOwner = async (req, res, next) => {
  try {
    const organisationId = req.params.id;
    const ownerIdToRemove = req.params.ownerId;

    const ownerCount = await Owner.count({
      where: { organisation_id: organisationId },
    });
    if (ownerCount <= 1) {
      throw new AppError(
        "Cannot remove the last owner. Assign a new owner first or delete the Organisation.",
        400,
      );
    }

    const deletedCount = await Owner.destroy({
      where: { user_id: ownerIdToRemove, organisation_id: organisationId },
    });

    if (deletedCount === 0)
      throw new AppError(
        "This user is not an owner of this Organisation.",
        404,
      );

    res
      .status(200)
      .json({ status: "success", message: "Owner removed successfully." });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrganisation,
  getAllOrganisations,
  getOrganisation,
  updateOrganisation,
  deleteOrganisation,
  addOwner,
  removeOwner,
};
