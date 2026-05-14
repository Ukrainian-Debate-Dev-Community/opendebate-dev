const { RoomSpeaker, RoomTeam, Team, sequelize } = require("../models");
const { Op } = require("sequelize");

const getUserStats = async (req, res, next) => {
  try {
    const userId = req.params.id;

    // calculates the absolute averages and extremes of their speaker points
    const speakerStats = await RoomSpeaker.findAll({
      where: { user_id: userId, score: { [Op.not]: null } },
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("id")), "total_speeches"],
        [sequelize.fn("AVG", sequelize.col("score")), "avg_score"],
        [sequelize.fn("MAX", sequelize.col("score")), "highest_score"],
        [sequelize.fn("MIN", sequelize.col("score")), "lowest_score"],
      ],
      raw: true,
    });

    const core = speakerStats[0];
    if (!core || core.total_speeches === 0) {
      return res.status(200).json({
        status: "success",
        message: "This user has not completed any scored debates yet.",
        data: null,
      });
    }

    // groups the finishes by 1/2/3/4 place
    const rankStats = await RoomSpeaker.findAll({
      where: { user_id: userId, score: { [Op.not]: null } },
      attributes: [
        [sequelize.col("RoomTeam.rank"), "rank"],
        [sequelize.fn("COUNT", sequelize.col("RoomSpeaker.id")), "count"],
      ],
      include: [
        {
          model: RoomTeam,
          attributes: [],
          required: true,
        },
      ],
      group: ["RoomTeam.rank"],
      raw: true,
    });

    const ranks = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let totalRankedRooms = 0;

    rankStats.forEach((stat) => {
      ranks[stat.rank] = parseInt(stat.count);
      totalRankedRooms += parseInt(stat.count);
    });

    const winRate =
      totalRankedRooms > 0
        ? ((ranks[1] / totalRankedRooms) * 100).toFixed(1)
        : 0;
    const topTwoRate =
      totalRankedRooms > 0
        ? (((ranks[1] + ranks[2]) / totalRankedRooms) * 100).toFixed(1)
        : 0;

    // the average speaker score based on position
    const positionStats = await RoomSpeaker.findAll({
      where: { user_id: userId, score: { [Op.not]: null } },
      attributes: [
        [sequelize.col("RoomTeam.position"), "position"],
        [
          sequelize.fn("COUNT", sequelize.col("RoomSpeaker.id")),
          "times_played",
        ],
        [sequelize.fn("AVG", sequelize.col("score")), "avg_position_score"],
      ],
      include: [
        {
          model: RoomTeam,
          attributes: [],
          required: true,
        },
      ],
      group: ["RoomTeam.position"],
      raw: true,
    });

    // and extra teammate stats
    const teams = await Team.findAll({
      where: {
        [Op.or]: [{ opener: userId }, { closer: userId }],
      },
      raw: true,
    });

    const partnerCounts = {};
    teams.forEach((team) => {
      const partnerId = team.opener == userId ? team.closer : team.opener;
      if (partnerId) {
        partnerCounts[partnerId] = (partnerCounts[partnerId] || 0) + 1;
      }
    });

    const uniquePartners = Object.keys(partnerCounts).length;
    let mostFrequentPartnerId = null;
    let maxTeammateCount = 0;

    for (const [pId, count] of Object.entries(partnerCounts)) {
      if (count > maxTeammateCount) {
        maxTeammateCount = count;
        mostFrequentPartnerId = pId;
      }
    }

    // compilation
    const aggregatedData = {
      overview: {
        total_debates: parseInt(core.total_speeches),
        average_speaker_score: parseFloat(core.avg_score).toFixed(2),
        highest_score: core.highest_score,
        lowest_score: core.lowest_score,
        consistency_gap: core.highest_score - core.lowest_score,
      },
      placements: {
        first_places: ranks[1],
        second_places: ranks[2],
        third_places: ranks[3],
        fourth_places: ranks[4],
        win_rate_percentage: winRate,
        top_two_percentage: topTwoRate,
      },
      positions: positionStats.map((pos) => ({
        position: pos.position,
        times_played: parseInt(pos.times_played),
        average_score: parseFloat(pos.avg_position_score).toFixed(2),
      })),
      synergy: {
        total_unique_partners: uniquePartners,
        most_frequent_partner_id: mostFrequentPartnerId,
        times_played_with_frequent_partner: maxTeammateCount,
      },
    };

    res.status(200).json({ status: "success", data: aggregatedData });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUserStats };
