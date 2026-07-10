const {
  Team,
  TeamMember,
  EventParticipant,
  Event,
  Room,
  RoomSpeaker,
  RoomTeam,
  sequelize,
} = require("../models");
const { Op } = require("sequelize");
const AppError = require("../utils/AppError");

const createTeam = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const eventId = req.params.eventId;
    const { name, participant_ids, is_temporary = false } = req.body;
    // participant_ids expects an ordered array [first_id, second_id ... ], could be duplicates (iron-person)

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

    // map Participants to TeamMembers with their speaking order
    const membersToInsert = participant_ids.map((id, index) => ({
      team_id: newTeam.id,
      participant_id: id,
      speaker_order: index + 1,
    }));

    await TeamMember.bulkCreate(membersToInsert, { transaction });

    await transaction.commit();
    res.status(201).json({ status: "success", data: newTeam });
  } catch (error) {
    await transaction.rollback();
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
          attributes: ["id", "speaker_order"],
          include: [
            {
              model: EventParticipant,
              attributes: ["id", "display_name", "user_id"],
            },
          ],
        },
      ],
      order: [
        ["id", "ASC"],
        [TeamMember, "speaker_order", "ASC"],
      ],
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
        order: member.speaker_order,
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

      const membersToInsert = participant_ids.map((id, index) => ({
        team_id: teamId,
        participant_id: id,
        speaker_order: index + 1,
      }));
      await TeamMember.bulkCreate(membersToInsert, { transaction });

      // Sync RoomSpeakers
      for (const rt of roomTeams) {
        await RoomSpeaker.destroy({
          where: { room_team_id: rt.id },
          transaction,
        });

        const speakersToCreate = participant_ids.map((id, index) => ({
          room_team_id: rt.id,
          participant_id: id,
          speech_position: index + 1,
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

    // disband the team
    await team.destroy({ transaction });

    await transaction.commit();
    res.status(200).json({
      status: "success",
      message: "Team dissolved successfully.",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

module.exports = { createTeam, getEventTeams, updateTeam, deleteTeam };
