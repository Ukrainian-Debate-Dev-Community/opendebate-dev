const {
  Feedback,
  Room,
  Round,
  RoomTeam,
  RoomSpeaker,
  RoomAdjudicator,
  EventParticipant,
  Team,
  sequelize,
} = require("../models");
const AppError = require("../utils/AppError");
const { hasEventPrivilege } = require("../middleware/authMiddleware");

const submitFeedback = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const roomId = req.params.roomId;
    const {
      adjudicator_id,
      issuer_participant_id,
      issuer_team_id,
      score,
      comment,
    } = req.body;

    if (!adjudicator_id || score === undefined) {
      throw new AppError("Adjudicator ID and score are required.", 400);
    }

    if (
      (issuer_participant_id && issuer_team_id) ||
      (!issuer_participant_id && !issuer_team_id)
    ) {
      throw new AppError(
        "Feedback must be issued by exactly one entity: either an issuer_participant_id OR an issuer_team_id.",
        400,
      );
    }

    const room = await Room.findByPk(roomId, { transaction });
    if (!room) throw new AppError("Room not found.", 404);
    if (room.status !== "completed") {
      throw new AppError(
        "Cannot submit feedback. The room is not yet completed.",
        409,
      );
    }

    const validAdjudicator = await RoomAdjudicator.findOne({
      where: { room_id: roomId, participant_id: adjudicator_id },
      transaction,
    });
    if (!validAdjudicator) {
      throw new AppError(
        "The specified adjudicator did not judge in this room.",
        400,
      );
    }

    // verify the Issuer and check for duplicates
    let existingFeedback;
    if (issuer_team_id) {
      const validTeam = await RoomTeam.findOne({
        where: { room_id: roomId, team_id: issuer_team_id },
        transaction,
      });
      if (!validTeam)
        throw new AppError(
          "The specified team did not debate in this room.",
          400,
        );

      existingFeedback = await Feedback.findOne({
        where: { room_id: roomId, adjudicator_id, issuer_team_id },
        transaction,
      });
    } else {
      const validSpeaker = await RoomSpeaker.findOne({
        where: { participant_id: issuer_participant_id },
        include: [
          { model: RoomTeam, where: { room_id: roomId }, required: true },
        ],
        transaction,
      });
      if (!validSpeaker)
        throw new AppError(
          "The specified speaker did not debate in this room.",
          400,
        );

      existingFeedback = await Feedback.findOne({
        where: { room_id: roomId, adjudicator_id, issuer_participant_id },
        transaction,
      });
    }

    if (existingFeedback) {
      throw new AppError(
        "Feedback has already been submitted for this adjudicator by this issuer.",
        409,
      );
    }

    const newFeedback = await Feedback.create(
      {
        room_id: roomId,
        adjudicator_id,
        issuer_participant_id: issuer_participant_id || null,
        issuer_team_id: issuer_team_id || null,
        score,
        comment: comment || null,
      },
      { transaction },
    );

    await transaction.commit();
    res.status(201).json({ status: "success", data: newFeedback });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

const getEventFeedback = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;

    const isAuthorised = await hasEventPrivilege(
      req.user.id,
      req.user.isAdmin,
      Number(eventId),
    );
    if (!isAuthorised) {
      throw new AppError(
        "Only tournament Organisers can view all feedback records.",
        403,
      );
    }

    const feedbackRecords = await Feedback.findAll({
      include: [
        {
          model: Room,
          required: true,
          include: [
            { model: Round, required: true, where: { event_id: eventId } },
          ],
        },
        {
          model: EventParticipant,
          as: "Adjudicator",
          attributes: ["id", "display_name"],
        },
        {
          model: EventParticipant,
          as: "IssuerParticipant",
          attributes: ["id", "display_name"],
        },
        { model: Team, as: "IssuerTeam", attributes: ["id", "name"] },
      ],
      order: [["id", "DESC"]],
    });

    res.status(200).json({ status: "success", data: feedbackRecords });
  } catch (error) {
    next(error);
  }
};

const deleteFeedback = async (req, res, next) => {
  try {
    const feedbackId = req.params.feedbackId;
    const feedback = await Feedback.findByPk(feedbackId);

    if (!feedback) throw new AppError("Feedback record not found.", 404);

    await feedback.destroy();

    res.status(200).json({
      status: "success",
      message: "Feedback record deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitFeedback,
  getEventFeedback,
  deleteFeedback,
};
