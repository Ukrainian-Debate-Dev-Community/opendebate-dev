const { Session, User, Waitlist } = require("../models/main");
const AppError = require("../utils/AppError");

// any authenticated user can join a scheduled session
const joinWaitlist = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;
    const userId = req.user.id;

    const session = await Session.findByPk(sessionId);
    if (!session || session.status !== "scheduled") {
      throw new AppError(
        "This session is not available for registration.",
        400,
      );
    }

    // prevent duplicate registrations
    const existingEntry = await Waitlist.findOne({
      where: { session_id: sessionId, user_id: userId },
    });

    if (existingEntry) {
      throw new AppError(
        "You are already on the waitlist for this session.",
        409,
      );
    }

    await Waitlist.create({ session_id: sessionId, user_id: userId });

    res.status(201).json({
      status: "success",
      message: "Successfully joined the waitlist.",
    });
  } catch (error) {
    next(error);
  }
};

const leaveWaitlist = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;
    const userId = req.user.id;

    const deletedCount = await Waitlist.destroy({
      where: { session_id: sessionId, user_id: userId },
    });

    if (deletedCount === 0) {
      throw new AppError("You are not on the waitlist for this session.", 404);
    }

    res
      .status(200)
      .json({ status: "success", message: "Removed from the waitlist." });
  } catch (error) {
    next(error);
  }
};

const getSessionWaitlist = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;

    const session = await Session.findByPk(sessionId, {
      include: [
        {
          model: User,
          as: "WaitlistedUsers",
          attributes: ["id", "username"],
          through: { attributes: [] },
        },
      ],
    });

    if (!session) throw new AppError("Session not found.", 404);

    res.status(200).json({
      status: "success",
      data: {
        session_id: session.id,
        registered_players: session.WaitlistedUsers,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  joinWaitlist,
  leaveWaitlist,
  getSessionWaitlist,
};
