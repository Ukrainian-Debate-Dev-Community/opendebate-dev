const { Event } = require("../models");
const AppError = require("../utils/AppError");

const createEvent = async (req, res, next) => {
  try {
    const { name, organisation_id, start_date, end_date, is_ranked } = req.body;

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

const getOrganisationEvents = async (req, res, next) => {
  try {
    const events = await Event.findAll({
      where: { organisation_id: req.params.organisationId, is_deleted: false },
    });

    res.status(200).json({ status: "success", data: events });
  } catch (error) {
    next(error);
  }
};

const updateEvent = async (req, res, next) => {
  try {
    const { name, start_date, end_date, status, is_ranked } = req.body;
    const event = await Event.findByPk(req.params.id);

    if (!event || event.is_deleted) throw new AppError("Event not found.", 404);

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
    const event = await Event.findByPk(req.params.id);
    if (!event) throw new AppError("Event not found.", 404);

    await event.destroy();
    res.status(204).json({ status: "success", data: null });
  } catch (error) {
    // Soft Delete if constraints block Hard Delete
    if (error.name === "SequelizeForeignKeyConstraintError") {
      try {
        const eventToSoftDelete = await Event.findByPk(req.params.id);
        eventToSoftDelete.is_deleted = true;
        await eventToSoftDelete.save();
        return res.status(200).json({
          status: "success",
          message: "Event deactivated due to historical records.",
        });
      } catch (softDeleteError) {
        return next(softDeleteError);
      }
    }
    next(error);
  }
};

module.exports = {
  createEvent,
  getOrganisationEvents,
  updateEvent,
  deleteEvent,
};
