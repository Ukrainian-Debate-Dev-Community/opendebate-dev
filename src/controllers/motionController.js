const { Motion, Event } = require("../models");
const AppError = require("../utils/AppError");
const { hasEventPrivilege } = require("../middleware/authMiddleware");

const createMotion = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;
    const { motion_text, infoslide, is_released } = req.body;

    if (!motion_text)
      throw new AppError("Please provide the motion_text.", 400);

    // verify the event exists (and isn't soft-deleted) before insert,
    // so we return a clean 404 instead of a DB FK violation.
    const event = await Event.findByPk(eventId);
    if (!event || event.is_deleted) {
      throw new AppError("Event not found.", 404);
    }

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
    const motions = await Motion.findAll({
      where: { event_id: eventId, is_deleted: false },
    });

    if (!motions || motions.length === 0) {
      throw new AppError("No motions found for this event.", 404);
    }

    // reuse shared privilege check instead of re-implementing owner/organiser
    // climbing here. Admin/owner/organiser see unreleased motions in full.
    const isAuthorisedViewer = await hasEventPrivilege(
      req.user.id,
      req.user.isAdmin,
      Number(eventId),
    );

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
      where: { id: motionId, event_id: req.params.eventId, is_deleted: false },
    });
    if (!motion) throw new AppError("Motion not found in this event.", 404);

    if (motion.is_released) {
      return res.status(200).json({ status: "success", data: motion });
    }

    const isAuthorisedViewer = await hasEventPrivilege(
      req.user.id,
      req.user.isAdmin,
      Number(eventId),
    );

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
    const { motionId } = req.params;
    const { motion_text, infoslide, is_released } = req.body;

    const motion = await Motion.findOne({
      where: { id: motionId, event_id: req.params.eventId, is_deleted: false },
    });
    if (!motion) throw new AppError("Motion not found in this event.", 404);

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

    const motion = await Motion.findOne({
      where: { id: motionId, event_id: req.params.eventId, is_deleted: false },
    });
    if (!motion) throw new AppError("Motion not found in this event.", 404);

    // soft-delete so rooms that used this motion preserve their
    // historical reference (the FK is SET NULL on hard delete, which would
    // erase which motion was actually debated).
    motion.is_deleted = true;
    await motion.save();

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
