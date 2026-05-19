const { Format } = require("../models");
const AppError = require("../utils/AppError");

const createFormat = async (req, res, next) => {
  try {
    const {
      name,
      code,
      teams_per_room,
      speakers_per_team,
      has_reply,
      score_min,
      score_max,
    } = req.body;

    if (
      !name ||
      !code ||
      teams_per_room == null ||
      speakers_per_team == null ||
      score_min == null ||
      score_max == null
    ) {
      throw new AppError("Please provide all required format parameters.", 400);
    }

    const existingFormat = await Format.findOne({ where: { code } });
    if (existingFormat) {
      throw new AppError(`A format with code ${code} already exists.`, 409);
    }

    const newFormat = await Format.create({
      name,
      code,
      teams_per_room,
      speakers_per_team,
      has_reply: has_reply || false,
      score_min,
      score_max,
    });

    res.status(201).json({ status: "success", data: newFormat });
  } catch (error) {
    next(error);
  }
};

const getAllFormats = async (req, res, next) => {
  try {
    const formats = await Format.findAll();
    res.status(200).json({ status: "success", data: formats });
  } catch (error) {
    next(error);
  }
};

const getFormat = async (req, res, next) => {
  try {
    const format = await Format.findByPk(req.params.id);
    if (!format) throw new AppError("Format not found.", 404);

    res.status(200).json({ status: "success", data: format });
  } catch (error) {
    next(error);
  }
};

const updateFormat = async (req, res, next) => {
  try {
    const format = await Format.findByPk(req.params.id);
    if (!format) throw new AppError("Format not found.", 404);

    const {
      name,
      code,
      teams_per_room,
      speakers_per_team,
      has_reply,
      score_min,
      score_max,
    } = req.body;

    if (name !== undefined) format.name = name;
    if (code !== undefined) format.code = code;
    if (teams_per_room !== undefined) format.teams_per_room = teams_per_room;
    if (speakers_per_team !== undefined)
      format.speakers_per_team = speakers_per_team;
    if (has_reply !== undefined) format.has_reply = has_reply;
    if (score_min !== undefined) format.score_min = score_min;
    if (score_max !== undefined) format.score_max = score_max;

    await format.save();
    res.status(200).json({ status: "success", data: format });
  } catch (error) {
    next(error);
  }
};

const deleteFormat = async (req, res, next) => {
  try {
    const format = await Format.findByPk(req.params.id);
    if (!format) throw new AppError("Format not found.", 404);

    await format.destroy();
    res
      .status(200)
      .json({ status: "success", message: "Format deleted successfully." });
  } catch (error) {
    if (error.name === "SequelizeForeignKeyConstraintError") {
      return next(
        new AppError(
          "Cannot delete format. It is currently being used by existing rooms.",
          400,
        ),
      );
    }
    next(error);
  }
};

module.exports = {
  createFormat,
  getAllFormats,
  getFormat,
  updateFormat,
  deleteFormat,
};
