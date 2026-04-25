const { Motion, Session, Owner } = require("../models/main");
const AppError = require("../utils/AppError");

const createMotion = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;
    const { motion_text, infoslide, is_released } = req.body;

    if (!motion_text) {
      throw new AppError("Please provide the motion_text.", 400);
    }

    // only one motion exists per session
    const existingMotion = await Motion.findOne({
      where: { session_id: sessionId },
    });
    if (existingMotion) {
      throw new AppError(
        "A motion already exists for this session. Please update it instead.",
        409,
      );
    }

    const newMotion = await Motion.create({
      session_id: sessionId,
      motion_text,
      infoslide: infoslide || null,
      is_released: is_released || false,
    });

    res.status(201).json({ status: "success", data: newMotion });
  } catch (error) {
    next(error);
  }
};

const getMotion = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;
    const motion = await Motion.findOne({ where: { session_id: sessionId } });

    if (!motion) throw new AppError("No motion found for this session.", 404);

    // if it's released => anyone can see it
    if (motion.is_released) {
      return res.status(200).json({ status: "success", data: motion });
    }

    // if it is NOT released => check if the user is an Admin or the Holding Owner
    let isAuthorizedViewer = false;

    if (req.user.isAdmin) {
      isAuthorizedViewer = true;
    } else {
      const session = await Session.findByPk(sessionId);
      const isOwner = await Owner.findOne({
        where: { user_id: req.user.id, holding_id: session.holding_id },
      });
      if (isOwner) isAuthorizedViewer = true;
    }

    if (isAuthorizedViewer) {
      return res.status(200).json({ status: "success", data: motion });
    }

    // if default User requesting unreleased motion => redact data
    const redactedMotion = {
      id: motion.id,
      session_id: motion.session_id,
      motion_text: "Motion will be revealed later.",
      infoslide: null,
      is_released: false,
    };

    res.status(200).json({ status: "success", data: redactedMotion });
  } catch (error) {
    next(error);
  }
};

const updateMotion = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;
    const { motion_text, infoslide, is_released } = req.body;

    const motion = await Motion.findOne({ where: { session_id: sessionId } });
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
    const sessionId = req.params.sessionId;
    const motion = await Motion.findOne({ where: { session_id: sessionId } });

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
  getMotion,
  updateMotion,
  deleteMotion,
};
