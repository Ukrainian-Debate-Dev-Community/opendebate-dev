const {
  Room,
  RoomTeam,
  RoomSpeaker,
  RoomAdjudicator,
  EventParticipant,
  Format,
  Team,
  TeamMember,
  sequelize,
} = require("../models");
const AppError = require("../utils/AppError");

// hand-pick of format-determinated specifics
const createRoom = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const roundId = req.params.roundId;
    const { format_id, motion_id, teams, adjudicators } = req.body;
    // teams: [{ team_id: 1, position: 1 }, { team_id: 2, position: 2 }]
    // adjudicators: [{ participant_id: 5, role: 'chair' }, { participant_id: 6, role: 'panelist' }]

    if (!format_id || !teams || !adjudicators) {
      throw new AppError(
        "format_id, teams array, and adjudicators array are required.",
        400,
      );
    }

    const format = await Format.findByPk(format_id, { transaction });
    if (!format) throw new AppError("Format not found.", 404);

    const teamIds = teams.map((t) => t.team_id);
    const adjudicatorIds = adjudicators.map((adj) => adj.participant_id);

    // check for double-booked Teams
    const existingRoomTeams = await RoomTeam.findAll({
      where: { team_id: teamIds },
      include: [
        {
          model: Room,
          required: true,
          where: { round_id: roundId },
        },
      ],
      transaction,
    });

    if (existingRoomTeams.length > 0) {
      throw new AppError(
        "One or more teams are already assigned to a room in this round.",
        409,
      );
    }

    // check for double-booked Adjudicators
    const existingAdjudicators = await RoomAdjudicator.findAll({
      where: { participant_id: adjudicatorIds },
      include: [
        {
          model: Room,
          required: true,
          where: { round_id: roundId },
        },
      ],
      transaction,
    });

    if (existingAdjudicators.length > 0) {
      throw new AppError(
        "One or more adjudicators are already assigned to a room in this round.",
        409,
      );
    }

    // format validation
    if (teams.length !== format.teams_per_room) {
      throw new AppError(
        `Format '${format.code}' requires exactly ${format.teams_per_room} teams per room.`,
        400,
      );
    }

    const hasChair = adjudicators.some((adj) => adj.role === "chair");
    if (!hasChair) {
      throw new AppError(
        "A room must have at least one adjudicator with the role 'chair'.",
        400,
      );
    }

    const room = await Room.create(
      {
        round_id: roundId,
        format_id,
        motion_id: motion_id || null,
        status: "pending",
      },
      { transaction },
    );

    // attach Adjudicators
    const adjsToInsert = adjudicators.map((adj) => ({
      room_id: room.id,
      participant_id: adj.participant_id,
      role: adj.role,
    }));
    await RoomAdjudicator.bulkCreate(adjsToInsert, { transaction });

    // attach Teams and auto-generate Speakers in TeamMembers
    for (const teamData of teams) {
      const teamMembers = await TeamMember.findAll({
        where: { team_id: teamData.team_id },
        transaction,
      });

      if (teamMembers.length !== format.speakers_per_team) {
        throw new AppError(
          `Team ${teamData.team_id} does not have the required ${format.speakers_per_team} speakers for this format.`,
          400,
        );
      }

      const roomTeam = await RoomTeam.create(
        {
          room_id: room.id,
          team_id: teamData.team_id,
          position: teamData.position,
        },
        { transaction },
      );

      // map TeamMembers to RoomSpeakers based on their speaker_order
      const speakersToCreate = teamMembers.map((member) => ({
        room_team_id: roomTeam.id,
        participant_id: member.participant_id,
        speech_position: member.speaker_order,
      }));

      await RoomSpeaker.bulkCreate(speakersToCreate, { transaction });
    }

    await transaction.commit();
    res.status(201).json({
      status: "success",
      message: "Room created successfully based on format rules.",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

const getRoundRooms = async (req, res, next) => {
  try {
    const roundId = req.params.roundId;

    const rooms = await Room.findAll({
      where: { round_id: roundId },
      include: [
        { model: Format, attributes: ["name", "code"] },
        {
          model: RoomAdjudicator,
          attributes: ["id", "role"],
          include: [
            {
              model: EventParticipant,
              attributes: ["id", "display_name", "user_id"],
            },
          ],
        },
        {
          model: RoomTeam,
          attributes: ["id", "position", "rank"],
          include: [
            { model: Team, attributes: ["id", "name"] },
            {
              model: RoomSpeaker,
              attributes: ["id", "speech_position", "rank"],
            },
          ],
        },
      ],
    });

    res.status(200).json({ status: "success", data: rooms });
  } catch (error) {
    next(error);
  }
};

const deleteRoom = async (req, res, next) => {
  try {
    const room = await Room.findByPk(req.params.roomId);
    if (!room) throw new AppError("Room not found.", 404);

    await room.destroy();
    res
      .status(200)
      .json({ status: "success", message: "Room deleted successfully." });
  } catch (error) {
    next(error);
  }
};

module.exports = { createRoom, getRoundRooms, deleteRoom };
