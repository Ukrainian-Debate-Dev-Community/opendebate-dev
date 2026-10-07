const { Op } = require("sequelize");
const { Event, Organisation } = require("../models");
const AppError = require("../utils/AppError");
const { paginate } = require("../utils/pagination");
const { destroyOrArchive, restoreRecord } = require("../utils/lifecycle");

const checkEventAccess = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;

    const { hasEventPrivilege } = require("../middleware/authMiddleware");
    const isPrivileged = await hasEventPrivilege(userId, isAdmin, eventId);

    res.status(200).json({ status: "success", data: { isPrivileged } });
  } catch (error) {
    next(error);
  }
};

const createEvent = async (req, res, next) => {
  try {
    const { name, start_date, end_date, is_ranked } = req.body;
    const organisation_id = req.params.organisationId;

    if (!name || !organisation_id) {
      throw new AppError("Please provide a name and an organisation_id.", 400);
    }

    const newEvent = await Event.create({
      organisation_id,
      name,
      start_date: start_date || null,
      end_date: end_date || null,
      status: "scheduled",
      is_ranked: is_ranked || false,
    });

    res.status(201).json({ status: "success", data: newEvent });
  } catch (error) {
    next(error);
  }
};

// unauthenticated listing — opt-in ?limit/?page pagination like every
// other list endpoint (omitting limit returns the complete list)
const listPublicEvents = async (req, res, next) => {
  try {
    const { status, from, to } = req.query;

    if (status && !["scheduled", "in_progress", "completed"].includes(status)) {
      throw new AppError("Invalid status state.", 400);
    }

    const where = {};
    if (status) where.status = status;

    const startDateRange = {};
    if (from) {
      const fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        throw new AppError("Invalid from date.", 400);
      }
      startDateRange[Op.gte] = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        throw new AppError("Invalid to date.", 400);
      }
      startDateRange[Op.lte] = toDate;
    }
    if (from || to) where.start_date = startDateRange;

    const events = await Event.findAll({
      where,
      attributes: [
        "id",
        "name",
        "start_date",
        "end_date",
        "status",
        "is_ranked",
      ],
      include: [{ model: Organisation, attributes: ["id", "name"] }],
      order: [["id", "ASC"]],
      ...paginate(req.query),
    });

    res.status(200).json({ status: "success", data: events });
  } catch (error) {
    next(error);
  }
};

const getOrganisationEvents = async (req, res, next) => {
  try {
    const includeArchived = req.query.include_archived === "true";
    const events = await Event.findAll({
      where: { organisation_id: req.params.organisationId },
      paranoid: !includeArchived,
      order: [["id", "ASC"]],
      ...paginate(req.query),
    });

    res.status(200).json({ status: "success", data: events });
  } catch (error) {
    next(error);
  }
};

const getEventById = async (req, res, next) => {
  try {
    const event = await Event.findByPk(req.params.eventId);
    if (!event) throw new AppError("Event not found.", 404);

    res.status(200).json({ status: "success", data: event });
  } catch (error) {
    next(error);
  }
};

const updateEvent = async (req, res, next) => {
  try {
    const { name, start_date, end_date, status, is_ranked } = req.body;
    const event = await Event.findByPk(req.params.eventId);

    if (!event) throw new AppError("Event not found.", 404);

    if (status && !["scheduled", "in_progress", "completed"].includes(status)) {
      throw new AppError("Invalid status state.", 400);
    }

    event.name = name !== undefined ? name : event.name;
    event.start_date = start_date !== undefined ? start_date : event.start_date;
    event.end_date = end_date !== undefined ? end_date : event.end_date;
    if (status) event.status = status;
    if (is_ranked !== undefined) event.is_ranked = is_ranked;

    await event.save();
    res.status(200).json({ status: "success", data: event });
  } catch (error) {
    next(error);
  }
};

const deleteEvent = async (req, res, next) => {
  try {
    const event = await Event.findByPk(req.params.eventId, {
      paranoid: false,
    });
    if (!event) throw new AppError("Event not found.", 404);

    const outcome = await destroyOrArchive(event, req);
    res.status(200).json({
      status: "success",
      message: `Event ${outcome} successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

const restoreEvent = async (req, res, next) => {
  try {
    const event = await restoreRecord(Event, { id: req.params.eventId });
    res.status(200).json({ status: "success", data: event });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkEventAccess,
  createEvent,
  listPublicEvents,
  getOrganisationEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  restoreEvent,
};
