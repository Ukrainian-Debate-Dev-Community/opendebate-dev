const {
  RoomSpeaker,
  EventParticipant,
  Event,
  Organisation,
  Team,
  Score,
  Feedback,
  Round,
  Room,
  RoomTeam,
  RoomAdjudicator,
  sequelize,
} = require("../models");
const { Op } = require("sequelize");
const AppError = require("../utils/AppError");
const { hasEventPrivilege } = require("../middleware/authMiddleware");

const getUserStats = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;

    // gather all Participant IDs linked to user
    const participants = await EventParticipant.findAll({
      where: { user_id: targetUserId, role: "speaker" },
      attributes: ["id"],
      include: [
        {
          model: Event,
          required: true,
        },
      ],
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

    // delete the hidden rounds from the stats
    const hiddenRounds = await Round.findAll({
      where: { is_hidden: true },
      attributes: ["id"],
      raw: true,
    });
    const hiddenRoundIds = hiddenRounds.map((r) => r.id);

    let hiddenRoomTeamIds = [];
    if (hiddenRoundIds.length > 0) {
      const hiddenRooms = await Room.findAll({
        where: { round_id: hiddenRoundIds },
        attributes: ["id"],
        raw: true,
      });
      const hiddenRoomIds = hiddenRooms.map((r) => r.id);

      const hiddenRoomTeams = await RoomTeam.findAll({
        where: { room_id: hiddenRoomIds },
        attributes: ["id"],
        raw: true,
      });
      hiddenRoomTeamIds = hiddenRoomTeams.map((rt) => rt.id);
    }

    const exclusionClause =
      hiddenRoomTeamIds.length > 0
        ? { room_team_id: { [Op.notIn]: hiddenRoomTeamIds } }
        : {};

    const scoreStats = await Score.findAll({
      include: [
        {
          model: RoomSpeaker,
          attributes: [],
          where: {
            participant_id: participantIds,
            ...exclusionClause,
          },
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
      where: {
        participant_id: participantIds,
        rank: { [Op.not]: null },
        ...exclusionClause,
      },
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
        highest_score: parseFloat(core.highest_score) || 0,
        lowest_score: parseFloat(core.lowest_score) || 0,
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

// Statistics are computed over rooms whose ballot is final: 'completed'
// today, plus 'confirmed' once ballot confirmation lands, so rooms that
// are still pending/live/judging (or voided) never leak into stats.
const { getEventRooms } = require("../utils/finalRooms");

const round2 = (value) => parseFloat(value.toFixed(2));

// same visibility rule as the standings endpoints: privileged viewers
// (admin/owner/organiser) see hidden rounds, everyone else only visible ones
const getFinalRooms = (eventId, isAuthorised) =>
  getEventRooms([eventId], { includeHidden: isAuthorised, finalOnly: true });

const requireEvent = async (eventId) => {
  const event = await Event.findByPk(eventId);
  if (!event) throw new AppError("Event not found.", 404);
  return event;
};

// GET /api/events/:eventId/stats/speakers
// Raw speaker-score statistics. `rounds` counts distinct rooms the speaker
// was scored in; an iron-person's two speeches in one room both feed
// total/avg/std while counting that room once.
const getSpeakerStats = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    await requireEvent(eventId);

    const isAuthorised = await hasEventPrivilege(
      req.user.id,
      req.user.isAdmin,
      Number(eventId),
    );

    const rooms = await getFinalRooms(eventId, isAuthorised);
    const roomIds = rooms.map((r) => r.id);

    const roomTeams = await RoomTeam.findAll({
      where: { room_id: roomIds },
      attributes: ["id", "room_id"],
    });
    const rtToRoom = Object.create(null);
    roomTeams.forEach((rt) => {
      rtToRoom[rt.id] = rt.room_id;
    });

    const roomSpeakers = await RoomSpeaker.findAll({
      where: { room_team_id: roomTeams.map((rt) => rt.id) },
      attributes: ["id", "participant_id", "room_team_id"],
      include: [{ model: Score, attributes: ["value"] }],
    });

    const speakers = await EventParticipant.findAll({
      where: { event_id: eventId, role: "speaker" },
      attributes: ["id", "display_name"],
      order: [["id", "ASC"]],
    });

    const perSpeaker = Object.create(null);
    speakers.forEach((s) => {
      perSpeaker[s.id] = { values: [], rooms: new Set() };
    });

    roomSpeakers.forEach((rs) => {
      const bucket = perSpeaker[rs.participant_id];
      if (!bucket) return;
      rs.Scores.forEach((score) => {
        bucket.values.push(Number(score.value));
        bucket.rooms.add(rtToRoom[rs.room_team_id]);
      });
    });

    const data = speakers.map((s) => {
      const { values, rooms: spokenRooms } = perSpeaker[s.id];
      const n = values.length;
      const total = values.reduce((sum, v) => sum + v, 0);
      let avg = null;
      let std = null;
      if (n > 0) {
        const mean = total / n;
        avg = round2(mean);
        const variance =
          values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / n;
        std = round2(Math.sqrt(variance));
      }
      return {
        id: s.id,
        name: s.display_name,
        rounds: spokenRooms.size,
        total,
        avg,
        std,
      };
    });

    res.status(200).json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};

// GET /api/events/:eventId/stats/teams
const getTeamStats = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    await requireEvent(eventId);

    const isAuthorised = await hasEventPrivilege(
      req.user.id,
      req.user.isAdmin,
      Number(eventId),
    );

    const rooms = await getFinalRooms(eventId, isAuthorised);
    const roomIds = rooms.map((r) => r.id);

    const teams = await Team.findAll({
      where: { event_id: eventId },
      attributes: ["id", "name"],
      order: [["id", "ASC"]],
    });

    const roomTeams = await RoomTeam.findAll({
      where: { room_id: roomIds, team_id: teams.map((t) => t.id) },
      attributes: ["id", "team_id", "rank"],
    });
    const rtToTeam = Object.create(null);
    roomTeams.forEach((rt) => {
      rtToTeam[rt.id] = rt.team_id;
    });

    const roomSpeakers = await RoomSpeaker.findAll({
      where: { room_team_id: roomTeams.map((rt) => rt.id) },
      attributes: ["id", "room_team_id"],
      include: [{ model: Score, attributes: ["value"] }],
    });

    const stats = Object.create(null);
    teams.forEach((t) => {
      stats[t.id] = {
        id: t.id,
        name: t.name,
        total_speaker_points: 0,
        first_places: 0,
        fourth_places: 0,
      };
    });

    roomTeams.forEach((rt) => {
      const teamStats = stats[rt.team_id];
      if (!teamStats || rt.rank === null) return;
      if (rt.rank === 1) teamStats.first_places += 1;
      if (rt.rank === 4) teamStats.fourth_places += 1;
    });

    roomSpeakers.forEach((rs) => {
      const teamStats = stats[rtToTeam[rs.room_team_id]];
      if (!teamStats) return;
      rs.Scores.forEach((score) => {
        teamStats.total_speaker_points += Number(score.value);
      });
    });

    res.status(200).json({ status: "success", data: Object.values(stats) });
  } catch (error) {
    next(error);
  }
};

// GET /api/events/:eventId/stats/judges
const getJudgeStats = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    await requireEvent(eventId);

    const isAuthorised = await hasEventPrivilege(
      req.user.id,
      req.user.isAdmin,
      Number(eventId),
    );

    const rooms = await getFinalRooms(eventId, isAuthorised);
    const roomIds = rooms.map((r) => r.id);

    const judges = await EventParticipant.findAll({
      where: { event_id: eventId, role: "adjudicator" },
      attributes: ["id", "display_name"],
      order: [["id", "ASC"]],
    });
    const judgeIds = judges.map((j) => j.id);

    const roomAdjudicators = await RoomAdjudicator.findAll({
      where: { room_id: roomIds, participant_id: judgeIds },
      attributes: ["participant_id", "room_id"],
    });

    const feedbacks = await Feedback.findAll({
      where: { room_id: roomIds, adjudicator_id: judgeIds },
      attributes: ["adjudicator_id", "score"],
    });

    const stats = Object.create(null);
    judges.forEach((j) => {
      stats[j.id] = {
        id: j.id,
        name: j.display_name,
        rooms_judged: 0,
        feedback: [],
      };
    });

    roomAdjudicators.forEach((ra) => {
      stats[ra.participant_id].rooms_judged += 1;
    });
    feedbacks.forEach((fb) => {
      stats[fb.adjudicator_id].feedback.push(Number(fb.score));
    });

    const data = judges.map((j) => {
      const { feedback, ...rest } = stats[j.id];
      const avg_feedback =
        feedback.length > 0
          ? round2(feedback.reduce((sum, v) => sum + v, 0) / feedback.length)
          : null;
      return { ...rest, avg_feedback };
    });

    res.status(200).json({ status: "success", data });
  } catch (error) {
    next(error);
  }
};

// GET /api/organisations/:organisationId/stats
// Averages are per final room of the organisation's completed events:
// the winner (rank 1) and fourth-place (rank 4) team's summed speaker
// points, averaged across those rooms; null when no room qualifies.
const getOrganisationStats = async (req, res, next) => {
  try {
    const { organisationId } = req.params;
    const organisation = await Organisation.findByPk(organisationId);
    if (!organisation) throw new AppError("Organisation not found.", 404);

    const completedEvents = await Event.findAll({
      where: { organisation_id: organisationId, status: "completed" },
      attributes: ["id"],
    });
    const eventIds = completedEvents.map((e) => e.id);

    const rooms = await getEventRooms(eventIds, {
      includeHidden: true,
      finalOnly: true,
    });
    const roomIds = rooms.map((r) => r.id);

    const roomTeams = await RoomTeam.findAll({
      where: { room_id: roomIds },
      attributes: ["id", "rank"],
    });
    const rankedTeamIds = {
      1: new Set(),
      4: new Set(),
    };
    roomTeams.forEach((rt) => {
      if (rt.rank === 1) rankedTeamIds[1].add(rt.id);
      if (rt.rank === 4) rankedTeamIds[4].add(rt.id);
    });

    const roomSpeakers = await RoomSpeaker.findAll({
      where: { room_team_id: roomTeams.map((rt) => rt.id) },
      attributes: ["id", "room_team_id"],
      include: [{ model: Score, attributes: ["value"] }],
    });

    // summed speaker points per room_team slot
    const slotPoints = Object.create(null);
    roomSpeakers.forEach((rs) => {
      rs.Scores.forEach((score) => {
        slotPoints[rs.room_team_id] =
          (slotPoints[rs.room_team_id] || 0) + Number(score.value);
      });
    });

    const averageFor = (rank) => {
      const sums = [...rankedTeamIds[rank]]
        .filter((rtId) => rtId in slotPoints)
        .map((rtId) => slotPoints[rtId]);
      if (sums.length === 0) return null;
      return round2(sums.reduce((sum, v) => sum + v, 0) / sums.length);
    };

    res.status(200).json({
      status: "success",
      data: {
        total_sessions: completedEvents.length,
        avg_winner_speaker_points: averageFor(1),
        avg_fourth_place_speaker_points: averageFor(4),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserStats,
  getSpeakerStats,
  getTeamStats,
  getJudgeStats,
  getOrganisationStats,
};
