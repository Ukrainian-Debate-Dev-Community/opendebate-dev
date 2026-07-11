const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Organisation,
  Event,
  Round,
  Format,
  EventParticipant,
  Team,
  Room,
  RoomAdjudicator,
  RoomTeam,
  RoomSpeaker,
  Score,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Scoring and Stats API Endpoints", () => {
  let adminToken;
  let chairToken;
  let panelistToken;
  let randomToken;

  let targetUserId;
  let chairUserId;
  let roomId;
  let completedRoomId;
  let noChairRoomId;

  let roomTeam1Id, roomTeam2Id;
  let roomSpeaker1Id, roomSpeaker2Id, roomSpeaker3Id, roomSpeaker4Id;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    const adminUser = await User.create({
      username: "admin_user",
      password: "hashedpassword123",
    });
    adminToken = jwt.sign(
      { id: adminUser.id, isAdmin: true },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create User for a stat check
    const targetUser = await User.create({
      username: "target_speaker",
      password: "hashedpassword123",
    });
    targetUserId = targetUser.id;

    // create Chair User for submission
    const chairUser = await User.create({
      username: "chair_judge",
      password: "hashedpassword123",
    });
    chairUserId = chairUser.id;
    chairToken = jwt.sign(
      { id: chairUserId, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const panelistUser = await User.create({
      username: "panelist_judge",
      password: "hashedpassword123",
    });
    panelistToken = jwt.sign(
      { id: panelistUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const randomUser = await User.create({
      username: "random_user",
      password: "hashedpassword123",
    });
    randomToken = jwt.sign(
      { id: randomUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create Org, Event, Round
    const org = await Organisation.create({ name: "Scoring Org" });
    const event = await Event.create({
      organisation_id: org.id,
      name: "Scoring Event",
    });

    // Standard Visible Round
    const round = await Round.create({
      event_id: event.id,
      name: "Round 1",
      sequence: 1,
      is_hidden: false,
    });

    // Secret Hidden Round for Stat Exclusion Test
    const hiddenRound = await Round.create({
      event_id: event.id,
      name: "Secret Final",
      sequence: 2,
      is_hidden: true,
    });

    const format = await Format.create({
      name: "Standard",
      code: "STD",
      teams_per_room: 2,
      speakers_per_team: 2,
      score_min: 50,
      score_max: 100,
    });

    // create participants (targetUser, 3 speakers, chair and panelist)
    const pTarget = await EventParticipant.create({
      event_id: event.id,
      display_name: "Target",
      role: "speaker",
      user_id: targetUserId,
    });
    const pS2 = await EventParticipant.create({
      event_id: event.id,
      display_name: "S2",
      role: "speaker",
    });
    const pS3 = await EventParticipant.create({
      event_id: event.id,
      display_name: "S3",
      role: "speaker",
    });
    const pS4 = await EventParticipant.create({
      event_id: event.id,
      display_name: "S4",
      role: "speaker",
    });

    const pChair = await EventParticipant.create({
      event_id: event.id,
      display_name: "Chair",
      role: "adjudicator",
      user_id: chairUserId,
    });
    const pPanelist = await EventParticipant.create({
      event_id: event.id,
      display_name: "Panelist",
      role: "adjudicator",
      user_id: panelistUser.id,
    });

    const team1 = await Team.create({ event_id: event.id, name: "Team 1" });
    const team2 = await Team.create({ event_id: event.id, name: "Team 2" });

    // pending room
    const room = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "pending",
    });
    roomId = room.id;

    await RoomAdjudicator.create({
      room_id: roomId,
      participant_id: pChair.id,
      role: "chair",
    });
    await RoomAdjudicator.create({
      room_id: roomId,
      participant_id: pPanelist.id,
      role: "panelist",
    });

    const rt1 = await RoomTeam.create({
      room_id: roomId,
      team_id: team1.id,
      position: 1,
    });
    const rt2 = await RoomTeam.create({
      room_id: roomId,
      team_id: team2.id,
      position: 2,
    });
    roomTeam1Id = rt1.id;
    roomTeam2Id = rt2.id;

    const rs1 = await RoomSpeaker.create({
      room_team_id: roomTeam1Id,
      participant_id: pTarget.id,
      speech_position: 1,
    });
    const rs2 = await RoomSpeaker.create({
      room_team_id: roomTeam1Id,
      participant_id: pS2.id,
      speech_position: 2,
    });
    const rs3 = await RoomSpeaker.create({
      room_team_id: roomTeam2Id,
      participant_id: pS3.id,
      speech_position: 1,
    });
    const rs4 = await RoomSpeaker.create({
      room_team_id: roomTeam2Id,
      participant_id: pS4.id,
      speech_position: 2,
    });
    roomSpeaker1Id = rs1.id;
    roomSpeaker2Id = rs2.id;
    roomSpeaker3Id = rs3.id;
    roomSpeaker4Id = rs4.id;

    // completed room
    const completedRoom = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "completed",
    });
    completedRoomId = completedRoom.id;

    await RoomAdjudicator.create({
      room_id: completedRoomId,
      participant_id: pChair.id,
      role: "chair",
    });

    // no chair room
    const noChairRoom = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "pending",
    });
    noChairRoomId = noChairRoom.id;

    // hidden room with the 1st place for target
    const hiddenRoom = await Room.create({
      round_id: hiddenRound.id,
      format_id: format.id,
      status: "completed",
    });
    const hiddenAdj = await RoomAdjudicator.create({
      room_id: hiddenRoom.id,
      participant_id: pChair.id,
      role: "chair",
    });
    const hiddenRt = await RoomTeam.create({
      room_id: hiddenRoom.id,
      team_id: team1.id,
      position: 1,
      rank: 1,
    });
    const hiddenRs = await RoomSpeaker.create({
      room_team_id: hiddenRt.id,
      participant_id: pTarget.id,
      speech_position: 1,
      rank: 1,
    });
    await Score.create({
      room_speaker_id: hiddenRs.id,
      room_adjudicator_id: hiddenAdj.id,
      value: 85,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part (Scoring)
  describe("POST /api/rooms/:roomId/scores", () => {
    it("should return 400 if speakerScores array is missing/empty", async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${chairToken}`)
        .send({
          teamRankings: [
            { room_team_id: roomTeam1Id, rank: 1 },
            { room_team_id: roomTeam2Id, rank: 2 },
          ],
          speakerScores: [],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /speakerScores must be a non-empty array/i,
      );
    });

    it("should return 400 if teamRankings arrays are missing/empty", async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${chairToken}`)
        .send({
          teamRankings: [],
          speakerScores: [],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /teamRankings must be a non-empty array/i,
      );
    });

    it("should return 403 if a Panelist or non-Chair tries to submit scores", async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${panelistToken}`)
        .send({
          teamRankings: [
            { room_team_id: roomTeam1Id, rank: 1 },
            { room_team_id: roomTeam2Id, rank: 2 },
          ],
          speakerScores: [
            { room_speaker_id: roomSpeaker1Id, score: 80 },
            { room_speaker_id: roomSpeaker2Id, score: 80 },
            { room_speaker_id: roomSpeaker3Id, score: 75 },
            { room_speaker_id: roomSpeaker4Id, score: 75 },
          ],
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /Unauthorised: Only the designated Chair \(or an Owner\/Organiser\) can perform this action/i,
      );
    });

    it("should return 400 if the room lacks a designated chair", async () => {
      const res = await request(app)
        .post(`/api/rooms/${noChairRoomId}/scores`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          teamRankings: [
            { room_team_id: roomTeam1Id, rank: 1 },
            { room_team_id: roomTeam2Id, rank: 2 },
          ],
          speakerScores: [
            { room_speaker_id: roomSpeaker1Id, score: 80 },
            { room_speaker_id: roomSpeaker2Id, score: 80 },
            { room_speaker_id: roomSpeaker3Id, score: 75 },
            { room_speaker_id: roomSpeaker4Id, score: 75 },
          ],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/lacks a designated chair/i);
    });

    it("should return 409 if the room is already completed or void", async () => {
      const res = await request(app)
        .post(`/api/rooms/${completedRoomId}/scores`)
        .set("Authorization", `Bearer ${chairToken}`)
        .send({
          teamRankings: [{ room_team_id: 1, rank: 1 }],
          speakerScores: [{ room_speaker_id: 1, score: 75 }],
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/Cannot submit scores/i);
    });

    it("should return 400 for duplicate teams in rankings", async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${chairToken}`)
        .send({
          teamRankings: [
            { room_team_id: roomTeam1Id, rank: 1 },
            { room_team_id: roomTeam1Id, rank: 2 },
          ],
          speakerScores: [{ room_speaker_id: roomSpeaker1Id, score: 80 }],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Duplicate teams found/i);
    });

    it("should return 400 for duplicate speakers in scores", async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${chairToken}`)
        .send({
          teamRankings: [
            { room_team_id: roomTeam1Id, rank: 1 },
            { room_team_id: roomTeam2Id, rank: 2 },
          ],
          speakerScores: [
            { room_speaker_id: roomSpeaker1Id, score: 80 },
            { room_speaker_id: roomSpeaker1Id, score: 75 },
          ],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Duplicate speakers found/i);
    });

    it("should return 400 if team rankings are not a valid permutation", async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${chairToken}`)
        .send({
          teamRankings: [
            { room_team_id: roomTeam1Id, rank: 1 },
            { room_team_id: roomTeam2Id, rank: 3 },
          ],
          speakerScores: [
            { room_speaker_id: roomSpeaker1Id, score: 80 },
            { room_speaker_id: roomSpeaker2Id, score: 80 },
            { room_speaker_id: roomSpeaker3Id, score: 75 },
            { room_speaker_id: roomSpeaker4Id, score: 75 },
          ],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Team ranks must be a permutation/i);
    });

    it("should return 400 if an external room_team_id or room_speaker_id is provided", async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${chairToken}`)
        .send({
          teamRankings: [
            { room_team_id: roomTeam1Id, rank: 1 },
            { room_team_id: roomTeam2Id, rank: 2 },
          ],
          speakerScores: [
            { room_speaker_id: 99999, score: 80 },
            { room_speaker_id: roomSpeaker2Id, score: 80 },
            { room_speaker_id: roomSpeaker3Id, score: 75 },
            { room_speaker_id: roomSpeaker4Id, score: 75 },
          ],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/does not belong to this room/i);
    });

    it("should return 400 if a score is outside format boundaries", async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${chairToken}`)
        .send({
          teamRankings: [
            { room_team_id: roomTeam1Id, rank: 1 },
            { room_team_id: roomTeam2Id, rank: 2 },
          ],
          speakerScores: [
            { room_speaker_id: roomSpeaker1Id, score: 105 },
            { room_speaker_id: roomSpeaker2Id, score: 80 },
            { room_speaker_id: roomSpeaker3Id, score: 75 },
            { room_speaker_id: roomSpeaker4Id, score: 75 },
          ],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/out of bounds for format/i);
    });

    it("should successfully process a valid ballot and close the room", async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${chairToken}`)
        .send({
          teamRankings: [
            { room_team_id: roomTeam1Id, rank: 1 },
            { room_team_id: roomTeam2Id, rank: 2 },
          ],
          speakerScores: [
            { room_speaker_id: roomSpeaker1Id, score: 80 },
            { room_speaker_id: roomSpeaker2Id, score: 80 },
            { room_speaker_id: roomSpeaker3Id, score: 70 },
            { room_speaker_id: roomSpeaker4Id, score: 70 },
          ],
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Scores submitted successfully/i);

      // verify completed state in the DB
      const dbRoom = await Room.findByPk(roomId);
      expect(dbRoom.status).toBe("completed");
    });
  });

  // GET part (Stat check)
  describe("GET /api/users/:id/stats", () => {
    it("should return a null data object with a message for a user with no debates", async () => {
      const res = await request(app)
        .get(`/api/users/99999/stats`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data).toBeNull();
      expect(res.body.message).toMatch(
        /This user has not participated as a speaker in any logged debates/i,
      );
    });

    it("should compile stats strictly from visible rounds, ignoring hidden data", async () => {
      // despite the target user scoring an 85 and a 1st place in the hidden round,
      // this endpoint should only compile the 80 and the 1st place from the visible round.
      const res = await request(app)
        .get(`/api/users/${targetUserId}/stats`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);

      const stats = res.body.data;

      expect(stats.overview.total_ballots_received).toBe(1);
      expect(stats.overview.total_debates_ranked).toBe(1);

      // shouldn't count the 85 from the hidden round
      expect(stats.overview.average_speaker_score).toBe("80.00");
      expect(stats.overview.highest_score).toBe(80);
      expect(stats.overview.lowest_score).toBe(80);

      // should only show 1 win, not 2
      expect(stats.placements.first_places).toBe(1);
      expect(stats.placements.win_rate_percentage).toBe("100.0");
    });
  });
});
