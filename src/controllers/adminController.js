const { Admin, User } = require("../models");
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

module.exports = { grantAdmin };
