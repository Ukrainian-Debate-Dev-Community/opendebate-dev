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
  RoomTeam,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Team API Endpoints", () => {
  let ownerToken;
  let randomToken;

  let orgId;
  let eventId;
  let activeRoomId;

  let p1, p2, p3, p4, p5;
  let team1Id;

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

    // create Org and Event
    const org = await Organisation.create({ name: "Team Test Org" });
    orgId = org.id;

    await Owner.create({
      user_id: orgOwner.id,
      organisation_id: orgId,
    });

    const event = await Event.create({
      organisation_id: orgId,
      name: "Team Test Event",
      status: "scheduled",
    });
    eventId = event.id;

    // create Format and Round for testing active-room blocks
    const format = await Format.create({
      name: "Standard",
      code: "STD",
      teams_per_room: 2,
      speakers_per_team: 2,
      score_min: 50,
      score_max: 100,
    });

    const round = await Round.create({
      event_id: eventId,
      name: "Round 1",
      sequence: 1,
    });

    const activeRoom = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "pending", // will be flipped to judging during the test
    });
    activeRoomId = activeRoom.id;

    // create Event Participants
    const participants = await EventParticipant.bulkCreate([
      {
        event_id: eventId,
        display_name: "Alice",
        role: "speaker",
      },
      {
        event_id: eventId,
        display_name: "Bob",
        role: "speaker",
      },
      {
        event_id: eventId,
        display_name: "Charlie",
        role: "speaker",
      },
      {
        event_id: eventId,
        display_name: "John",
        role: "speaker",
      },
      {
        event_id: eventId,
        display_name: "Eve",
        role: "speaker",
      },
    ]);

    p1 = participants[0].id;
    p2 = participants[1].id;
    p3 = participants[2].id;
    p4 = participants[3].id;
    p5 = participants[4].id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/events/:eventId/teams", () => {
    it("should return 400 if participants are missing", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Incomplete Team", participant_ids: [] });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Please provide a team name and an array of participant IDs/i,
      );
    });

    it("should return 400 if name is missing", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ participant_ids: [p1, p2] });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Please provide a team name and an array of participant IDs/i,
      );
    });

    it("should return 400 if a participant does not belong to the event", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Invalid Team", participant_ids: [99998, 99999] });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /One or more participants are invalid or do not belong to this event/i,
      );
    });

    it("should return 404 if the event does not exist", async () => {
      const res = await request(app)
        .post(`/api/events/99999/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Missing Team", participant_ids: [p3, p4] });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Event not found/i);
    });

    it("should allow an Owner to create a permanent team", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Team A",
          participant_ids: [p1, p2],
          is_temporary: false,
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.name).toBe("Team A");
      expect(res.body.data.is_temporary).toBe(false);
      team1Id = res.body.data.id;

      const members = await TeamMember.findAll({ where: { team_id: team1Id } });
      expect(members.length).toBe(2);
      expect(members[0].speaker_order).toBe(1);
    });

    it("should return 409 if a participant is already in a permanent team", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Duplicate Team",
          participant_ids: [p1, p3],
          is_temporary: false,
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /already assigned to a permanent team in this event/i,
      );
    });

    it("should successfully allow the creation of a temporary team", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Temp Team 1",
          participant_ids: [p3, p4],
          is_temporary: true,
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.is_temporary).toBe(true);
    });

    it("should allow a participant to be in multiple temporary teams", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Temp Team 2",
          participant_ids: [p3, p5],
          is_temporary: true,
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.is_temporary).toBe(true);
    });

    it("should return 403 if a random user tries to create a team", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ name: "Hacked Team", participant_ids: [p3, p4] });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });
  });

  // GET part
  describe("GET /api/events/:eventId/teams", () => {
    it("should successfully fetch all teams for an event", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it("should successfully filter teams by is_temporary flag", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/teams?is_temporary=false`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe("Team A");
    });
  });

  // PUT part
  describe("PUT /api/events/:eventId/teams/:teamId", () => {
    it("should return 404 for a non-existent team", async () => {
      const res = await request(app)
        .put(`/api/events/${eventId}/teams/99999`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Updated Name" });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Team not found/i);
    });

    it("should allow an Owner to rename a team without touching members", async () => {
      const res = await request(app)
        .put(`/api/events/${eventId}/teams/${team1Id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Updated Team A" });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Team roster updated successfully/i);

      const dbCheck = await Team.findByPk(team1Id);
      expect(dbCheck.name).toBe("Updated Team A");
    });

    it("should return 400 if attempting to modify a team inside an active/completed room", async () => {
      const roomToLock = await Room.findByPk(activeRoomId);
      roomToLock.status = "judging";
      await roomToLock.save();

      await RoomTeam.create({
        room_id: activeRoomId,
        team_id: team1Id,
        position: 1,
      });

      const res = await request(app)
        .put(`/api/events/${eventId}/teams/${team1Id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ participant_ids: [p1, p3] });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /currently being judged or is already completed/i,
      );

      // back to pending for future testing and clean up RoomTeam
      roomToLock.status = "pending";
      await roomToLock.save();
      await RoomTeam.destroy({ where: { room_id: activeRoomId } });
    });

    it("should update members successfully", async () => {
      const res = await request(app)
        .put(`/api/events/${eventId}/teams/${team1Id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ participant_ids: [p3, p4] });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Team roster updated successfully/i);
    });
  });

  // DELETE part
  describe("DELETE /api/events/:eventId/teams/:teamId", () => {
    it("should return 403 if a random user tries to delete the team", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/teams/${team1Id}`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });

    it("should return 404 for a non-existent team", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/teams/99999`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Team not found/i);
    });

    it("should successfully delete a team", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/teams/${team1Id}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Team dissolved successfully/i);

      const dbCheck = await Team.findByPk(team1Id);
      expect(dbCheck).toBeNull();
    });
  });
});
