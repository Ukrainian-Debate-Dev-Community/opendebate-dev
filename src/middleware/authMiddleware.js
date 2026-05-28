const jwt = require("jsonwebtoken");
const {
  User,
  Event,
  Room,
  Round,
  Team,
  Motion,
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

    // trust the `isAdmin` claim from the token; admin grant/revoke must re-issue.
    req.user = currentUser;
    req.user.isAdmin = !!decoded.isAdmin;

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new AppError("Session expired. Please log in again.", 401));
    }
    if (error.name === "JsonWebTokenError") {
      return next(new AppError("Invalid authentication token.", 401));
    }
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

// shared resolver — walks the available route params to the owning event.
// Memoised on `req` so a request that passes through multiple guards only pays once.
const resolveEventId = async (req) => {
  if (req._resolvedEventId !== undefined) return req._resolvedEventId;

  let eventId = req.params.eventId ? Number(req.params.eventId) : null;

  if (!eventId && req.params.roomId) {
    const room = await Room.findByPk(req.params.roomId, { include: [Round] });
    if (!room) throw new AppError("Room not found.", 404);
    eventId = room.Round.event_id;
  } else if (!eventId && req.params.teamId) {
    const team = await Team.findByPk(req.params.teamId, { include: [Round] });
    if (!team) throw new AppError("Team not found.", 404);
    eventId = team.Round.event_id;
  } else if (!eventId && req.params.roundId) {
    const round = await Round.findByPk(req.params.roundId);
    if (!round) throw new AppError("Round not found.", 404);
    eventId = round.event_id;
  } else if (!eventId && req.params.motionId) {
    const motion = await Motion.findByPk(req.params.motionId);
    if (!motion) throw new AppError("Motion not found.", 404);
    eventId = motion.event_id;
  } else if (!eventId && req.params.participantId) {
    const participant = await EventParticipant.findByPk(
      req.params.participantId,
    );
    if (!participant) throw new AppError("Participant not found.", 404);
    eventId = participant.event_id;
  } else if (!eventId && req.params.organizerId) {
    const organizer = await Organizer.findByPk(req.params.organizerId);
    if (!organizer) throw new AppError("Organizer not found.", 404);
    eventId = organizer.event_id;
  }

  req._resolvedEventId = eventId;
  return eventId;
};

// shared role check — admin OR owner-of-event-org OR organiser-of-event.
const hasEventPrivilege = async (userId, isAdmin, eventId) => {
  if (isAdmin) return true;
  if (!eventId) return false;

  const event = await Event.findByPk(eventId);
  if (!event) throw new AppError("Event not found.", 404);

  const isOwner = await Owner.findOne({
    where: { user_id: userId, organisation_id: event.organisation_id },
  });
  if (isOwner) return true;

  const isOrganizer = await Organizer.findOne({
    where: { user_id: userId, event_id: eventId },
  });
  if (isOrganizer) return true;

  return false;
};

// Owners and Organisers
const restrictToOwnOrg = async (req, res, next) => {
  try {
    const userId = req.user.id;

    if (req.user.isAdmin) return next();

    // formats are global resources — only admins may write them.
    if (req.params.formatId && !req.params.eventId) {
      throw new AppError(
        "Only an Admin can manage formats.",
        403,
      );
    }

    // org-scoped route with no event in scope: owner of the org passes.
    if (req.params.organisationId && !req.params.eventId) {
      const isOwner = await Owner.findOne({
        where: { user_id: userId, organisation_id: req.params.organisationId },
      });

      if (isOwner) return next();

      throw new AppError(
        "Only an Owner of this organisation can perform this action.",
        403,
      );
    }

    const eventId = await resolveEventId(req);

    if (!eventId) {
      throw new AppError(
        "Could not determine the Event context for this route.",
        400,
      );
    }

    if (await hasEventPrivilege(userId, false, eventId)) return next();

    throw new AppError(
      "You do not have Organiser or Owner privileges for this event.",
      403,
    );
  } catch (error) {
    next(error);
  }
};

// Chairs (with owner/organiser/admin fallback so they can fix a botched ballot)
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

    if (chairRecord) return next();

    // fall through to event-scoped privilege so owners/organisers can
    // recover a ballot when the chair is unavailable.
    const eventId = await resolveEventId(req);
    if (await hasEventPrivilege(userId, false, eventId)) return next();

    throw new AppError(
      "Unauthorised: Only the designated Chair (or an Owner/Organiser) can perform this action.",
      403,
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  verifyToken,
  restrictToAdmin,
  restrictToOwnOrg,
  restrictToChair,
  hasEventPrivilege,
};
