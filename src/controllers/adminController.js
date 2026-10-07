const crypto = require("crypto");
const { Admin, User, EventParticipant, sequelize } = require("../models");
const AppError = require("../utils/AppError");

// admin grants admin privileges to a standard user
const grantAdmin = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;

    if (!targetUserId) {
      throw new AppError("Please provide the targetUserId.", 400);
    }

    const targetUser = await User.findByPk(targetUserId);
    if (!targetUser || targetUser.is_deleted) {
      throw new AppError("User not found or is deleted.", 404);
    }

    const existingAdmin = await Admin.findOne({
      where: { user_id: targetUserId },
    });
    if (existingAdmin) {
      throw new AppError("This user is already an Admin.", 400);
    }

    await Admin.create({ user_id: targetUserId });

    res.status(200).json({
      status: "success",
      message: `Admin privileges successfully granted to user ${targetUserId}.`,
    });
  } catch (error) {
    next(error);
  }
};

// admin anonymises a user account: credentials and PII are scrubbed while
// every historical record (rooms, scores, standings) stays intact. Unlike
// self-service deleteUser, this never hard-deletes the row.
const anonymiseUser = async (req, res, next) => {
  try {
    const { targetUserId } = req.body;

    if (!targetUserId) {
      throw new AppError("Please provide the targetUserId.", 400);
    }

    await sequelize.transaction(async (t) => {
      const user = await User.findByPk(targetUserId, {
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      if (!user) throw new AppError("User not found.", 404);

      if (user.is_deleted) {
        throw new AppError("This user is already anonymised or deleted.", 409);
      }

      const anonymisedName = `deleted_user_${user.id}`;

      user.username = anonymisedName;
      user.password = crypto.randomBytes(32).toString("hex");
      user.is_deleted = true;
      await user.save({ transaction: t });

      // scrub the display names shown in historical rooms/standings, but
      // keep the participant rows (and their results) untouched otherwise.
      await EventParticipant.update(
        { display_name: anonymisedName },
        {
          where: { user_id: user.id },
          paranoid: false,
          transaction: t,
        },
      );
    });

    res.status(200).json({
      status: "success",
      message: `User ${targetUserId} anonymised successfully. Historical results were preserved.`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { grantAdmin, anonymiseUser };
