const { FeedbackQuestion, FeedbackAnswer, Event } = require("../models");
const AppError = require("../utils/AppError");
const { cleanQuestion } = require("../utils/feedbackForm");

const requireEvent = async (eventId) => {
  const event = await Event.findByPk(eventId);
  if (!event) throw new AppError("Event not found.", 404);
  return event;
};

// the writable fields of a question, only those present
const pick = ({
  key,
  label,
  type,
  min_value,
  max_value,
  choices,
  required,
  counts_in_score,
  position,
}) =>
  Object.fromEntries(
    Object.entries({
      key,
      label,
      type,
      min_value,
      max_value,
      choices,
      required,
      counts_in_score,
      position,
    }).filter(([, value]) => value !== undefined),
  );

const keyTaken = async (eventId, key, exceptId) => {
  const other = await FeedbackQuestion.findOne({
    where: { event_id: eventId, key },
  });
  return other && other.id !== exceptId;
};

// recorded feedback keeps its meaning: an answered question is fixed
const requireUnanswered = async (question) => {
  const answered = await FeedbackAnswer.count({
    where: { question_id: question.id },
  });
  if (answered > 0) {
    throw new AppError(
      "This question already has answers; it cannot be changed or removed.",
      409,
    );
  }
};

const findQuestion = async (req) => {
  const question = await FeedbackQuestion.findOne({
    where: { id: req.params.questionId, event_id: req.params.eventId },
  });
  if (!question) throw new AppError("Feedback question not found.", 404);
  return question;
};

// GET /api/events/:eventId/feedback-questions — the event's feedback form
const getQuestions = async (req, res, next) => {
  try {
    await requireEvent(req.params.eventId);
    const questions = await FeedbackQuestion.findAll({
      where: { event_id: req.params.eventId },
      order: [
        ["position", "ASC"],
        ["id", "ASC"],
      ],
    });
    res.status(200).json({ status: "success", data: questions });
  } catch (error) {
    next(error);
  }
};

// POST /api/events/:eventId/feedback-questions
const createQuestion = async (req, res, next) => {
  try {
    const eventId = Number(req.params.eventId);
    await requireEvent(eventId);
    const attrs = cleanQuestion(pick(req.body || {}));

    if (await keyTaken(eventId, attrs.key)) {
      throw new AppError(
        `A question with key ${attrs.key} already exists in this event.`,
        409,
      );
    }

    const question = await FeedbackQuestion.create({
      ...attrs,
      event_id: eventId,
    });
    res.status(201).json({ status: "success", data: question });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/events/:eventId/feedback-questions/:questionId
const updateQuestion = async (req, res, next) => {
  try {
    const question = await findQuestion(req);
    await requireUnanswered(question);

    const merged = {
      ...pick(question.get({ plain: true })),
      ...pick(req.body || {}),
    };
    const attrs = cleanQuestion(merged);

    if (await keyTaken(question.event_id, attrs.key, question.id)) {
      throw new AppError(
        `A question with key ${attrs.key} already exists in this event.`,
        409,
      );
    }

    await question.update(attrs);
    res.status(200).json({ status: "success", data: question });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/events/:eventId/feedback-questions/:questionId
const deleteQuestion = async (req, res, next) => {
  try {
    const question = await findQuestion(req);
    await requireUnanswered(question);
    await question.destroy();
    res
      .status(200)
      .json({ status: "success", message: "Feedback question removed." });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
};
