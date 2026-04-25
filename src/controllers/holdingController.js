const { Holding, Owner, User } = require("../models/main");
const AppError = require("../utils/AppError");

const createHolding = async (req, res, next) => {
  try {
    const { name, type, online, link, owner_id } = req.body;

    if (!name || !owner_id) {
      throw new AppError(
        "Please provide a holding name and an initial owner_id.",
        400,
      );
    }

    // controller-level validation for type
    if (type && !["academic", "personal"].includes(type)) {
      throw new AppError(
        "Holding type must be strictly 'academic' or 'personal'.",
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

    const newHolding = await Holding.create({
      name,
      type: type || "academic",
      online: online || false,
      link: link || null,
    });

    // link the designated user as the Owner
    await Owner.create({
      user_id: owner_id,
      holding_id: newHolding.id,
    });

    res.status(201).json({ status: "success", data: newHolding });
  } catch (error) {
    next(error);
  }
};

const getAllHoldings = async (req, res, next) => {
  try {
    const holdings = await Holding.findAll({ where: { status: "active" } });
    res.status(200).json({ status: "success", data: holdings });
  } catch (error) {
    next(error);
  }
};

const getHolding = async (req, res, next) => {
  try {
    const holding = await Holding.findByPk(req.params.id, {
      include: [{ model: User, as: "Owners", attributes: ["id", "username"] }],
    });

    if (!holding || holding.status !== "active")
      throw new AppError("Holding not found.", 404);
    res.status(200).json({ status: "success", data: holding });
  } catch (error) {
    next(error);
  }
};

const updateHolding = async (req, res, next) => {
  try {
    const { name, type, online, link, status } = req.body;
    const holding = await Holding.findByPk(req.params.id);

    if (!holding) throw new AppError("Holding not found.", 404);

    if (type && !["academic", "personal"].includes(type)) {
      throw new AppError(
        "Holding type must be strictly 'academic' or 'personal'.",
        400,
      );
    }

    holding.name = name || holding.name;
    if (type) holding.type = type;
    holding.online = online !== undefined ? online : holding.online;
    holding.link = link !== undefined ? link : holding.link;
    if (status) holding.status = status;

    await holding.save();
    res.status(200).json({ status: "success", data: holding });
  } catch (error) {
    next(error);
  }
};

const deleteHolding = async (req, res, next) => {
  try {
    const holding = await Holding.findByPk(req.params.id);

    if (!holding) throw new AppError("Holding not found.", 404);

    // try the Hard Delete
    await holding.destroy();

    res.status(204).json({ status: "success", data: null });
  } catch (error) {
    // if SQL Server blocked it due to historical data => Soft Delete
    if (error.name === "SequelizeForeignKeyConstraintError") {
      try {
        const holdingToSoftDelete = await Holding.findByPk(req.params.id);

        // flip the status to inactive
        holdingToSoftDelete.status = "inactive";
        await holdingToSoftDelete.save();

        return res.status(200).json({
          status: "success",
          message:
            "Holding has historical sessions. It has been deactivated instead of deleted.",
        });
      } catch (softDeleteError) {
        return next(softDeleteError);
      }
    }

    // if it was any other error, pass it to the global handler
    next(error);
  }
};

// add an Owner (can be done by existing Owner or Admin)
const addOwner = async (req, res, next) => {
  try {
    const holdingId = req.params.id; // /holdings/:id/owners
    const { targetUserId } = req.body;

    if (!targetUserId)
      throw new AppError("Please provide the targetUserId.", 400);

    const targetUser = await User.findByPk(targetUserId);
    if (!targetUser) throw new AppError("User not found.", 404);

    const existingOwner = await Owner.findOne({
      where: { user_id: targetUserId, holding_id: holdingId },
    });

    if (existingOwner)
      throw new AppError("User is already an owner of this Holding.", 400);

    await Owner.create({ user_id: targetUserId, holding_id: holdingId });

    res
      .status(201)
      .json({ status: "success", message: "Owner added successfully." });
  } catch (error) {
    next(error);
  }
};

// remove an Owner (restricted to Admins)
const removeOwner = async (req, res, next) => {
  try {
    const holdingId = req.params.id;
    const ownerIdToRemove = req.params.ownerId;

    // don't accidentally leave a Holding completely orphaned
    const ownerCount = await Owner.count({ where: { holding_id: holdingId } });
    if (ownerCount <= 1) {
      throw new AppError(
        "Cannot remove the last owner. Assign a new owner first or delete the Holding.",
        400,
      );
    }

    const deletedCount = await Owner.destroy({
      where: { user_id: ownerIdToRemove, holding_id: holdingId },
    });

    if (deletedCount === 0)
      throw new AppError("This user is not an owner of this Holding.", 404);

    res
      .status(200)
      .json({ status: "success", message: "Owner removed successfully." });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createHolding,
  getAllHoldings,
  getHolding,
  updateHolding,
  deleteHolding,
  addOwner,
  removeOwner,
};
