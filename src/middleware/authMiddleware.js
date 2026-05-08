const jwt = require("jsonwebtoken");
const { User, Admin, Owner, Room, Session, Team } = require("../models");
const AppError = require("../utils/AppError");

// base Authenticator
const authenticate = async (req, res, next) => {
  try {
    // check for standard Bearer token header
    const authHeader = req.headers["authorization"];

    // extract the token (from "Bearer <token>")
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      throw new AppError(
        "You are not logged in. Please provide a valid token.",
        401,
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ensure user still exists (in case they were deleted after token generation)
    const user = await User.findByPk(decoded.id);
    if (!user || user.is_deleted) {
      throw new AppError(
        "The user belonging to this token no longer exists.",
        401,
      );
    }

    req.user = user;

    // if user is an Admin, no need to check the other roles later
    const isAdmin = await Admin.findOne({ where: { user_id: user.id } });
    req.user.isAdmin = !!isAdmin; // attaches true or false

    next();
  } catch (error) {
    next(error);
  }
};

// contextual Authorization
const restrictTo = (role) => {
  return async (req, res, next) => {
    try {
      // Admins bypass all specific role checks
      if (req.user.isAdmin) return next();

      const userId = req.user.id;

      if (role === "owner") {
        let targetHoldingId;

        // creating a session (holding_id is in the body)
        if (req.body?.holding_id) {
          targetHoldingId = req.body.holding_id;
        }
        // direct Holding routes
        else if (req.baseUrl.includes("/holdings") && req.params.id) {
          targetHoldingId = req.params.id;
        }
        // Session routes (/:sessionId and /sessions/:id)
        else if (
          req.params.sessionId ||
          (req.baseUrl.includes("/sessions") && req.params.id)
        ) {
          const sessionIdToCheck = req.params.sessionId || req.params.id;
          const session = await Session.findByPk(sessionIdToCheck);
          if (!session) throw new AppError("Session not found.", 404);
          targetHoldingId = session.holding_id;
        }
        // Team routes (/teams/:teamId)
        else if (req.params.teamId) {
          const team = await Team.findByPk(req.params.teamId);
          if (!team) throw new AppError("Team not found.", 404);

          const sessionId = team.session_id;
          const session = await Session.findByPk(sessionId);

          if (!session)
            throw new AppError("Session for this team not found.", 404);

          targetHoldingId = session.holding_id;
        }
        // Room routes (/rooms/:roomId)
        else if (req.params.roomId) {
          const room = await Room.findByPk(req.params.roomId);
          if (!room) throw new AppError("Room not found.", 404);

          const sessionId = room.session_id || room.sessionId;
          const session = await Session.findByPk(sessionId);

          if (!session)
            throw new AppError("Session for this room not found.", 404);

          targetHoldingId = session.holding_id;
        }

        if (!targetHoldingId) {
          throw new AppError(
            "Could not determine which holding to check permissions for.",
            400,
          );
        }

        // does this user actually own the targeted holding
        const isOwner = await Owner.findOne({
          where: { user_id: userId, holding_id: targetHoldingId },
        });

        if (!isOwner) throw new AppError("You do not own this holding.", 403);
        return next();
      }

      if (role === "judge") {
        const resourceId = req.params.roomId || req.params.id;
        const room = await Room.findByPk(resourceId);

        if (!room) throw new AppError("Room not found.", 404);

        // check if the user is the assigned Judge
        if (room.judge === userId) {
          return next();
        }

        // if the user isn't the Judge, check if for Holding Owner
        const session = await Session.findByPk(room.session_id);
        if (!session)
          throw new AppError("session for this room not found.", 404);

        const isOwner = await Owner.findOne({
          where: { user_id: userId, holding_id: session.holding_id },
        });

        if (isOwner) {
          return next();
        }

        // if neither => block
        throw new AppError(
          "You must be the assigned judge or the holding owner to perform this action.",
          403,
        );
        return next();
      }

      throw new AppError("Unauthorized role.", 403);
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { authenticate, restrictTo };
