const {
  Room,
  RoomTeam,
  RoomSpeaker,
  RoomAdjudicator,
  EventParticipant,
  Format,
  Score,
  sequelize,
} = require("../models");
const AppError = require("../utils/AppError");

const submitScores = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const roomId = req.params.roomId;
    const userId = req.user.id; // the authenticated user
    const { teamRankings, speakerScores } = req.body;

    /* Expected Payload Format:
      teamRankings: [ { room_team_id: 1, rank: 1 }, { room_team_id: 2, rank: 2 }, ... ]
      speakerScores: [ { room_speaker_id: 1, score: 70 }, { room_speaker_id: 2, score: 71 }, ... ]
    */

    if (!teamRankings || !speakerScores) {
      throw new AppError(
        "You must provide both teamRankings and speakerScores.",
        400,
      );
    }

    // Room and its status
    const room = await Room.findByPk(roomId, {
      include: [Format],
      transaction,
    });
    if (!room) throw new AppError("Room not found.", 404);

    if (room.status === "completed" || room.status === "void") {
      throw new AppError(
        `Cannot submit scores. Room is already ${room.status}.`,
        403,
      );
    }

    const format = room.Format;

    // the requester is the Chair of this room
    const adjudicatorRecord = await RoomAdjudicator.findOne({
      where: { room_id: roomId, role: "chair" },
      include: [
        {
          model: EventParticipant,
          where: { user_id: userId },
          required: true,
        },
      ],
      transaction,
    });

    if (!adjudicatorRecord) {
      throw new AppError(
        "Unauthorised: Only the designated Chair can submit the final ballot.",
        403,
      );
    }
    const roomAdjudicatorId = adjudicatorRecord.id;

    // update Team Rankings and force Speaker inheritance
    for (const teamData of teamRankings) {
      const roomTeam = await RoomTeam.findByPk(teamData.room_team_id, {
        include: [RoomSpeaker],
        transaction,
      });

      if (!roomTeam || roomTeam.room_id !== room.id) {
        throw new AppError(
          `Invalid room_team_id: ${teamData.room_team_id}`,
          400,
        );
      }

      roomTeam.rank = teamData.rank;
      await roomTeam.save({ transaction });

      // apply the rank to the speakers
      for (const speaker of roomTeam.RoomSpeakers) {
        speaker.rank = teamData.rank;
        await speaker.save({ transaction });
      }
    }

    // validate complete ballot
    const expectedSpeakers = format.teams_per_room * format.speakers_per_team;
    if (speakerScores.length !== expectedSpeakers) {
      throw new AppError(
        `Incomplete ballot. Format ${format.code} requires exactly ${expectedSpeakers} speaker scores. You provided ${speakerScores.length}.`,
        400,
      );
    }

    await Score.destroy({
      where: { room_adjudicator_id: roomAdjudicatorId },
      transaction,
    });

    const scoresToInsert = [];

    // process scores
    for (const sp of speakerScores) {
      // format boundary validation
      if (sp.score < format.score_min || sp.score > format.score_max) {
        throw new AppError(
          `Score ${sp.score} is out of bounds for format ${format.code} (${format.score_min}-${format.score_max}).`,
          400,
        );
      }

      // Score row
      scoresToInsert.push({
        room_speaker_id: sp.room_speaker_id,
        room_adjudicator_id: roomAdjudicatorId,
        value: sp.score,
      });
    }

    await Score.bulkCreate(scoresToInsert, { transaction });

    // change status and commit
    room.status = "completed";
    await room.save({ transaction });

    await transaction.commit();

    res.status(200).json({
      status: "success",
      message: "Scores submitted successfully. The room is now completed.",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

module.exports = { submitScores };
