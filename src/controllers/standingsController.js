const {
  Team,
  RoomTeam,
  Room,
  Round,
  EventParticipant,
  RoomSpeaker,
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

module.exports = {
  getTeamStandings,
  getSpeakerStandings,
};
