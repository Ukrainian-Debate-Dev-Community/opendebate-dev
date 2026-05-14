const {
  Room,
  RoomTeam,
  RoomSpeaker,
  Team,
  User,
  Session,
  sequelize,
} = require("../models");
const AppError = require("../utils/AppError");

// Owner hand-picks 4 teams, 1 judge, and their exact positions
const createRoom = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const sessionId = req.params.sessionId;
    const { judge_id, teams } = req.body;
    // 'teams' expects: [{ team_id: 5, position: 'OG' }, { team_id: 8, position: 'OO' }...]

    if (!judge_id || !teams || teams.length !== 4) {
      throw new AppError("A room requires exactly 1 judge and 4 teams.", 400);
    }

    const room = await Room.create(
      { session_id: sessionId, judge: judge_id, status: "scheduled" },
      { transaction },
    );

    // build the Teams and Speakers
    for (const teamData of teams) {
      const team = await Team.findByPk(teamData.team_id, { transaction });
      if (!team) throw new AppError(`Team ${teamData.team_id} not found.`, 404);

      const roomTeam = await RoomTeam.create(
        { room_id: room.id, team_id: team.id, position: teamData.position },
        { transaction },
      );

      const speakersToCreate = [
        { room_team_id: roomTeam.id, user_id: team.opener },
        { room_team_id: roomTeam.id, user_id: team.closer },
      ];
      await RoomSpeaker.bulkCreate(speakersToCreate, { transaction });
    }

    await transaction.commit();
    res.status(201).json({ status: "success", message: "Room created." });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// fetch all rooms and their data for a session
const getSessionRooms = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;

    // fetch the session name
    const session = await Session.findByPk(sessionId, {
      attributes: ["id", "name"],
    });
    if (!session) throw new AppError("Session not found.", 404);

    // excludes are compared to old response from v1.0
    const rooms = await Room.findAll({
      where: { session_id: sessionId },
      attributes: ["id", "status"], // excludes session_id and raw judge ID
      include: [
        { model: User, as: "JudgeData", attributes: ["id", "username"] },
        {
          model: RoomTeam,
          attributes: ["id", "position", "rank"], // excludes room_id and team_id
          include: [
            {
              model: Team,
              attributes: ["id"], // excludes session_id, opener, closer
              include: [
                {
                  model: User,
                  as: "OpenerData",
                  attributes: ["id", "username"],
                },
                {
                  model: User,
                  as: "CloserData",
                  attributes: ["id", "username"],
                },
              ],
            },
            {
              model: RoomSpeaker,
              attributes: ["id", "user_id", "score"],
            },
          ],
        },
      ],
    });

    res.status(200).json({
      status: "success",
      data: {
        session: session,
        rooms: rooms,
      },
    });
  } catch (error) {
    next(error);
  }
};

const deleteRoom = async (req, res, next) => {
  try {
    const room = await Room.findByPk(req.params.roomId);

    if (!room) throw new AppError("Room not found.", 404);

    await room.destroy();

    res
      .status(200)
      .json({ status: "success", message: "Room deleted successfully." });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRoom,
  getSessionRooms,
  deleteRoom,
};
