const {
  Team,
  TeamMember,
  EventParticipant,
  Round,
  Room,
  RoomSpeaker,
  RoomTeam,
  sequelize,
} = require("../models");
const AppError = require("../utils/AppError");

const createTeam = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const roundId = req.params.roundId;
    const { name, participant_ids } = req.body;
    // participant_ids expects an ordered array [first_id, second_id ... ], could be duplicates

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

    const round = await Round.findByPk(roundId);
    if (!round) throw new AppError("Round not found.", 404);

    // none of these participants are already in a team
    const existingMemberships = await TeamMember.findAll({
      where: { participant_id: participant_ids },
      include: [
        {
          model: Team,
          required: true,
          where: { round_id: roundId },
        },
      ],
      transaction,
    });

    if (existingMemberships.length > 0) {
      throw new AppError(
        "One or more participants are already assigned to a team in this round.",
        409,
      );
    }

    const newTeam = await Team.create(
      { round_id: roundId, name },
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

const getRoundTeams = async (req, res, next) => {
  try {
    const roundId = req.params.roundId;

    const teams = await Team.findAll({
      where: { round_id: roundId },
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
    const { name, participant_ids } = req.body;

    const team = await Team.findByPk(teamId, {
      include: [TeamMember],
      transaction,
    });

    if (!team) throw new AppError("Team not found.", 404);

    const roundId = team.round_id;

    const existingMemberships = await TeamMember.findAll({
      where: { participant_id: participant_ids },
      include: [
        {
          model: Team,
          required: true,
          where: { round_id: roundId },
        },
      ],
      transaction,
    });

    if (existingMemberships.length > 0) {
      throw new AppError(
        "One or more participants are already assigned to a team in this round.",
        409,
      );
    }

    if (name) team.name = name;

    if (participant_ids && Array.isArray(participant_ids)) {
      // is the team in an active/finished room
      const roomTeams = await RoomTeam.findAll({
        where: { team_id: teamId },
        transaction,
      });

      for (const rt of roomTeams) {
        const room = await Room.findByPk(rt.room_id, { transaction });
        if (room && (room.status === "judging" || room.status === "finished")) {
          throw new AppError(
            "Cannot modify team roster. This team is in a room that is currently being judged or is already finished.",
            400,
          );
        }
      }

      const oldParticipantIds = team.TeamMembers.map((tm) => tm.participant_id);

      // clear old TeamMembers and bulk create new ones
      await TeamMember.destroy({ where: { team_id: teamId }, transaction });

      const membersToInsert = participant_ids.map((id, index) => ({
        team_id: teamId,
        participant_id: id,
        speaker_order: index + 1,
      }));
      await TeamMember.bulkCreate(membersToInsert, { transaction });

      // witlist management
      const removedIds = oldParticipantIds.filter(
        (id) => !participant_ids.includes(id),
      );

      if (removedIds.length > 0) {
        // removed return to waitlist
        await EventParticipant.update(
          { is_waitlist: true },
          { where: { id: removedIds }, transaction },
        );
      }
      if (participant_ids.length > 0) {
        // new members are removed from waitlist
        await EventParticipant.update(
          { is_waitlist: false },
          { where: { id: participant_ids }, transaction },
        );
      }

      // delete Speakers and create the new ones
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

    const team = await Team.findByPk(teamId, {
      include: [TeamMember],
      transaction,
    });

    if (!team) throw new AppError("Team not found.", 404);

    // players to return to the waitlist pool
    const participantIds = team.TeamMembers.map((tm) => tm.participant_id);

    // disand the team
    await team.destroy({ transaction });

    // return to waitlist
    if (participantIds.length > 0) {
      await EventParticipant.update(
        { is_waitlist: true },
        { where: { id: participantIds }, transaction },
      );
    }

    await transaction.commit();
    res.status(200).json({
      status: "success",
      message:
        "Team dissolved successfully. Participants returned to the available pool.",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

module.exports = { createTeam, getRoundTeams, updateTeam, deleteTeam };
