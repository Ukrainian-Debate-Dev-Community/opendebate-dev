const {
  Team,
  TeamMember,
  EventParticipant,
  Event,
  Room,
  RoomSpeaker,
  RoomTeam,
  Format,
  sequelize,
} = require("../models");
const { Op } = require("sequelize");
const AppError = require("../utils/AppError");
const { destroyOrArchive, restoreRecord } = require("../utils/lifecycle");

const createTeam = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const eventId = req.params.eventId;
    const { name, participant_ids, is_temporary = false } = req.body;
    // participant_ids expects an array [first_id, second_id ... ], could be duplicates (iron-person)

    if (
      !name ||
      !participant_ids ||
      !Array.isArray(participant_ids) ||
      participant_ids.length === 0
    ) {
      throw new AppError(
        "Please provide a team name and an array of participant IDs.",
        400,
      );
    }

    const event = await Event.findByPk(eventId, { transaction });
    if (!event) throw new AppError("Event not found.", 404);

    const uniqueParticipantIds = [...new Set(participant_ids)];

    const validParticipants = await EventParticipant.findAll({
      where: {
        id: uniqueParticipantIds,
        event_id: eventId,
      },
      transaction,
    });

    if (validParticipants.length !== uniqueParticipantIds.length) {
      throw new AppError(
        "One or more participants are invalid or do not belong to this event.",
        400,
      );
    }

    // PERMANENT TEAMS: enforce one-team-per-event rule
    // TEMPORARY TEAMS: bypass this so speakers can form new pairs in subsequent rounds
    if (!is_temporary) {
      const existingMemberships = await TeamMember.findAll({
        where: { participant_id: participant_ids },
        include: [
          {
            model: Team,
            required: true,
            where: { event_id: eventId, is_temporary: false },
          },
        ],
        transaction,
      });

      if (existingMemberships.length > 0) {
        throw new AppError(
          "One or more participants are already assigned to a permanent team in this event.",
          409,
        );
      }
    }

    const newTeam = await Team.create(
      { event_id: eventId, name, is_temporary, is_eliminated: false },
      { transaction },
    );

    // map Participants to TeamMembers
    const membersToInsert = participant_ids.map((id) => ({
      team_id: newTeam.id,
      participant_id: id,
    }));

    await TeamMember.bulkCreate(membersToInsert, { transaction });

    await transaction.commit();
    res.status(201).json({ status: "success", data: newTeam });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

const generateRandomTeams = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { format_id } = req.query;

    if (!format_id) {
      throw new AppError("format_id is required as a query parameter.", 400);
    }

    const format = await Format.findByPk(format_id);
    if (!format) throw new AppError("Format not found.", 404);

    // fetch all active speakers (not eliminated)
    const allSpeakers = await EventParticipant.findAll({
      where: { event_id: eventId, role: "speaker", is_eliminated: false },
      attributes: ["id", "display_name"],
      raw: true,
    });

    // fetch speakers already locked into Permanent Teams
    const permanentMembers = await TeamMember.findAll({
      include: [
        {
          model: Team,
          required: true,
          attributes: [],
          where: { event_id: eventId, is_temporary: false },
        },
      ],
      attributes: ["participant_id"],
      raw: true,
    });

    const busyIds = new Set(permanentMembers.map((m) => m.participant_id));

    const freeSpeakers = allSpeakers.filter((s) => !busyIds.has(s.id));

    const shuffled = freeSpeakers.sort(() => 0.5 - Math.random());

    const proposedTeams = [];
    const chunkSize = format.speakers_per_team;

    for (let i = 0; i < shuffled.length; i += chunkSize) {
      const chunk = shuffled.slice(i, i + chunkSize);

      proposedTeams.push({
        name: `Random Team ${Math.floor(i / chunkSize) + 1}`,
        participant_ids: chunk.map((c) => c.id),
        participants: chunk,
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        total_free_speakers: freeSpeakers.length,
        proposed_teams: proposedTeams,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getEventTeams = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;
    const { is_temporary } = req.query; // filter if needed

    const whereClause = { event_id: eventId };
    if (is_temporary !== undefined) {
      whereClause.is_temporary = is_temporary === "true";
    }

    const teams = await Team.findAll({
      where: whereClause,
      include: [
        {
          model: TeamMember,
          attributes: ["id"],
          include: [
            {
              model: EventParticipant,
              attributes: ["id", "display_name", "user_id"],
            },
          ],
        },
      ],
      order: [["id", "ASC"]],
    });

    // clean the payload
    const formattedTeams = teams.map((team) => ({
      id: team.id,
      name: team.name,
      is_temporary: team.is_temporary,
      is_eliminated: team.is_eliminated,
      speakers: team.TeamMembers.map((member) => ({
        participant_id: member.EventParticipant.id,
        name: member.EventParticipant.display_name,
        user_id: member.EventParticipant.user_id,
      })),
    }));

    res.status(200).json({ status: "success", data: formattedTeams });
  } catch (error) {
    next(error);
  }
};

const updateTeam = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const teamId = req.params.teamId;
    const eventId = req.params.eventId;
    const { name, participant_ids } = req.body;

    const team = await Team.findOne({
      where: { id: teamId, event_id: eventId },
      include: [TeamMember],
      paranoid: false,
      transaction,
    });
    if (!team) throw new AppError("Team not found in this event.", 404);

    const isTemporary = team.is_temporary;

    if (name) team.name = name;

    if (participant_ids && Array.isArray(participant_ids)) {
      const uniqueParticipantIds = [...new Set(participant_ids)];
      const validParticipants = await EventParticipant.findAll({
        where: {
          id: uniqueParticipantIds,
          event_id: eventId,
        },
        transaction,
      });

      if (validParticipants.length !== uniqueParticipantIds.length) {
        throw new AppError(
          "One or more participants are invalid or do not belong to this event.",
          400,
        );
      }

      // PERMANENT TEAMS: check for duplicates when updating a roster
      if (!isTemporary) {
        const existingMemberships = await TeamMember.findAll({
          where: { participant_id: participant_ids },
          include: [
            {
              model: Team,
              required: true,
              where: {
                event_id: eventId,
                is_temporary: false,
                id: { [Op.ne]: teamId }, // exclude current team
              },
            },
          ],
          transaction,
        });

        if (existingMemberships.length > 0) {
          throw new AppError(
            "One or more participants are already assigned to another permanent team in this event.",
            409,
          );
        }
      }

      // check if the team is in an active/completed room
      const roomTeams = await RoomTeam.findAll({
        where: { team_id: teamId },
        transaction,
      });

      for (const rt of roomTeams) {
        const room = await Room.findByPk(rt.room_id, { transaction });
        if (
          room &&
          (room.status === "judging" || room.status === "completed")
        ) {
          throw new AppError(
            "Cannot modify team roster. This team is in a room that is currently being judged or is already completed.",
            400,
          );
        }
      }

      // clear old TeamMembers and bulk create new ones
      await TeamMember.destroy({ where: { team_id: teamId }, transaction });

      const membersToInsert = participant_ids.map((id) => ({
        team_id: teamId,
        participant_id: id,
      }));
      await TeamMember.bulkCreate(membersToInsert, { transaction });

      // Sync RoomSpeakers
      for (const rt of roomTeams) {
        await RoomSpeaker.destroy({
          where: { room_team_id: rt.id },
          transaction,
        });

        const speakersToCreate = participant_ids.map((id) => ({
          room_team_id: rt.id,
          participant_id: id,
        }));
        await RoomSpeaker.bulkCreate(speakersToCreate, { transaction });
      }
    }

    await team.save({ transaction });
    await transaction.commit();
    res.status(200).json({
      status: "success",
      message: "Team roster updated successfully.",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

const deleteTeam = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const teamId = req.params.teamId;
    const eventId = req.params.eventId;

    const team = await Team.findOne({
      where: { id: teamId, event_id: eventId },
      include: [TeamMember],
      transaction,
    });
    if (!team) throw new AppError("Team not found in this event.", 404);

    const roomTeams = await RoomTeam.findAll({
      where: { team_id: teamId },
      transaction,
    });

    if (roomTeams.length > 0) {
      throw new AppError(
        "Cannot dissolve a team that is currently assigned to a room. Please delete the room or remove the team from the matchup first.",
        409,
      );
    }

    // disband the team
    const outcome = await destroyOrArchive(team, req, { transaction });

    await transaction.commit();
    res.status(200).json({
      status: "success",
      message: `Team ${outcome} successfully.`,
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

const restoreTeam = async (req, res, next) => {
  try {
    const team = await restoreRecord(Team, {
      id: req.params.teamId,
      event_id: req.params.eventId,
    });
    res.status(200).json({ status: "success", data: team });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTeam,
  generateRandomTeams,
  getEventTeams,
  updateTeam,
  deleteTeam,
  restoreTeam,
};
