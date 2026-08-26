const { Round, Event } = require("../models");
const AppError = require("../utils/AppError");

const getEventRounds = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const rounds = await Round.findAll({
      where: { event_id: eventId },
      order: [["sequence", "ASC"]],
    });

    res.status(200).json({ status: "success", data: rounds });
  } catch (error) {
    next(error);
  }
};

const getRoundById = async (req, res, next) => {
  try {
    const { roundId } = req.params;
    const round = await Round.findByPk(roundId);

    if (!round) throw new AppError("Round not found.", 404);

    res.status(200).json({ status: "success", data: round });
  } catch (error) {
    next(error);
  }
};

const createRound = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { name, sequence, is_hidden } = req.body;

    if (!name || sequence === undefined) {
      throw new AppError("Please provide a name and a sequence number.", 400);
    }

    const event = await Event.findByPk(eventId);
    if (!event) throw new AppError("Event not found.", 404);

    if (event.status === "completed" || event.is_deleted) {
      throw new AppError(
        "Cannot add rounds to an event that is completed or deleted.",
        403,
      );
    }

    const existingSequence = await Round.findOne({
      where: { event_id: eventId, sequence },
    });

    if (existingSequence) {
      throw new AppError(
        `Sequence ${sequence} already exists for this event.`,
        409,
      );
    }

    const newRound = await Round.create({
      event_id: eventId,
      name,
      sequence,
      status: "draft",
      is_hidden: is_hidden !== undefined ? is_hidden : false,
    });

    res.status(201).json({ status: "success", data: newRound });
  } catch (error) {
    next(error);
  }
};

const updateRound = async (req, res, next) => {
  try {
    const { roundId } = req.params;
    const { name, sequence, status, is_hidden } = req.body;

    const round = await Round.findByPk(roundId);
    if (!round) throw new AppError("Round not found.", 404);

    if (round.status === "completed") {
      throw new AppError(
        "Cannot modify a round that has already been completed.",
        403,
      );
    }

    if (sequence !== undefined && sequence !== round.sequence) {
      if (round.status === "in_progress") {
        throw new AppError(
          "Cannot change the chronological sequence of a round that is actively in progress.",
          403,
        );
      }

      const existingSequence = await Round.findOne({
        where: { event_id: round.event_id, sequence },
      });

      if (existingSequence) {
        throw new AppError(
          `Sequence ${sequence} already exists for this event.`,
          409,
        );
      }

      round.sequence = sequence;
    }

    if (name) round.name = name;
    if (status) round.status = status;
    if (is_hidden !== undefined) round.is_hidden = is_hidden;

    await round.save();
    res.status(200).json({ status: "success", data: round });
  } catch (error) {
    next(error);
  }
};

const deleteRound = async (req, res, next) => {
  try {
    const { roundId } = req.params;
    const round = await Round.findByPk(roundId);

    if (!round) throw new AppError("Round not found.", 404);

    if (round.status === "in_progress" || round.status === "completed") {
      throw new AppError(`Cannot delete a round that is ${round.status}.`, 403);
    }

    await round.destroy();

    res.status(200).json({
      status: "success",
      message: "Round deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

const releaseAllRounds = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    await Round.update({ is_hidden: false }, { where: { event_id: eventId } });

    res.status(200).json({
      status: "success",
      message:
        "All rounds for this event have been released and are now visible.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEventRounds,
  getRoundById,
  createRound,
  updateRound,
  deleteRound,
  releaseAllRounds,
};
