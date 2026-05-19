const { Organizer, User, Event } = require("../models");
const AppError = require("../utils/AppError");

const getEventOrganizers = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const organizers = await Organizer.findAll({
      where: { event_id: eventId },
      include: [
        {
          model: User,
          attributes: ["id", "username"], // exclude passwords
        },
      ],
    });

    res.status(200).json({
      status: "success",
      data: organizers,
    });
  } catch (error) {
    next(error);
  }
};

const addOrganizer = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      throw new AppError("Please provide a targetUserId.", 400);
    }

    const event = await Event.findByPk(eventId);
    if (!event) throw new AppError("Event not found.", 404);

    const user = await User.findByPk(targetUserId);
    if (!user) throw new AppError("User not found.", 404);

    const existingRole = await Organizer.findOne({
      where: { event_id: eventId, user_id: targetUserId },
    });

    if (existingRole) {
      throw new AppError(
        "This user is already an organiser for this event.",
        409,
      );
    }

    const newOrganizer = await Organizer.create({
      event_id: eventId,
      user_id: targetUserId,
    });

    res.status(201).json({
      status: "success",
      message: "Organiser role granted successfully.",
      data: newOrganizer,
    });
  } catch (error) {
    next(error);
  }
};

const removeOrganizer = async (req, res, next) => {
  try {
    const { eventId, targetUserId } = req.params;

    const organizerRecord = await Organizer.findOne({
      where: { event_id: eventId, user_id: targetUserId },
    });

    if (!organizerRecord) {
      throw new AppError("This user is not an organiser for this event.", 404);
    }

    await organizerRecord.destroy();

    res.status(200).json({
      status: "success",
      message: "Organiser role revoked successfully.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getEventOrganizers, addOrganizer, removeOrganizer };
