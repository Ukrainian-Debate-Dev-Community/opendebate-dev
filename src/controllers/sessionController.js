const { Session, Holding } = require("../models/main");
const AppError = require("../utils/AppError");

const createSession = async (req, res, next) => {
  try {
    const { name, holding_id, date } = req.body;

    if (!name || !holding_id || !date) {
      throw new AppError("Please provide name, holding_id and date.", 400);
    }

    const newSession = await Session.create({
      holding_id: holding_id,
      name: name,
      date,
      status: "scheduled",
    });

    res.status(201).json({ status: "success", data: newSession });
  } catch (error) {
    next(error);
  }
};

// get all Sessions for a specific holding
const getHoldingSessions = async (req, res, next) => {
  try {
    const sessions = await Session.findAll({
      where: { holding_id: req.params.holdingId },
    });

    res.status(200).json({ status: "success", data: sessions });
  } catch (error) {
    next(error);
  }
};

const updateSession = async (req, res, next) => {
  try {
    const { name, date, status } = req.body;
    const session = await Session.findByPk(req.params.id);

    if (!session) throw new AppError("Session not found.", 404);

    session.name = name !== undefined ? name : session.name;
    session.date = date || session.date;
    session.status = status || session.status; // scheduled or archived

    await session.save();
    res.status(200).json({ status: "success", data: session });
  } catch (error) {
    next(error);
  }
};

const deleteSession = async (req, res, next) => {
  try {
    const session = await Session.findByPk(req.params.id);
    if (!session) throw new AppError("Session not found.", 404);

    // only Hard Delete, I don't care
    await session.destroy();

    res.status(204).json({ status: "success", data: null });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSession,
  getHoldingSessions,
  updateSession,
  deleteSession,
};
