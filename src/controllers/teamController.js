const { Team, Waitlist, User, Session } = require("../models");
const AppError = require("../utils/AppError");
const { Op } = require("sequelize");

// helper that checks if users are already in a team for the session
const checkExistingTeams = async (sessionId, userIds) => {
  const existingTeam = await Team.findOne({
    where: {
      session_id: sessionId,
      [Op.or]: [
        { opener: { [Op.in]: userIds } },
        { closer: { [Op.in]: userIds } },
      ],
    },
  });
  if (existingTeam) {
    throw new AppError(
      "One or both users are already in a team for this session.",
      409,
    );
  }
};

// a user registers with a friend
const registerTeam = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;
    const { partner_id } = req.body; // friend id
    const senderId = req.user.id;

    if (!partner_id) {
      throw new AppError(
        "You must provide a partner_id to register a team.",
        400,
      );
    }

    if (senderId === partner_id) {
      throw new AppError("You cannot partner with yourself.", 400);
    }

    const userIds = [senderId, partner_id].filter((id) => id != null);

    // ensure neither user is already in a team
    await checkExistingTeams(sessionId, userIds);

    const newTeam = await Team.create({
      session_id: sessionId,
      opener: senderId,
      closer: partner_id,
    });

    // remove them from the waitlist if they were on it
    await Waitlist.destroy({
      where: {
        session_id: sessionId,
        user_id: { [Op.in]: userIds },
      },
    });

    res.status(201).json({ status: "success", data: newTeam });
  } catch (error) {
    next(error);
  }
};

// Owner manually pairs two users
const createTeam = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;
    const { opener, closer } = req.body; // IDs of the two users

    if (!opener || !closer) {
      throw new AppError("A team must have exactly two players.", 400);
    }

    // now the judge can assign the ironman (opener and closer share the same id)

    const userIds = [opener, closer].filter((id) => id != null);

    // ensure neither user is already in a team
    await checkExistingTeams(sessionId, userIds);

    const newTeam = await Team.create({
      session_id: sessionId,
      opener: opener,
      closer: closer,
    });

    // remove them from the waitlist if they were on it
    await Waitlist.destroy({
      where: {
        session_id: sessionId,
        user_id: { [Op.in]: userIds },
      },
    });

    res.status(201).json({ status: "success", data: newTeam });
  } catch (error) {
    next(error);
  }
};

// now everyone can fetch all teams for the Session
const getSessionTeams = async (req, res, next) => {
  try {
    const sessionId = req.params.sessionId;

    // fetch the session just to get its name for the response
    const session = await Session.findByPk(sessionId, {
      attributes: ["id", "name"],
    });
    if (!session) throw new AppError("Session not found.", 404);

    const teams = await Team.findAll({
      where: { session_id: sessionId },
      attributes: ["id"],
      include: [
        { model: User, as: "OpenerData", attributes: ["id", "username"] },
        { model: User, as: "CloserData", attributes: ["id", "username"] },
      ],
    });

    res
      .status(200)
      .json({ status: "success", data: { session: session, teams: teams } });
  } catch (error) {
    next(error);
  }
};

// owner replaces a player or swaps roles
const updateTeam = async (req, res, next) => {
  try {
    const { opener, closer } = req.body;
    const team = await Team.findByPk(req.params.teamId);

    if (!team) throw new AppError("Team not found.", 404);

    const newUserIds = [opener, closer].filter((id) => id != null);

    // check if the NEW players are already in another team
    const existingTeam = await Team.findOne({
      where: {
        session_id: team.session_id,
        id: { [Op.ne]: team.id }, // (exclude the current team's ID)
        [Op.or]: [
          { opener: { [Op.in]: newUserIds } },
          { closer: { [Op.in]: newUserIds } },
        ],
      },
    });

    if (existingTeam)
      throw new AppError(
        "One of these users is already in a different team.",
        409,
      );

    // identify who is being removed from the team => put them back on the waitlist
    const oldUsers = [team.opener, team.closer].filter((id) => id != null);
    const removedUsers = oldUsers.filter((id) => !newUserIds.includes(id));

    // update the team
    team.opener = opener || null;
    team.closer = closer || null;
    await team.save();

    // remove the NEW players from the waitlist
    if (newUserIds.length > 0) {
      await Waitlist.destroy({
        where: {
          session_id: team.session_id,
          user_id: { [Op.in]: newUserIds },
        },
      });
    }

    // and put the REMOVED players back on the waitlist safely
    for (const userId of removedUsers) {
      await Waitlist.findOrCreate({
        where: { session_id: team.session_id, user_id: userId },
      });
    }

    res.status(200).json({ status: "success", data: team });
  } catch (error) {
    next(error);
  }
};

// Owner dissolves a team (disband)
const deleteTeam = async (req, res, next) => {
  try {
    const team = await Team.findByPk(req.params.teamId);
    if (!team) throw new AppError("Team not found.", 404);

    const usersToWaitlist = [team.opener, team.closer].filter(
      (id) => id != null,
    );

    await team.destroy();

    // return the players to the waitlist
    for (const userId of usersToWaitlist) {
      await Waitlist.findOrCreate({
        where: { session_id: team.session_id, user_id: userId },
      });
    }

    res.status(200).json({
      status: "success",
      message: "Team dissolved. Players returned to the waitlist.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerTeam,
  createTeam,
  getSessionTeams,
  updateTeam,
  deleteTeam,
};
