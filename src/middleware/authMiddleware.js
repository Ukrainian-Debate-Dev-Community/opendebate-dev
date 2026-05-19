const jwt = require("jsonwebtoken");
const {
  User,
  Admin,
  Event,
  Room,
  Round,
  Team,
  Owner,
  Organizer,
  RoomAdjudicator,
  EventParticipant,
} = require("../models");
const AppError = require("../utils/AppError");

// base Authenticator
const verifyToken = async (req, res, next) => {
  try {
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      throw new AppError(
        "You are not logged in. Please provide a valid token.",
        401,
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const currentUser = await User.findByPk(decoded.id);
    if (!currentUser || currentUser.is_deleted) {
      throw new AppError(
        "The user belonging to this token no longer exists.",
        401,
      );
    }

    const adminRecord = await Admin.findOne({
      where: { user_id: currentUser.id },
    });

    req.user = currentUser;
    req.user.isAdmin = !!adminRecord;

    next();
  } catch (error) {
    next(error);
  }
};

// Admin strict
const restrictToAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return next(
      new AppError(
        "You do not have permission to perform this action. Admin required.",
        403,
      ),
    );
  }
  next();
};

// Owners and Organisers
const restrictToOwnOrg = async (req, res, next) => {
  try {
    let eventId = req.params.eventId;
    const userId = req.user.id;

    if (req.user.isAdmin) return next();

    // climb up to find the event (room-round routing case)
    if (req.params.roomId) {
      const room = await Room.findByPk(req.params.roomId, { include: [Round] });
      if (!room) throw new AppError("Room not found.", 404);
      eventId = room.Round.event_id;
    } else if (req.params.teamId) {
      const team = await Team.findByPk(req.params.teamId, { include: [Round] });
      if (!team) throw new AppError("Team not found.", 404);
      eventId = team.Round.event_id;
    } else if (req.params.roundId) {
      const round = await Round.findByPk(req.params.roundId);
      if (!round) throw new AppError("Round not found.", 404);
      eventId = round.event_id;
    }

    if (!eventId) {
      throw new AppError(
        "Could not determine the Event context for this route.",
        400,
      );
    }

    const event = await Event.findByPk(eventId);
    if (!event) throw new AppError("Event not found.", 404);

    const isOwner = await Owner.findOne({
      where: { user_id: userId, organisation_id: event.organisation_id },
    });
    if (isOwner) return next();

    const isOrganizer = await Organizer.findOne({
      where: { user_id: userId, event_id: eventId },
    });
    if (isOrganizer) return next();

    throw new AppError(
      "You do not have Organiser or Owner privileges for this event.",
      403,
    );
  } catch (error) {
    next(error);
  }
};

// Chairs
const restrictToChair = async (req, res, next) => {
  try {
    const roomId = req.params.roomId;
    const userId = req.user.id;

    if (req.user.isAdmin) return next();

    const chairRecord = await RoomAdjudicator.findOne({
      where: { room_id: roomId, role: "chair" },
      include: [
        {
          model: EventParticipant,
          where: { user_id: userId },
          required: true,
        },
      ],
    });

    if (!chairRecord) {
      throw new AppError(
        "Unauthorised: Only the designated Chair can perform this action.",
        403,
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  verifyToken,
  restrictToAdmin,
  restrictToOwnOrg,
  restrictToChair,
};
