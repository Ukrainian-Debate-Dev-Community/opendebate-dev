const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Organisation,
  Owner,
  Event,
  Round,
  Format,
  EventParticipant,
  Team,
  TeamMember,
  Room,
  RoomAdjudicator,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Room API Endpoints", () => {
  let ownerToken;
  let randomToken;

  let orgId;
  let eventId;
  let roundId;
  let completedRoundId;
  let formatId;

  let team1Id;
  let team2Id;
  let brokenTeamId;

  let p1, p2, p3, p4, p_broken;
  let chairId;
  let panelistId;
  let busyChairId;
  let freeChairId;

  let roomId;
  let roomWithTempTeamId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    // create Owner User
    const orgOwner = await User.create({
      username: "org_owner",
      password: "hashedpassword123",
    });
    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create Random User
    const randomUser = await User.create({
      username: "random_user",
      password: "hashedpassword123",
    });
    randomToken = jwt.sign(
      { id: randomUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create Org, Event and Rounds
    const org = await Organisation.create({ name: "Room Test Org" });
    orgId = org.id;
    await Owner.create({ user_id: orgOwner.id, organisation_id: orgId });

    const event = await Event.create({
      organisation_id: orgId,
      name: "Room Event",
    });
    eventId = event.id;

    const round = await Round.create({
      event_id: eventId,
      name: "Round 1",
      sequence: 1,
    });
    roundId = round.id;

    const completedRound = await Round.create({
      event_id: eventId,
      name: "Round 2",
      sequence: 2,
      status: "completed",
    });
    completedRoundId = completedRound.id;

    // create Format
    const format = await Format.create({
      name: "Standard",
      code: "STD",
      teams_per_room: 2,
      speakers_per_team: 2,
      score_min: 50,
      score_max: 100,
    });
    formatId = format.id;

    // setup Participants
    const parts = await EventParticipant.bulkCreate([
      { event_id: eventId, display_name: "S1", role: "speaker" },
      { event_id: eventId, display_name: "S2", role: "speaker" },
      { event_id: eventId, display_name: "S3", role: "speaker" },
      { event_id: eventId, display_name: "S4", role: "speaker" },
      { event_id: eventId, display_name: "S5_Broken", role: "speaker" },
      { event_id: eventId, display_name: "J1_Chair", role: "adjudicator" },
      { event_id: eventId, display_name: "J2_Panelist", role: "adjudicator" },
      { event_id: eventId, display_name: "J3_Busy", role: "adjudicator" },
      { event_id: eventId, display_name: "J4_Free", role: "adjudicator" },
    ]);

    p1 = parts[0].id;
    p2 = parts[1].id;
    p3 = parts[2].id;
    p4 = parts[3].id;
    p_broken = parts[4].id;

    chairId = parts[5].id;
    panelistId = parts[6].id;
    busyChairId = parts[7].id;
    freeChairId = parts[8].id;

    // create Teams
    const team1 = await Team.create({ event_id: eventId, name: "Team 1" });
    team1Id = team1.id;
    await TeamMember.bulkCreate([
      { team_id: team1Id, participant_id: p1, speaker_order: 1 },
      { team_id: team1Id, participant_id: p2, speaker_order: 2 },
    ]);

    const team2 = await Team.create({ event_id: eventId, name: "Team 2" });
    team2Id = team2.id;
    await TeamMember.bulkCreate([
      { team_id: team2Id, participant_id: p3, speaker_order: 1 },
      { team_id: team2Id, participant_id: p4, speaker_order: 2 },
    ]);

    // broken team (1 speaker)
    const brokenTeam = await Team.create({
      event_id: eventId,
      name: "Team Broken",
    });
    brokenTeamId = brokenTeam.id;
    await TeamMember.create({
      team_id: brokenTeamId,
      participant_id: p_broken,
      speaker_order: 1,
    });

    // create room for double-book check
    const busyRoom = await Room.create({
      round_id: roundId,
      format_id: formatId,
    });
    await RoomAdjudicator.create({
      room_id: busyRoom.id,
      participant_id: busyChairId,
      role: "chair",
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/rounds/:roundId/rooms", () => {
    it("should return 400 if teams array is missing or empty", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [],
          adjudicators: [{ participant_id: chairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/teams must be a non-empty array/i);
    });

    it("should return 400 if adjudicators array is missing or empty", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: team2Id, position: 2 },
          ],
          adjudicators: [],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /adjudicators must be a non-empty array/i,
      );
    });

    it("should return 400 if an adjudicator is assigned an invalid role", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: team2Id, position: 2 },
          ],
          adjudicators: [{ participant_id: chairId, role: "invalid" }],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Invalid adjudicator role/i);
    });

    it("should return 404 if the requested format does not exist", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: 99999,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: team2Id, position: 2 },
          ],
          adjudicators: [{ participant_id: chairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Format not found/i);
    });

    it("should return 404 if the requested round does not exist", async () => {
      const res = await request(app)
        .post(`/api/rounds/99999/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: team2Id, position: 2 },
          ],
          adjudicators: [{ participant_id: chairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Round not found/i);
    });

    it("should return 409 if the round is already completed", async () => {
      const res = await request(app)
        .post(`/api/rounds/${completedRoundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: team2Id, position: 2 },
          ],
          adjudicators: [{ participant_id: chairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /Cannot create a room for a round that is already completed/i,
      );
    });

    it("should return 404 if a requested team does not exist in this event", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: 99999, position: 2 },
          ],
          adjudicators: [{ participant_id: chairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/not found in this event/i);
    });

    it("should return 400 if a requested adjudicator does not exist or belong to the event", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: team2Id, position: 2 },
          ],
          adjudicators: [{ participant_id: 99999, role: "chair" }],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /One or more adjudicators do not exist or do not belong/i,
      );
    });

    it("should return 400 if no 'chair' adjudicator is assigned", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: team2Id, position: 2 },
          ],
          adjudicators: [{ participant_id: panelistId, role: "panelist" }],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /at least one adjudicator with the role 'chair'/i,
      );
    });

    it("should return 400 if a team does not have the correct number of speakers for the format", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: brokenTeamId, position: 2 },
          ],
          adjudicators: [{ participant_id: chairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /does not have the required 2 speakers/i,
      );
    });

    it("should return 409 if attempting to double-book an adjudicator already in a room", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: team2Id, position: 2 },
          ],
          adjudicators: [{ participant_id: busyChairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /already assigned to a room in this round/i,
      );
    });

    it("should return 409 if attempting to schedule an eliminated permanent team", async () => {
      await Team.update({ is_eliminated: true }, { where: { id: team1Id } });

      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: team2Id, position: 2 },
          ],
          adjudicators: [{ participant_id: freeChairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/Cannot assign eliminated teams/i);

      await Team.update({ is_eliminated: false }, { where: { id: team1Id } });
    });

    it("should return 409 if attempting to schedule an eliminated speaker", async () => {
      await EventParticipant.update(
        { is_eliminated: true },
        { where: { id: p1 } },
      );

      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { participant_ids: [p1, p2], name: "Temp Eliminated", position: 1 },
            { team_id: team2Id, position: 2 },
          ],
          adjudicators: [{ participant_id: freeChairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /Cannot assign eliminated participants/i,
      );

      await EventParticipant.update(
        { is_eliminated: false },
        { where: { id: p1 } },
      );
    });

    it("should successfully create a room using Permanent Teams", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { team_id: team1Id, position: 1 },
            { team_id: team2Id, position: 2 },
          ],
          adjudicators: [
            { participant_id: chairId, role: "chair" },
            { participant_id: panelistId, role: "panelist" },
          ],
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.message).toMatch(/Room created successfully/i);

      const rooms = await Room.findAll({
        where: { round_id: roundId },
        order: [["id", "DESC"]],
      });
      roomId = rooms[0].id;
    });

    it("should return 409 if a speaker (and therefore team) is double-booked across different rooms", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { participant_ids: [p1, p3], name: "Temp Team C", position: 1 }, // p1 is already in roomId
            { participant_ids: [p2, p4], name: "Temp Team D", position: 2 },
          ],
          adjudicators: [{ participant_id: freeChairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /One or more speakers are already debating in a different room/i,
      );
    });

    it("should successfully create a room and generate Temporary Teams (Fight Club)", async () => {
      const parts = await EventParticipant.bulkCreate([
        { event_id: eventId, display_name: "S1", role: "speaker" },
        { event_id: eventId, display_name: "S2", role: "speaker" },
        { event_id: eventId, display_name: "S3", role: "speaker" },
        { event_id: eventId, display_name: "S4", role: "speaker" },
      ]);
      const s1 = parts[0].id,
        s2 = parts[1].id,
        s3 = parts[2].id,
        s4 = parts[3].id;

      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [
            { participant_ids: [s1, s2], name: "Temp Team A", position: 1 },
            { participant_ids: [s3, s4], name: "Temp Team B", position: 2 },
          ],
          adjudicators: [{ participant_id: freeChairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.message).toMatch(/Room created successfully/i);

      const tempTeamCheck = await Team.findOne({
        where: { name: "Temp Team A", is_temporary: true },
      });
      expect(tempTeamCheck).not.toBeNull();

      const rooms = await Room.findAll({
        where: { round_id: roundId },
        order: [["id", "DESC"]],
      });
      roomWithTempTeamId = rooms[0].id;
    });
  });

  // GET part
  describe("GET /api/rounds/:roundId/rooms", () => {
    it("should successfully retrieve nested room structures for the round", async () => {
      const res = await request(app)
        .get(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      const room = res.body.data.find((r) => r.id === roomId);
      expect(room.Format.code).toBe("STD");
      expect(room.RoomAdjudicators.length).toBe(2);
      expect(room.RoomTeams.length).toBe(2);

      // verify speaker mapping worked
      expect(room.RoomTeams[0].RoomSpeakers.length).toBe(2);
    });
  });

  // DELETE part
  describe("DELETE /api/rooms/:roomId", () => {
    it("should return 403 if a random user tries to delete the room", async () => {
      const res = await request(app)
        .delete(`/api/rooms/${roomId}`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });

    it("should return 404 for a non-existent room", async () => {
      const res = await request(app)
        .delete(`/api/rooms/99999`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Room not found/i);
    });

    it("should return 409 if trying to delete a room that is judging or completed", async () => {
      const roomToLock = await Room.findByPk(roomId);
      roomToLock.status = "judging";
      await roomToLock.save();

      const res = await request(app)
        .delete(`/api/rooms/${roomId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /Cannot delete a room in 'judging' state/i,
      );

      // reset it for the final test
      roomToLock.status = "pending";
      await roomToLock.save();
    });

    it("should successfully delete a room and preserve Permanent Teams", async () => {
      const res = await request(app)
        .delete(`/api/rooms/${roomId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);

      const dbCheck = await Room.findByPk(roomId);
      expect(dbCheck).toBeNull();

      const permTeamCheck = await Team.findByPk(team1Id);
      expect(permTeamCheck).not.toBeNull();
    });

    it("should successfully delete a room and dynamically purge Temporary Teams", async () => {
      const res = await request(app)
        .delete(`/api/rooms/${roomWithTempTeamId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);

      const tempTeamCheck = await Team.findOne({
        where: { name: "Temp Team A" },
      });
      expect(tempTeamCheck).toBeNull();
    });
  });
});
