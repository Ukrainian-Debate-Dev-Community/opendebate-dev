const {
  Feedback,
  Room,
  Round,
  RoomTeam,
  RoomSpeaker,
  RoomAdjudicator,
  EventParticipant,
  Team,
  TeamMember,
  FeedbackQuestion,
  FeedbackAnswer,
  sequelize,
} = require("../models");
const AppError = require("../utils/AppError");
const {
  cleanAnswers,
  answerValue,
  feedbackScore,
} = require("../utils/feedbackForm");
const { paginate } = require("../utils/pagination");
const { destroyOrArchive, restoreRecord } = require("../utils/lifecycle");
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
      answers,
    } = req.body;

    if (!adjudicator_id) {
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

    // the event's form: with counting questions the score comes from
    // the answers, otherwise the client sends it as before
    const round = await Round.findByPk(room.round_id, {
      paranoid: false,
      transaction,
    });
    const questions = await FeedbackQuestion.findAll({
      where: { event_id: round.event_id },
      transaction,
    });
    const scoredByForm = questions.some((q) => q.counts_in_score);
    if (scoredByForm && score !== undefined && score !== null) {
      throw new AppError(
        "This event scores feedback from its questions; send answers, not a score.",
        400,
      );
    }
    if (!scoredByForm && (score === undefined || score === null)) {
      throw new AppError("Adjudicator ID and score are required.", 400);
    }
    const answerRows = cleanAnswers(questions, answers);
    if (room.status !== "completed" && room.status !== "confirmed") {
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
        "The specified adjudicator did not adjudicate in this room.",
        400,
      );
    }

    // verify the Issuer, check user-ownership, and check for duplicates
    let existingFeedback;
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;

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

      // team can submit the feedback only by its member (claimed participant ==== user_id)
      //  or in case of a "free spot" of 1+ unclaimed participant
      if (!isAdmin) {
        const teamMembers = await TeamMember.findAll({
          where: { team_id: issuer_team_id },
          include: [{ model: EventParticipant, attributes: ["user_id"] }],
          transaction,
        });

        const isMember = teamMembers.some(
          (tm) => tm.EventParticipant.user_id === userId,
        );
        const hasUnclaimedSpot = teamMembers.some(
          (tm) => tm.EventParticipant.user_id === null,
        );

        if (!isMember && !hasUnclaimedSpot) {
          throw new AppError(
            "You can only submit collective feedback for a team you belong to.",
            403,
          );
        }
      }

      existingFeedback = await Feedback.findOne({
        where: { room_id: roomId, adjudicator_id, issuer_team_id },
        transaction,
      });
    } else {
      const validSpeaker = await RoomSpeaker.findOne({
        where: { participant_id: issuer_participant_id },
        include: [
          { model: RoomTeam, where: { room_id: roomId }, required: true },
          { model: EventParticipant, attributes: ["user_id"] },
        ],
        transaction,
      });
      if (!validSpeaker)
        throw new AppError(
          "The specified speaker did not debate in this room.",
          400,
        );

      // claimed participants should answer for themselves
      if (!isAdmin) {
        const participantUserId = validSpeaker.EventParticipant.user_id;

        if (participantUserId !== null && participantUserId !== userId) {
          throw new AppError("You can only submit feedback for yourself.", 403);
        }
      }

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
        score: scoredByForm ? null : score,
        comment: comment || null,
      },
      { transaction },
    );

    const savedAnswers = await FeedbackAnswer.bulkCreate(
      answerRows.map((row) => ({ ...row, feedback_id: newFeedback.id })),
      { transaction },
    );

    await transaction.commit();

    newFeedback.Answers = savedAnswers;
    res.status(201).json({
      status: "success",
      data: withForm(newFeedback, questions),
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// a feedback as clients read it: its answers by question key and its
// score (computed from the answers when the event's form counts them)
const withForm = (feedback, questions) => {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const counting = new Set(
    questions.filter((q) => q.counts_in_score).map((q) => q.id),
  );
  const answers = (feedback.Answers || []).filter((a) =>
    byId.has(a.question_id),
  );
  const plain = feedback.toJSON();
  delete plain.Answers;

  return {
    ...plain,
    score: feedbackScore(feedback, counting),
    answers: answers.map((a) => {
      const question = byId.get(a.question_id);
      return {
        key: question.key,
        label: question.label,
        value: answerValue(a, question),
      };
    }),
  };
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
        { model: FeedbackAnswer, as: "Answers" },
      ],
      order: [["id", "DESC"]],
      ...paginate(req.query),
    });

    const questions = await FeedbackQuestion.findAll({
      where: { event_id: eventId },
      paranoid: false,
    });

    res.status(200).json({
      status: "success",
      data: feedbackRecords.map((fb) => withForm(fb, questions)),
    });
  } catch (error) {
    next(error);
  }
};

const deleteFeedback = async (req, res, next) => {
  try {
    const feedbackId = req.params.feedbackId;
    const feedback = await Feedback.findByPk(feedbackId, {
      paranoid: false,
    });

    if (!feedback) throw new AppError("Feedback record not found.", 404);

    const outcome = await destroyOrArchive(feedback, req);

    res.status(200).json({
      status: "success",
      message: `Feedback record ${outcome} successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

const restoreFeedback = async (req, res, next) => {
  try {
    const feedback = await restoreRecord(Feedback, {
      id: req.params.feedbackId,
    });
    res.status(200).json({ status: "success", data: feedback });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitFeedback,
  getEventFeedback,
  deleteFeedback,
  restoreFeedback,
};
