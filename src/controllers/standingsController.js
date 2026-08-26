const {
  Team,
  RoomTeam,
  Room,
  Round,
  EventParticipant,
  RoomSpeaker,
  Score,
} = require("../models");
const { hasEventPrivilege } = require("../middleware/authMiddleware");

const getTeamStandings = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const isAuthorised = await hasEventPrivilege(
      req.user.id,
      req.user.isAdmin,
      Number(eventId),
    );

    const teams = await Team.findAll({
      where: { event_id: eventId },
      attributes: ["id", "name"],
    });

    // authorised users see all rounds
    // others only see visible rounds
    const roundFilter = isAuthorised
      ? { event_id: eventId }
      : { event_id: eventId, is_hidden: false };

    const rounds = await Round.findAll({
      where: roundFilter,
      attributes: ["id"],
    });
    const roundIds = rounds.map((r) => r.id);

    const rooms = await Room.findAll({
      where: { round_id: roundIds },
      attributes: ["id"],
    });
    const roomIds = rooms.map((r) => r.id);

    const roomTeams = await RoomTeam.findAll({
      where: { room_id: roomIds },
      attributes: ["team_id", "room_id", "rank"],
    });

    const standings = {};
    teams.forEach((t) => {
      standings[t.id] = { name: t.name, rooms: {} };
    });

    roomTeams.forEach((rt) => {
      if (standings[rt.team_id] && rt.rank !== null) {
        standings[rt.team_id].rooms[rt.room_id] = rt.rank;
      }
    });

    res.status(200).json({ status: "success", data: standings });
  } catch (error) {
    next(error);
  }
};

const getSpeakerStandings = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const isAuthorised = await hasEventPrivilege(
      req.user.id,
      req.user.isAdmin,
      Number(eventId),
    );

    const speakers = await EventParticipant.findAll({
      where: { event_id: eventId, role: "speaker" },
      attributes: ["id", "display_name"],
    });

    // the same logic as for teams
    const roundFilter = isAuthorised
      ? { event_id: eventId }
      : { event_id: eventId, is_hidden: false };

    const rounds = await Round.findAll({
      where: roundFilter,
      attributes: ["id"],
    });
    const roundIds = rounds.map((r) => r.id);

    const rooms = await Room.findAll({
      where: { round_id: roundIds },
      attributes: ["id"],
    });
    const roomIds = rooms.map((r) => r.id);

    const roomTeams = await RoomTeam.findAll({
      where: { room_id: roomIds },
      attributes: ["id", "room_id"],
    });
    const roomTeamIds = roomTeams.map((rt) => rt.id);

    const rtToRoom = {};
    roomTeams.forEach((rt) => {
      rtToRoom[rt.id] = rt.room_id;
    });

    const roomSpeakers = await RoomSpeaker.findAll({
      where: { room_team_id: roomTeamIds },
      attributes: ["participant_id", "room_team_id", "rank"],
    });

    const standings = {};
    speakers.forEach((s) => {
      standings[s.id] = { name: s.display_name, rooms: {} };
    });

    roomSpeakers.forEach((rs) => {
      if (standings[rs.participant_id] && rs.rank !== null) {
        const roomId = rtToRoom[rs.room_team_id];
        standings[rs.participant_id].rooms[roomId] = rs.rank;
      }
    });

    res.status(200).json({ status: "success", data: standings });
  } catch (error) {
    next(error);
  }
};

// DEVELOPER NOTE:
// I was asked to write the calculated routes as well. The logic that I use for N teams:
// Team points: SUM of (N-Rank)
// Speaker points: SUM of (Score * (1 + (N-Rank) * 0.1 ))

const getCalculatedTeamStandings = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const isAuthorised = await hasEventPrivilege(
      req.user.id,
      req.user.isAdmin,
      Number(eventId),
    );

    const teams = await Team.findAll({
      where: { event_id: eventId },
      attributes: ["id", "name"],
    });

    const roundFilter = isAuthorised
      ? { event_id: eventId }
      : { event_id: eventId, is_hidden: false };
    const rounds = await Round.findAll({
      where: roundFilter,
      attributes: ["id"],
    });
    const roundIds = rounds.map((r) => r.id);

    const rooms = await Room.findAll({
      where: { round_id: roundIds },
      attributes: ["id"],
    });
    const roomIds = rooms.map((r) => r.id);

    const roomTeams = await RoomTeam.findAll({
      where: { room_id: roomIds },
      attributes: ["team_id", "room_id", "rank"],
    });

    // determine number of teams per room dynamically
    const roomSizes = Object.create(null);
    roomTeams.forEach((rt) => {
      roomSizes[rt.room_id] = (roomSizes[rt.room_id] || 0) + 1;
    });

    const standings = Object.create(null);
    teams.forEach((t) => {
      standings[t.id] = { id: t.id, name: t.name, total_points: 0 };
    });

    roomTeams.forEach((rt) => {
      if (standings[rt.team_id] && rt.rank !== null) {
        const n = roomSizes[rt.room_id];
        standings[rt.team_id].total_points += n - rt.rank;
      }
    });

    const sortedStandings = Object.values(standings).sort(
      (a, b) => b.total_points - a.total_points,
    );

    res.status(200).json({ status: "success", data: sortedStandings });
  } catch (error) {
    next(error);
  }
};

const getCalculatedSpeakerStandings = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const isAuthorised = await hasEventPrivilege(
      req.user.id,
      req.user.isAdmin,
      Number(eventId),
    );

    const speakers = await EventParticipant.findAll({
      where: { event_id: eventId, role: "speaker" },
      attributes: ["id", "display_name"],
    });

    const roundFilter = isAuthorised
      ? { event_id: eventId }
      : { event_id: eventId, is_hidden: false };
    const rounds = await Round.findAll({
      where: roundFilter,
      attributes: ["id"],
    });
    const roundIds = rounds.map((r) => r.id);

    const rooms = await Room.findAll({
      where: { round_id: roundIds },
      attributes: ["id"],
    });
    const roomIds = rooms.map((r) => r.id);

    const roomTeams = await RoomTeam.findAll({
      where: { room_id: roomIds },
      attributes: ["id", "room_id", "rank"],
    });

    const roomSizes = Object.create(null);
    const rtToData = Object.create(null);

    roomTeams.forEach((rt) => {
      roomSizes[rt.room_id] = (roomSizes[rt.room_id] || 0) + 1;
      rtToData[rt.id] = { roomId: rt.room_id, rank: rt.rank };
    });

    const roomTeamIds = roomTeams.map((rt) => rt.id);

    const roomSpeakers = await RoomSpeaker.findAll({
      where: { room_team_id: roomTeamIds },
      attributes: ["id", "participant_id", "room_team_id", "rank"],
      include: [{ model: Score, attributes: ["value"] }],
    });

    const standings = Object.create(null);
    speakers.forEach((s) => {
      standings[s.id] = { id: s.id, name: s.display_name, total_points: 0 };
    });

    roomSpeakers.forEach((rs) => {
      if (standings[rs.participant_id] && rs.Scores && rs.Scores.length > 0) {
        const teamData = rtToData[rs.room_team_id];

        if (teamData && teamData.rank !== null) {
          const n = roomSizes[teamData.roomId];
          const scoreValue = parseFloat(rs.Scores[0].value);
          const multiplier = 1 + (n - teamData.rank) * 0.1;

          standings[rs.participant_id].total_points += scoreValue * multiplier;
        }
      }
    });

    const sortedStandings = Object.values(standings)
      .map((s) => {
        s.total_points = parseFloat(s.total_points.toFixed(2));
        return s;
      })
      .sort((a, b) => b.total_points - a.total_points);

    res.status(200).json({ status: "success", data: sortedStandings });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTeamStandings,
  getSpeakerStandings,
  getCalculatedSpeakerStandings,
  getCalculatedTeamStandings,
};
