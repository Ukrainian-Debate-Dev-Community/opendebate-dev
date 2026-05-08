const { Room, RoomTeam, RoomSpeaker, sequelize } = require("../models");
const AppError = require("../utils/AppError");

const submitScores = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const roomId = req.params.roomId;
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

    const room = await Room.findByPk(roomId, { transaction });

    if (!room) throw new AppError("Room not found.", 404);
    if (room.status === "finished") {
      throw new AppError("This room has already been scored and locked.", 403);
    }

    // validate Team Ranks (1, 2, 3, 4)
    const ranks = teamRankings.map((tr) => tr.rank).sort((a, b) => a - b);
    if (ranks.join(",") !== "1,2,3,4") {
      throw new AppError(
        "Team ranks must be exactly 1, 2, 3, and 4 with no ties.",
        400,
      );
    }

    // update Team Rankings
    for (const teamData of teamRankings) {
      const roomTeam = await RoomTeam.findByPk(teamData.room_team_id, {
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
    }

    // update Speaker Scores
    for (const speakerData of speakerScores) {
      const roomSpeaker = await RoomSpeaker.findByPk(
        speakerData.room_speaker_id,
        { transaction },
      );
      if (!roomSpeaker) {
        throw new AppError(
          `Invalid room_speaker_id: ${speakerData.room_speaker_id}`,
          400,
        );
      }
      roomSpeaker.score = speakerData.score;
      await roomSpeaker.save({ transaction });
    }

    // lock the Room by changing the status
    room.status = "finished";
    await room.save({ transaction });

    await transaction.commit();

    res.status(200).json({
      status: "success",
      message: "Scores submitted successfully. The room is now finished.",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

module.exports = { submitScores };
