const crypto = require("crypto");
const { Op } = require("sequelize");
const {
  Admin,
  Owner,
  Organizer,
  User,
  EventParticipant,
  sequelize,
} = require("../models");
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

// admin merges one user's participations into another account: a
// gateway that registered someone under a placeholder user (a guest)
// hands their history to the real account they later sign in with.
// Every participant row moves in one transaction; the emptied source
// is then anonymised exactly like anonymiseUser. Refused when both
// users hold a registration in the same event, or when the source
// carries anything besides participations (owner, organiser, admin).
const mergeUser = async (req, res, next) => {
  try {
    const { sourceUserId, targetUserId, displayName } = req.body;

    if (!sourceUserId || !targetUserId) {
      throw new AppError("Please provide sourceUserId and targetUserId.", 400);
    }
    if (Number(sourceUserId) === Number(targetUserId)) {
      throw new AppError("A user cannot be merged into itself.", 400);
    }
    if (
      displayName !== undefined &&
      (typeof displayName !== "string" || !displayName.trim())
    ) {
      throw new AppError("displayName must be a non-empty string.", 400);
    }

    let moved = 0;

    await sequelize.transaction(async (t) => {
      // one statement at a time: the transaction holds a single connection
      const source = await User.findByPk(sourceUserId, {
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      const target = await User.findByPk(targetUserId, {
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      if (!source || source.is_deleted)
        throw new AppError("Source user not found.", 404);
      if (!target || target.is_deleted)
        throw new AppError("Target user not found.", 404);

      let ties = 0;
      for (const model of [Admin, Owner, Organizer]) {
        ties += await model.count({
          where: { user_id: source.id },
          transaction: t,
        });
      }
      if (ties > 0) {
        throw new AppError(
          "The source user holds roles beyond participations and cannot be merged.",
          409,
        );
      }

      const sourceEvents = (
        await EventParticipant.findAll({
          where: { user_id: source.id },
          attributes: ["event_id"],
          transaction: t,
        })
      ).map((p) => p.event_id);

      const clash = await EventParticipant.findOne({
        where: { user_id: target.id, event_id: { [Op.in]: sourceEvents } },
        transaction: t,
      });
      if (clash) {
        throw new AppError(
          `Both users are registered in event ${clash.event_id}; remove one registration first.`,
          409,
        );
      }

      const changes = { user_id: target.id };
      if (displayName) changes.display_name = displayName.trim();

      [moved] = await EventParticipant.update(changes, {
        where: { user_id: source.id },
        paranoid: false,
        transaction: t,
      });

      source.username = `deleted_user_${source.id}`;
      source.password = crypto.randomBytes(32).toString("hex");
      source.is_deleted = true;
      await source.save({ transaction: t });
    });

    res.status(200).json({ status: "success", data: { moved } });
  } catch (error) {
    next(error);
  }
};

module.exports = { grantAdmin, anonymiseUser, mergeUser };
