const {
  Room,
  RoomTeam,
  RoomSpeaker,
  RoomAdjudicator,
  Format,
  Score,
  sequelize,
} = require("../models");
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

    if (!Array.isArray(teamRankings) || teamRankings.length === 0) {
      throw new AppError("teamRankings must be a non-empty array.", 400);
    }
    if (!Array.isArray(speakerScores) || speakerScores.length === 0) {
      throw new AppError("speakerScores must be a non-empty array.", 400);
    }

    // prevent duplicate Teams
    const submittedTeamIds = new Set(teamRankings.map((t) => t.room_team_id));
    if (submittedTeamIds.size !== teamRankings.length) {
      throw new AppError(
        "Duplicate teams found in rankings. Each team can only be ranked once.",
        400,
      );
    }

    // prevent duplicate Speakers
    const submittedSpeakerIds = new Set(
      speakerScores.map((s) => s.room_speaker_id),
    );
    if (submittedSpeakerIds.size !== speakerScores.length) {
      throw new AppError(
        "Duplicate speakers found in scores. Each speaker can only be scored once.",
        400,
      );
    }

    // row-lock the room so concurrent chair submissions can't both
    // pass the status check and bulk-insert scores before the status flip.
    // `of: Room` so the joined Format isn't locked (Postgres rejects FOR
    // UPDATE on the nullable side of an outer join).
    const room = await Room.findByPk(roomId, {
      include: [Format],
      lock: { level: transaction.LOCK.UPDATE, of: Room },
      transaction,
    });
    if (!room) throw new AppError("Room not found.", 404);

    if (room.status === "completed" || room.status === "void") {
      throw new AppError(
        `Cannot submit scores. Room is already ${room.status}.`,
        409,
      );
    }

    const format = room.Format;

    // team ranks must be a permutation of 1..teams_per_room
    if (teamRankings.length !== format.teams_per_room) {
      throw new AppError(
        `Format ${format.code} requires exactly ${format.teams_per_room} team rankings. You provided ${teamRankings.length}.`,
        400,
      );
    }
    const sortedRanks = teamRankings.map((r) => r.rank).sort((a, b) => a - b);
    for (let i = 0; i < sortedRanks.length; i++) {
      if (sortedRanks[i] !== i + 1) {
        throw new AppError(
          `Team ranks must be a permutation of 1..${format.teams_per_room}.`,
          400,
        );
      }
    }

    // authorisation is already guaranteed by the middleware
    // yet still need to fetch the Chair's ID to attribute the scores to them
    const adjudicatorRecord = await RoomAdjudicator.findOne({
      where: { room_id: roomId, role: "chair" },
      transaction,
    });

    if (!adjudicatorRecord) {
      throw new AppError(
        "Cannot submit scores. This room lacks a designated chair.",
        400,
      );
    }
    const roomAdjudicatorId = adjudicatorRecord.id;

    // Set to store all valid speaker IDs that belong to this room
    const validSpeakerIds = new Set();

    // update Team Rankings and force Speaker inheritance
    for (const teamData of teamRankings) {
      const roomTeam = await RoomTeam.findByPk(teamData.room_team_id, {
        include: [RoomSpeaker],
        transaction,
      });

      if (!roomTeam || roomTeam.room_id !== room.id) {
        throw new AppError(
          `Invalid room_team_id: ${teamData.room_team_id} does not belong to this room.`,
          400,
        );
      }

      roomTeam.rank = teamData.rank;
      await roomTeam.save({ transaction });

      // apply the rank to the speakers and harvest their IDs for validation
      for (const speaker of roomTeam.RoomSpeakers) {
        validSpeakerIds.add(speaker.id);
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
      // missplaced speaker from another room
      if (!validSpeakerIds.has(sp.room_speaker_id)) {
        throw new AppError(
          `Invalid room_speaker_id: ${sp.room_speaker_id} does not belong to this room.`,
          400,
        );
      }

      // score must be a finite number
      const score = Number(sp.score);
      if (!Number.isFinite(score)) {
        throw new AppError(
          `Score for speaker ${sp.room_speaker_id} must be a number.`,
          400,
        );
      }

      // format boundary validation
      if (score < format.score_min || score > format.score_max) {
        throw new AppError(
          `Score ${score} is out of bounds for format ${format.code} (${format.score_min}-${format.score_max}).`,
          400,
        );
      }

      // Score row
      scoresToInsert.push({
        room_speaker_id: sp.room_speaker_id,
        room_adjudicator_id: roomAdjudicatorId,
        value: score,
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
