const { Conflict, EventParticipant, Team } = require("../models");
const AppError = require("../utils/AppError");
const { destroyOrArchive, restoreRecord } = require("../utils/lifecycle");

const createConflict = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const {
      issuer_participant_id,
      target_participant_id,
      target_team_id,
      comment,
    } = req.body;

    if (!issuer_participant_id) {
      throw new AppError("An issuer_participant_id is required.", 400);
    }

    if (
      (target_participant_id && target_team_id) ||
      (!target_participant_id && !target_team_id)
    ) {
      throw new AppError(
        "A conflict must have exactly one target: either a target_participant_id OR a target_team_id.",
        400,
      );
    }

    if (issuer_participant_id === target_participant_id) {
      throw new AppError(
        "A participant cannot declare a conflict with themselves.",
        400,
      );
    }

    const issuer = await EventParticipant.findOne({
      where: { id: issuer_participant_id, event_id: eventId },
    });
    if (!issuer) {
      throw new AppError("Issuer participant not found in this event.", 404);
    }

    if (target_participant_id) {
      const targetParticipant = await EventParticipant.findOne({
        where: { id: target_participant_id, event_id: eventId },
      });
      if (!targetParticipant) {
        throw new AppError("Target participant not found in this event.", 404);
      }
    }

    if (target_team_id) {
      const targetTeam = await Team.findOne({
        where: { id: target_team_id, event_id: eventId },
      });
      if (!targetTeam) {
        throw new AppError("Target team not found in this event.", 404);
      }
    }

    const existingConflict = await Conflict.findOne({
      where: {
        event_id: eventId,
        issuer_participant_id,
        target_participant_id: target_participant_id || null,
        target_team_id: target_team_id || null,
      },
    });

    if (existingConflict) {
      throw new AppError("This conflict has already been logged.", 409);
    }

    const newConflict = await Conflict.create({
      event_id: eventId,
      issuer_participant_id,
      target_participant_id: target_participant_id || null,
      target_team_id: target_team_id || null,
      comment: comment || null,
    });

    res.status(201).json({ status: "success", data: newConflict });
  } catch (error) {
    next(error);
  }
};

const getEventConflicts = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const conflicts = await Conflict.findAll({
      where: { event_id: eventId },
      include: [
        {
          model: EventParticipant,
          as: "Issuer",
          attributes: ["id", "display_name", "role"],
        },
        {
          model: EventParticipant,
          as: "TargetParticipant",
          attributes: ["id", "display_name", "role"],
        },
        {
          model: Team,
          as: "TargetTeam",
          attributes: ["id", "name"],
        },
      ],
      order: [["id", "DESC"]],
    });

    res.status(200).json({ status: "success", data: conflicts });
  } catch (error) {
    next(error);
  }
};

const deleteConflict = async (req, res, next) => {
  try {
    const { eventId, conflictId } = req.params;

    const conflict = await Conflict.findOne({
      where: { id: conflictId, event_id: eventId },
      paranoid: false,
    });

    if (!conflict) {
      throw new AppError("Conflict record not found in this event.", 404);
    }

    const outcome = await destroyOrArchive(conflict, req);

    res.status(200).json({
      status: "success",
      message: `Conflict record ${outcome} successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

const restoreConflict = async (req, res, next) => {
  try {
    const conflict = await restoreRecord(Conflict, {
      id: req.params.conflictId,
      event_id: req.params.eventId,
    });
    res.status(200).json({ status: "success", data: conflict });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createConflict,
  getEventConflicts,
  deleteConflict,
  restoreConflict,
};
