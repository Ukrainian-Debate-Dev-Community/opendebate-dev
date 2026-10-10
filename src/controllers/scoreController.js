const {
  Room,
  RoomTeam,
  RoomSpeaker,
  Team,
  TeamMember,
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
      speakerScores: [ { room_speaker_id: 1, score: 70 }, { room_speaker_id: 2, score: 71, is_iron: true }, ... ]
      is_iron is optional and only for one of an iron-person's two speeches;
      unmarked, the later of the two is the iron speech.
      participant_id is optional: the team member who actually gave that
      speech when it differs from the draw (a teammate who did not show);
      a member giving both speeches is an iron-person.
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
      include: [{ model: Format, paranoid: false }],
      lock: { level: transaction.LOCK.UPDATE, of: Room },
      transaction,
    });
    if (!room) throw new AppError("Room not found.", 404);

    // completed rooms stay editable: a resubmission atomically replaces the
    // previous ballot (ranks and scores). Only confirm locks, only void kills.
    if (room.status === "confirmed" || room.status === "void") {
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
    // the room's speeches per team, to settle which iron speech is the
    // one that stays out of the speaker standings
    const teamSpeakers = [];
    // who may give each slot's speech: the members of that slot's team
    const membersBySpeaker = new Map();

    // update Team Rankings and force Speaker inheritance
    for (const teamData of teamRankings) {
      const roomTeam = await RoomTeam.findByPk(teamData.room_team_id, {
        include: [RoomSpeaker, { model: Team, include: [TeamMember], paranoid: false }],
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
      const members = new Set(
        ((roomTeam.Team && roomTeam.Team.TeamMembers) || []).map((m) => m.participant_id),
      );
      for (const speaker of roomTeam.RoomSpeakers) {
        validSpeakerIds.add(speaker.id);
        speaker.rank = teamData.rank;
        membersBySpeaker.set(speaker.id, new Set([...members, speaker.participant_id]));
      }
      teamSpeakers.push(roomTeam.RoomSpeakers);
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

    // who actually spoke: a slot's speech may go to another member of
    // the same team (the drawn speaker did not show up)
    const speakersById = new Map(teamSpeakers.flat().map((s) => [s.id, s]));
    for (const sp of speakerScores) {
      if (sp.participant_id === undefined || sp.participant_id === null) continue;
      const allowed = membersBySpeaker.get(sp.room_speaker_id);
      if (!allowed || !allowed.has(sp.participant_id)) {
        throw new AppError(
          `Participant ${sp.participant_id} is not on the team of speaker ${sp.room_speaker_id}.`,
          400,
        );
      }
      speakersById.get(sp.room_speaker_id).participant_id = sp.participant_id;
    }

    // iron flags: within a team, a speech can be marked only when its
    // speaker holds both slots, and only one of the two; with none
    // marked, the later slot is the iron speech
    const marked = new Set(
      speakerScores.filter((sp) => sp.is_iron === true).map((sp) => sp.room_speaker_id),
    );
    for (const speakers of teamSpeakers) {
      const byParticipant = new Map();
      speakers.forEach((s) =>
        byParticipant.set(s.participant_id, [...(byParticipant.get(s.participant_id) || []), s]),
      );
      for (const speaker of speakers) {
        const twice = byParticipant.get(speaker.participant_id).length > 1;
        if (marked.has(speaker.id) && !twice) {
          throw new AppError(
            `Speaker ${speaker.id} is not an iron-person's speech and cannot be marked iron.`,
            400,
          );
        }
      }
      for (const pair of byParticipant.values()) {
        if (pair.length < 2) {
          pair.forEach((s) => {
            s.is_iron = false;
          });
          continue;
        }
        const flagged = pair.filter((s) => marked.has(s.id));
        if (flagged.length > 1) {
          throw new AppError("Only one of an iron-person's speeches can be marked iron.", 400);
        }
        const iron = flagged[0] || pair.reduce((a, b) => (b.id > a.id ? b : a));
        pair.forEach((s) => {
          s.is_iron = s.id === iron.id;
        });
      }
      for (const speaker of speakers) await speaker.save({ transaction });
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

// organiser/tab action: lock a submitted ballot. A confirmed room can no
// longer be rescored until it is explicitly unconfirmed.
const confirmRoom = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const room = await Room.findByPk(req.params.roomId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!room) throw new AppError("Room not found.", 404);

    if (room.status !== "completed") {
      throw new AppError(
        `Cannot confirm room. Only completed rooms can be confirmed (current status: ${room.status}).`,
        409,
      );
    }

    room.status = "confirmed";
    await room.save({ transaction });

    await transaction.commit();

    res.status(200).json({
      status: "success",
      message: "Ballot confirmed. The room is now locked.",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

// escape hatch for an accidental confirmation — returns the room to
// 'completed' so the ordinary resubmit flow applies again.
const unconfirmRoom = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const room = await Room.findByPk(req.params.roomId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!room) throw new AppError("Room not found.", 404);

    if (room.status !== "confirmed") {
      throw new AppError(
        `Cannot unconfirm room. Only confirmed rooms can be unconfirmed (current status: ${room.status}).`,
        409,
      );
    }

    room.status = "completed";
    await room.save({ transaction });

    await transaction.commit();

    res.status(200).json({
      status: "success",
      message: "Ballot unlocked. The room is back to completed.",
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

module.exports = { submitScores, confirmRoom, unconfirmRoom };
