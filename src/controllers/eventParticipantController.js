const crypto = require("crypto");
const { EventParticipant, User } = require("../models");
const AppError = require("../utils/AppError");

const addParticipant = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;
    const { user_id, display_name, role, is_waitlist } = req.body;

    if (!display_name || !role) {
      throw new AppError("Display name and role are required.", 400);
    }

    let claimToken = null;
    let claimTokenHash = null;

    if (!user_id) {
      // Guest Registration
      claimToken = crypto.randomBytes(16).toString("hex");
      claimTokenHash = crypto
        .createHash("sha256")
        .update(claimToken)
        .digest("hex");
    } else {
      // Platform User Registration
      const existingUser = await User.findByPk(user_id);
      if (!existingUser) throw new AppError("User not found.", 404);

      const alreadyJoined = await EventParticipant.findOne({
        where: { event_id: eventId, user_id },
      });
      if (alreadyJoined) {
        throw new AppError("User is already a participant in this event.", 409);
      }
    }

    const participant = await EventParticipant.create({
      event_id: eventId,
      user_id: user_id || null,
      display_name,
      role,
      is_waitlist: is_waitlist || true,
      claim_token_hash: claimTokenHash,
    });

    const responseData = participant.toJSON();

    // only return the raw token once during creation
    if (claimToken) {
      responseData.raw_claim_token = claimToken;
      delete responseData.claim_token_hash; // hide the hash
    }

    res.status(201).json({ status: "success", data: responseData });
  } catch (error) {
    next(error);
  }
};

const getEventParticipants = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;
    const participants = await EventParticipant.findAll({
      where: { event_id: eventId },
      attributes: { exclude: ["claim_token_hash"] }, // no tokens
    });

    res.status(200).json({ status: "success", data: participants });
  } catch (error) {
    next(error);
  }
};

const updateParticipant = async (req, res, next) => {
  try {
    const { participantId } = req.params;
    const { display_name, role, is_waitlist } = req.body;

    const participant = await EventParticipant.findByPk(participantId);
    if (!participant) throw new AppError("Participant not found.", 404);

    if (display_name) participant.display_name = display_name;
    if (role) participant.role = role;
    if (is_waitlist !== undefined) participant.is_waitlist = is_waitlist;

    await participant.save();

    res.status(200).json({ status: "success", data: participant });
  } catch (error) {
    next(error);
  }
};

const removeParticipant = async (req, res, next) => {
  try {
    const { participantId } = req.params;
    const participant = await EventParticipant.findByPk(participantId);

    if (!participant) throw new AppError("Participant not found.", 404);

    await participant.destroy();

    res
      .status(200)
      .json({ status: "success", message: "Participant removed." });
  } catch (error) {
    next(error);
  }
};

const claimIdentity = async (req, res, next) => {
  try {
    const { participantId } = req.params;
    const { claim_token } = req.body;
    const userId = req.user.id; // from authMiddleware

    if (!claim_token) throw new AppError("Please provide a claim token.", 400);

    const participant = await EventParticipant.findByPk(participantId);
    if (!participant) throw new AppError("Participant not found.", 404);

    if (participant.user_id) {
      throw new AppError(
        "This participant record has already been claimed.",
        400,
      );
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(claim_token)
      .digest("hex");
    if (participant.claim_token_hash !== tokenHash) {
      throw new AppError("Invalid claim token.", 401);
    }

    participant.user_id = userId;
    participant.claim_token_hash = null;
    participant.claim_token_used_at = new Date();
    await participant.save();

    res.status(200).json({
      status: "success",
      message:
        "Identity claimed successfully. Statistics have been linked to your account.",
      data: participant,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addParticipant,
  getEventParticipants,
  updateParticipant,
  removeParticipant,
  claimIdentity,
};
