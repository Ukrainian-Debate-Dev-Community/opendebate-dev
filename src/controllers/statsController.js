const {
  RoomSpeaker,
  EventParticipant,
  Score,
  sequelize,
} = require("../models");
const { Op } = require("sequelize");

const getUserStats = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;

    // gather all Participant IDs linked to user
    const participants = await EventParticipant.findAll({
      where: { user_id: targetUserId, role: "speaker" },
      attributes: ["id"],
    });

    if (!participants || participants.length === 0) {
      return res.status(200).json({
        status: "success",
        message:
          "This user has not participated as a speaker in any logged debates.",
        data: null,
      });
    }

    const participantIds = participants.map((p) => p.id);

    // I don't know how the scoring for the other formats works, but
    // looking at the table schema, it is possible for a speaker to have a score of 1+ from a judge panel in the same room
    // so this averages across ALL individual judge ballots.
    const scoreStats = await Score.findAll({
      include: [
        {
          model: RoomSpeaker,
          attributes: [],
          where: { participant_id: participantIds },
        },
      ],
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("Score.id")), "total_ballots"],
        [sequelize.fn("AVG", sequelize.col("value")), "avg_score"],
        [sequelize.fn("MAX", sequelize.col("value")), "highest_score"],
        [sequelize.fn("MIN", sequelize.col("value")), "lowest_score"],
      ],
      raw: true,
    });

    const core = scoreStats[0];

    // only calculating wins (1st Places)
    const rankStats = await RoomSpeaker.findAll({
      where: { participant_id: participantIds, rank: { [Op.not]: null } },
      attributes: [
        "rank",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["rank"],
      raw: true,
    });

    let firstPlaces = 0;
    let totalRankedRooms = 0;

    rankStats.forEach((stat) => {
      const count = parseInt(stat.count);
      totalRankedRooms += count;
      if (stat.rank === 1) {
        firstPlaces += count;
      }
    });

    const winRate =
      totalRankedRooms > 0
        ? ((firstPlaces / totalRankedRooms) * 100).toFixed(1)
        : 0;

    // compilation
    const aggregatedData = {
      overview: {
        total_ballots_received: parseInt(core.total_ballots) || 0,
        total_debates_ranked: totalRankedRooms,
        average_speaker_score: parseFloat(core.avg_score || 0).toFixed(2),
        highest_score: core.highest_score || 0,
        lowest_score: core.lowest_score || 0,
      },
      placements: {
        first_places: firstPlaces,
        win_rate_percentage: winRate,
      },
    };

    res.status(200).json({ status: "success", data: aggregatedData });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUserStats };
