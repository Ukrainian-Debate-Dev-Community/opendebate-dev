const {
  Room,
  RoomTeam,
  RoomSpeaker,
  RoomAdjudicator,
  EventParticipant,
  Format,
  Team,
  TeamMember,
  Motion,
  Round,
  sequelize,
} = require("../models");
const AppError = require("../utils/AppError");

const createRoom = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const roundId = req.params.roundId;
    const { format_id, motion_id, teams, adjudicators } = req.body;

    if (!format_id) throw new AppError("format_id is required.", 400);
    if (!Array.isArray(teams) || teams.length === 0)
      throw new AppError("teams must be a non-empty array.", 400);
    if (!Array.isArray(adjudicators) || adjudicators.length === 0)
      throw new AppError("adjudicators must be a non-empty array.", 400);

    const ALLOWED_ADJ_ROLES = ["chair", "panelist", "trainee"];
    for (const adj of adjudicators) {
      if (!ALLOWED_ADJ_ROLES.includes(adj.role)) {
        throw new AppError(
          `Invalid adjudicator role '${adj.role}'. Allowed: ${ALLOWED_ADJ_ROLES.join(", ")}.`,
          400,
        );
      }
    }

    const format = await Format.findByPk(format_id, { transaction });
    if (!format) throw new AppError("Format not found.", 404);

    if (teams.length !== format.teams_per_room) {
      throw new AppError(
        `Format '${format.code}' requires exactly ${format.teams_per_room} teams per room.`,
        400,
      );
    }

    // team position check
    const providedPositions = teams
      .map((t) => t.position)
      .sort((a, b) => a - b);
    for (let i = 0; i < format.teams_per_room; i++) {
      if (providedPositions[i] !== i + 1) {
        throw new AppError(
          `Team positions must be a unique permutation from 1 to ${format.teams_per_room}.`,
          400,
        );
      }
    }

    const hasChair = adjudicators.some((adj) => adj.role === "chair");
    if (!hasChair) {
      throw new AppError(
        "A room must have at least one adjudicator with the role 'chair'.",
        400,
      );
    }

    const round = await Round.findByPk(roundId, { transaction });
    if (!round) throw new AppError("Round not found.", 404);
    const eventId = round.event_id;

    if (round.status == "completed") {
      throw new AppError(
        "Cannot create a room for a round that is already completed.",
        409,
      );
    }

    // motion validation
    if (motion_id) {
      const motion = await Motion.findOne({
        where: { id: motion_id, event_id: eventId, is_deleted: false },
        transaction,
      });
      if (!motion)
        throw new AppError(
          "Motion not found or does not belong to this event.",
          400,
        );
    }

    // adjudicator validation
    const adjudicatorIds = adjudicators.map((adj) => adj.participant_id);
    const validAdjudicators = await EventParticipant.findAll({
      where: { id: adjudicatorIds, event_id: eventId },
      transaction,
    });

    if (validAdjudicators.length !== adjudicatorIds.length) {
      throw new AppError(
        "One or more adjudicators do not exist or do not belong to this event.",
        400,
      );
    }

    for (const adj of validAdjudicators) {
      if (adj.role !== "adjudicator") {
        throw new AppError(
          `Participant '${adj.display_name}' is not registered as an adjudicator.`,
          400,
        );
      }
    }

    const existingAdjudicators = await RoomAdjudicator.findAll({
      where: { participant_id: adjudicatorIds },
      include: [{ model: Room, required: true, where: { round_id: roundId } }],
      transaction,
    });

    if (existingAdjudicators.length > 0) {
      throw new AppError(
        "One or more adjudicators are already assigned to a room in this round.",
        409,
      );
    }

    // bulk fetches
    const permanentTeamIds = teams
      .filter((t) => t.team_id)
      .map((t) => t.team_id);
    const tempSpeakerIds = teams
      .filter((t) => t.participant_ids)
      .flatMap((t) => t.participant_ids);

    let permanentTeamsMap = new Map();
    if (permanentTeamIds.length > 0) {
      const permanentTeams = await Team.findAll({
        where: { id: permanentTeamIds, event_id: eventId },
        include: [{ model: TeamMember }],
        transaction,
      });

      const eliminatedTeams = permanentTeams.filter((t) => t.is_eliminated);
      if (eliminatedTeams.length > 0) {
        throw new AppError(
          "Cannot assign eliminated teams to a new room.",
          409,
        );
      }

      permanentTeamsMap = new Map(permanentTeams.map((t) => [t.id, t]));
    }

    let validTempSpeakersMap = new Map();
    if (tempSpeakerIds.length > 0) {
      const validTempSpeakers = await EventParticipant.findAll({
        where: { id: tempSpeakerIds, event_id: eventId },
        transaction,
      });

      const eliminatedSpeakers = validTempSpeakers.filter(
        (s) => s.is_eliminated,
      );
      if (eliminatedSpeakers.length > 0) {
        throw new AppError(
          "Cannot assign eliminated participants to a new room.",
          409,
        );
      }

      validTempSpeakersMap = new Map(
        validTempSpeakers.map((sp) => [sp.id, sp]),
      );
    }

    let processedTeams = [];
    let allParticipantIdsInRoom = [];

    // Memory-mapped team processing
    for (const teamData of teams) {
      if (teamData.team_id) {
        // Permanent or Existing Team
        const team = permanentTeamsMap.get(teamData.team_id);

        if (!team) {
          throw new AppError(
            `Team ID ${teamData.team_id} not found in this event.`,
            404,
          );
        }

        // now allow teams with fewer members than required (but > 0)
        if (
          team.TeamMembers.length === 0 ||
          team.TeamMembers.length > format.speakers_per_team
        ) {
          throw new AppError(
            `Team '${team.name}' has an invalid number of speakers (${team.TeamMembers.length}). Format allows up to ${format.speakers_per_team}.`,
            400,
          );
        }

        // ironman is duplicated only in the RoomSpeaker table
        const speakers = [];
        for (let i = 0; i < format.speakers_per_team; i++) {
          const member = team.TeamMembers[i] || team.TeamMembers[0];
          speakers.push({ participant_id: member.participant_id });
        }

        speakers.forEach((s) => allParticipantIdsInRoom.push(s.participant_id));
        processedTeams.push({
          team_id: team.id,
          position: teamData.position,
          speakers,
        });
      } else if (teamData.participant_ids) {
        // Temporary "Fight Club" Team case
        if (!teamData.name) {
          throw new AppError(
            "A name is required when dynamically generating a temporary team.",
            400,
          );
        }

        // also allow fewer members for dynamic ironman generation
        if (
          teamData.participant_ids.length === 0 ||
          teamData.participant_ids.length > format.speakers_per_team
        ) {
          throw new AppError(
            `Temporary team '${teamData.name}' has an invalid number of speakers. Format allows up to ${format.speakers_per_team}.`,
            400,
          );
        }

        // verify temp speakers exist and have the correct role
        for (const spId of teamData.participant_ids) {
          const sp = validTempSpeakersMap.get(spId);
          if (!sp) {
            throw new AppError(
              `Participant ID ${spId} does not exist in this event.`,
              400,
            );
          }
          if (sp.role !== "speaker") {
            throw new AppError(
              `Participant '${sp.display_name}' is not registered as a speaker.`,
              400,
            );
          }
        }

        // create the temporary team
        const newTempTeam = await Team.create(
          {
            event_id: eventId,
            name: teamData.name, // must be unique per event, e.g. "Temp-R1-Pos1"
            is_temporary: true,
            is_eliminated: false,
          },
          { transaction },
        );

        // members are no longer duplicated
        const membersToInsert = teamData.participant_ids.map((id) => ({
          team_id: newTempTeam.id,
          participant_id: id,
        }));

        await TeamMember.bulkCreate(membersToInsert, { transaction });

        // ironman is duplicated only in the RoomSpeaker table
        const speakers = [];
        for (let i = 0; i < format.speakers_per_team; i++) {
          const pId =
            teamData.participant_ids[i] || teamData.participant_ids[0];
          speakers.push({ participant_id: pId });
        }

        speakers.forEach((s) => allParticipantIdsInRoom.push(s.participant_id));
        processedTeams.push({
          team_id: newTempTeam.id,
          position: teamData.position,
          speakers,
        });
      } else {
        throw new AppError(
          "Each team entry must contain either a 'team_id' or 'participant_ids' array.",
          400,
        );
      }
    }

    // FC case Double-Booked Speaker
    // ensure Speaker A isn't playing in Room 1 and Room 2 simultaneously.
    const existingSpeakers = await RoomSpeaker.findAll({
      where: { participant_id: allParticipantIdsInRoom },
      include: [
        {
          model: RoomTeam,
          required: true,
          include: [
            { model: Room, required: true, where: { round_id: roundId } },
          ],
        },
      ],
      transaction,
    });

    if (existingSpeakers.length > 0) {
      throw new AppError(
        "One or more speakers are already debating in a different room in this round.",
        409,
      );
    }

    // create the Room
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

    // attach Teams and Speakers
    for (const pTeam of processedTeams) {
      const roomTeam = await RoomTeam.create(
        {
          room_id: room.id,
          team_id: pTeam.team_id,
          position: pTeam.position,
        },
        { transaction },
      );

      const speakersToCreate = pTeam.speakers.map((sp) => ({
        room_team_id: roomTeam.id,
        participant_id: sp.participant_id,
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
            { model: Team, attributes: ["id", "name", "is_temporary"] },
            {
              model: RoomSpeaker,
              attributes: ["id", "rank"],
              include: [
                { model: EventParticipant, attributes: ["id", "display_name"] },
              ],
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
  const transaction = await sequelize.transaction();
  try {
    const room = await Room.findByPk(req.params.roomId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!room) throw new AppError("Room not found.", 404);

    if (room.status === "judging" || room.status === "completed") {
      throw new AppError(
        `Cannot delete a room in '${room.status}' state. Void or reset it first.`,
        409,
      );
    }

    const roomTeams = await RoomTeam.findAll({
      where: { room_id: room.id },
      include: [{ model: Team }],
      transaction,
    });

    // identify any temporary teams tied to this room to clean them up
    const temporaryTeamsToPurge = roomTeams
      .map((rt) => rt.Team)
      .filter((team) => team && team.is_temporary);

    await room.destroy({ transaction });

    for (const tempTeam of temporaryTeamsToPurge) {
      await tempTeam.destroy({ transaction });
    }

    await transaction.commit();
    res.status(200).json({
      status: "success",
      message: "Room and associated temporary teams deleted successfully.",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

module.exports = { createRoom, getRoundRooms, deleteRoom };
