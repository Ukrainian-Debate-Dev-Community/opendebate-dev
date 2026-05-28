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
  let brokenTeamId; // a team with the wrong number of speakers

  let chairId;
  let panelistId;
  let busyChairId; // someone already in a room

  let roomId;

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

    // setup Participants (4 standard speakers, 1 broken speaker, 3 judges)
    const parts = await EventParticipant.bulkCreate([
      { event_id: eventId, display_name: "S1", role: "speaker" },
      { event_id: eventId, display_name: "S2", role: "speaker" },
      { event_id: eventId, display_name: "S3", role: "speaker" },
      { event_id: eventId, display_name: "S4", role: "speaker" },
      { event_id: eventId, display_name: "S5_Broken", role: "speaker" }, // for broken team
      { event_id: eventId, display_name: "J1_Chair", role: "adjudicator" },
      { event_id: eventId, display_name: "J2_Panelist", role: "adjudicator" },
      { event_id: eventId, display_name: "J3_Busy", role: "adjudicator" },
    ]);

    chairId = parts[5].id;
    panelistId = parts[6].id;
    busyChairId = parts[7].id;

    // create Teams
    const team1 = await Team.create({ round_id: roundId, name: "Team 1" });
    team1Id = team1.id;
    await TeamMember.bulkCreate([
      { team_id: team1Id, participant_id: parts[0].id, speaker_order: 1 },
      { team_id: team1Id, participant_id: parts[1].id, speaker_order: 2 },
    ]);

    const team2 = await Team.create({ round_id: roundId, name: "Team 2" });
    team2Id = team2.id;
    await TeamMember.bulkCreate([
      { team_id: team2Id, participant_id: parts[2].id, speaker_order: 1 },
      { team_id: team2Id, participant_id: parts[3].id, speaker_order: 2 },
    ]);

    // broken team (1 speaker)
    const brokenTeam = await Team.create({
      round_id: roundId,
      name: "Team Broken",
    });
    brokenTeamId = brokenTeam.id;
    await TeamMember.create({
      team_id: brokenTeamId,
      participant_id: parts[4].id,
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

    it("should return 403 if the round is already completed", async () => {
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

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /Can't create the room for the round that is already completed/i,
      );
    });

    it("should return 400 if a requested team does not exist or belong to the round", async () => {
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

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /do not exist, are duplicated, or do not belong/i,
      );
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
        /do not exist, are duplicated, or do not belong/i,
      );
    });

    it("should return 400 if teams array length does not match format requirements", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          teams: [{ team_id: team1Id, position: 1 }],
          adjudicators: [{ participant_id: chairId, role: "chair" }],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/requires exactly 2 teams per room/i);
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

    it("should successfully create a room and attach related speakers and adjudicators", async () => {
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

      // verify the room was created in the DB to grab its ID
      const rooms = await Room.findAll({ where: { round_id: roundId } });
      roomId = rooms[0].id;
    });

    it("should return 409 if attempting to double-book a team already in a room", async () => {
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
  });

  // GET part
  describe("GET /api/rounds/:roundId/rooms", () => {
    it("should successfully retrieve nested room structures for the round", async () => {
      const res = await request(app)
        .get(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${randomToken}`); // no restrictions on the route, so should work

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(2);

      const room = res.body.data[0];
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

    it("should return 409 if trying to delete a room that is judging or completed", async () => {
      // forcce the judging status
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

    it("should return 404 for a non-existent room", async () => {
      const res = await request(app)
        .delete(`/api/rooms/99999`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Room not found/i);
    });

    it("should successfully delete a pending room", async () => {
      const res = await request(app)
        .delete(`/api/rooms/${roomId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Room deleted successfully/i);

      // verify the deletion worked
      const dbCheck = await Room.findByPk(roomId);
      expect(dbCheck).toBeNull();
    });
  });
});
