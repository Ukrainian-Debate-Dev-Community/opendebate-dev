const { Motion, Event, Owner, Organizer } = require("../models");
const AppError = require("../utils/AppError");

const createMotion = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;
    const { motion_text, infoslide, is_released } = req.body;

    if (!motion_text)
      throw new AppError("Please provide the motion_text.", 400);

    const newMotion = await Motion.create({
      event_id: eventId,
      motion_text,
      infoslide: infoslide || null,
      is_released: is_released || false,
    });

    res.status(201).json({ status: "success", data: newMotion });
  } catch (error) {
    next(error);
  }
};

const getMotions = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;
    const motions = await Motion.findAll({ where: { event_id: eventId } });

    if (!motions || motions.length === 0) {
      throw new AppError("No motions found for this event.", 404);
    }

    let isAuthorisedViewer = false;
    if (req.user.isAdmin) {
      isAuthorisedViewer = true;
    } else {
      const event = await Event.findByPk(eventId);
      if (event) {
        const isOwner = await Owner.findOne({
          where: {
            user_id: req.user.id,
            organisation_id: event.organisation_id,
          },
        });
        // organizers has the authority as well
        const isOrganizer = await Organizer.findOne({
          where: { user_id: req.user.id, event_id: event.id },
        });

        if (isOwner || isOrganizer) isAuthorisedViewer = true;
      }
    }

    const processedMotions = motions.map((motion) => {
      if (motion.is_released || isAuthorisedViewer) {
        return motion;
      }
      return {
        id: motion.id,
        event_id: motion.event_id,
        motion_text: "Motion will be revealed later.",
        infoslide: null,
        is_released: false,
      };
    });

    res.status(200).json({ status: "success", data: processedMotions });
  } catch (error) {
    next(error);
  }
};

const getMotionById = async (req, res, next) => {
  try {
    const { eventId, motionId } = req.params;
    const motion = await Motion.findOne({
      where: { id: motionId, event_id: eventId },
    });

    if (!motion) throw new AppError("Motion not found.", 404);

    if (motion.is_released) {
      return res.status(200).json({ status: "success", data: motion });
    }

    // the same authorisation check as getMotions
    let isAuthorisedViewer = false;
    if (req.user.isAdmin) {
      isAuthorisedViewer = true;
    } else {
      const event = await Event.findByPk(eventId);
      if (event) {
        const isOwner = await Owner.findOne({
          where: {
            user_id: req.user.id,
            organisation_id: event.organisation_id,
          },
        });
        const isOrganizer = await Organizer.findOne({
          where: { user_id: req.user.id, event_id: event.id },
        });
        if (isOwner || isOrganizer) isAuthorisedViewer = true;
      }
    }

    if (isAuthorisedViewer) {
      return res.status(200).json({ status: "success", data: motion });
    }

    throw new AppError(
      "You do not have permission to view this unreleased motion.",
      403,
    );
  } catch (error) {
    next(error);
  }
};

const updateMotion = async (req, res, next) => {
  try {
    // now I will use the direct motionId
    const { motionId } = req.params;
    const { motion_text, infoslide, is_released } = req.body;

    const motion = await Motion.findByPk(motionId);
    if (!motion) throw new AppError("Motion not found.", 404);

    motion.motion_text = motion_text || motion.motion_text;
    motion.infoslide = infoslide !== undefined ? infoslide : motion.infoslide;
    if (is_released !== undefined) motion.is_released = is_released;

    await motion.save();

    res.status(200).json({ status: "success", data: motion });
  } catch (error) {
    next(error);
  }
};

const deleteMotion = async (req, res, next) => {
  try {
    const { motionId } = req.params;
    const motion = await Motion.findByPk(motionId);

    if (!motion) throw new AppError("Motion not found.", 404);

    await motion.destroy();

    res
      .status(200)
      .json({ status: "success", message: "Motion deleted successfully." });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createMotion,
  getMotions,
  getMotionById,
  updateMotion,
  deleteMotion,
};
