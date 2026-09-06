const crypto = require("crypto");
const {
  EventParticipant,
  User,
  Team,
  TeamMember,
  RoomAdjudicator,
  sequelize,
} = require("../models");
const AppError = require("../utils/AppError");
const { destroyOrArchive, restoreRecord } = require("../utils/lifecycle");
const { hasEventPrivilege } = require("../middleware/authMiddleware");

const addParticipant = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;
    let { user_id, display_name, role } = req.body;
    const callerId = req.user.id;
    const isAdmin = req.user.isAdmin;

    if (!display_name || !role) {
      throw new AppError("Display name and role are required.", 400);
    }

    // determine if the caller has any privileges for this event
    const isPrivileged = await hasEventPrivilege(
      callerId,
      isAdmin,
      Number(eventId),
    );

    if (!isPrivileged) {
      // if a standard user tries to register someone else, block it
      if (user_id && user_id !== callerId) {
        throw new AppError(
          "Unauthorised: You can only register yourself for this event.",
          403,
        );
      }
      user_id = callerId;
    }

    let claimToken = null;
    let claimTokenHash = null;

    if (!user_id) {
      if (!isPrivileged) {
        throw new AppError(
          "Unauthorised: Only tournament Organisers can create guest participants.",
          403,
        );
      }

      claimToken = crypto.randomBytes(16).toString("hex");
      claimTokenHash = crypto
        .createHash("sha256")
        .update(claimToken)
        .digest("hex");
    } else {
      const existingUser = await User.findByPk(user_id);
      if (!existingUser || existingUser.is_deleted)
        throw new AppError("User not found.", 404);

      const alreadyJoined = await EventParticipant.findOne({
        where: { event_id: eventId, user_id },
      });
      if (alreadyJoined) {
        throw new AppError("User is already a participant in this event.", 409);
      }
    }

    const participant = await EventParticipant.create({
      event_id: eventId,
      user_id: user_id || null,
      display_name,
      role,
      claim_token_hash: claimTokenHash,
    });

    const responseData = participant.toJSON();

    // only return the raw token once during creation
    if (claimToken) {
      responseData.raw_claim_token = claimToken;
      delete responseData.claim_token_hash; // hide the hash
    }

    res.status(201).json({ status: "success", data: responseData });
  } catch (error) {
    next(error);
  }
};

const getEventParticipants = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;

    // pagination variables
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = (page - 1) * limit;

    const { count, rows } = await EventParticipant.findAndCountAll({
      where: { event_id: eventId },
      attributes: { exclude: ["claim_token_hash"] }, // no tokens
      limit: limit,
      offset: offset,
      order: [["id", "ASC"]],
    });

    res.status(200).json({
      status: "success",
      data: {
        total_participants: count,
        total_pages: Math.ceil(count / limit),
        current_page: page,
        participants: rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateParticipant = async (req, res, next) => {
  try {
    const { participantId } = req.params;
    const { display_name, role } = req.body;

    const participant = await EventParticipant.findOne({
      where: { id: participantId, event_id: req.params.eventId },
      paranoid: false,
    });
    if (!participant)
      throw new AppError("Participant not found in this event.", 404);

    if (display_name) participant.display_name = display_name;
    if (role) participant.role = role;

    await participant.save();

    res.status(200).json({ status: "success", data: participant });
  } catch (error) {
    next(error);
  }
};

const updateEliminations = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { status, team_ids, participant_ids } = req.body;

    if (typeof status !== "boolean") {
      throw new AppError("A boolean 'status' field is required.", 400);
    }

    const hasTeams = Array.isArray(team_ids) && team_ids.length > 0;
    const hasParticipants =
      Array.isArray(participant_ids) && participant_ids.length > 0;

    if (!hasTeams && !hasParticipants) {
      throw new AppError(
        "Please provide at least one team_id or participant_id to update.",
        400,
      );
    }

    if (hasParticipants) {
      const participants = await EventParticipant.findAll({
        where: { id: participant_ids, event_id: eventId },
        attributes: ["id", "role"],
      });

      const hasAdjudicator = participants.some((p) => p.role === "adjudicator");
      if (hasAdjudicator) {
        throw new AppError(
          "Adjudicators cannot be eliminated. Please remove them from the participant_ids array.",
          400,
        );
      }
    }

    if (hasTeams) {
      await Team.update(
        { is_eliminated: status },
        { where: { id: team_ids, event_id: eventId } },
      );
    }

    if (hasParticipants) {
      await EventParticipant.update(
        { is_eliminated: status },
        { where: { id: participant_ids, event_id: eventId } },
      );
    }

    res.status(200).json({
      status: "success",
      message: `Elimination status successfully set to ${status}.`,
    });
  } catch (error) {
    next(error);
  }
};

const removeParticipant = async (req, res, next) => {
  try {
    const { participantId } = req.params;
    const participant = await EventParticipant.findOne({
      where: { id: participantId, event_id: req.params.eventId },
    });
    if (!participant)
      throw new AppError("Participant not found in this event.", 404);

    // refuse removal while the participant is still attached to debate
    // state — pulling them out from under a team/room would orphan scores
    // and leave teams short-handed mid-round.
    const onTeam = await TeamMember.findOne({
      where: { participant_id: participantId },
    });
    if (onTeam) {
      throw new AppError(
        "Cannot remove participant: still a member of a team. Remove them from the team first.",
        409,
      );
    }

    const isAdjudicator = await RoomAdjudicator.findOne({
      where: { participant_id: participantId },
    });
    if (isAdjudicator) {
      throw new AppError(
        "Cannot remove participant: still assigned as a room adjudicator. Reassign the room first.",
        409,
      );
    }

    const outcome = await destroyOrArchive(participant, req);

    res
      .status(200)
      .json({ status: "success", message: `Participant ${outcome}.` });
  } catch (error) {
    next(error);
  }
};

const claimIdentity = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { participantId } = req.params;
    const { claim_token } = req.body;
    const userId = req.user.id; // from authMiddleware

    if (!claim_token) throw new AppError("Please provide a claim token.", 400);

    // row-lock the participant for the duration of this txn to prevent two
    // concurrent claims both passing the user_id == null check.
    const participant = await EventParticipant.findByPk(participantId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!participant) throw new AppError("Participant not found.", 404);

    if (participant.user_id) {
      throw new AppError(
        "This participant record has already been claimed.",
        409,
      );
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(claim_token)
      .digest("hex");
    if (participant.claim_token_hash !== tokenHash) {
      throw new AppError("Invalid claim token.", 401);
    }

    participant.user_id = userId;
    participant.claim_token_hash = null;
    participant.claim_token_used_at = new Date();
    await participant.save({ transaction });

    await transaction.commit();

    res.status(200).json({
      status: "success",
      message:
        "Identity claimed successfully. Statistics have been linked to your account.",
      data: participant,
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

const restoreParticipant = async (req, res, next) => {
  try {
    const participant = await restoreRecord(EventParticipant, {
      id: req.params.participantId,
      event_id: req.params.eventId,
    });
    res.status(200).json({ status: "success", data: participant });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addParticipant,
  getEventParticipants,
  updateParticipant,
  updateEliminations,
  removeParticipant,
  restoreParticipant,
  claimIdentity,
};
