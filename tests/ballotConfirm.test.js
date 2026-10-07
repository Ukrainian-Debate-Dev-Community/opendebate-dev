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
  Room,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Ballot Confirmation Flow", () => {
  let ownerToken;
  let randomToken;

  let completedRoomId;
  let pendingRoomId;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const orgOwner = await User.create({
      username: "confirm_owner",
      password: "hashedpassword123",
    });
    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const randomUser = await User.create({
      username: "confirm_random",
      password: "hashedpassword123",
    });
    randomToken = jwt.sign(
      { id: randomUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const org = await Organisation.create({ name: "Confirm Org" });
    await Owner.create({ user_id: orgOwner.id, organisation_id: org.id });

    const event = await Event.create({
      organisation_id: org.id,
      name: "Confirm Event",
    });

    const round = await Round.create({
      event_id: event.id,
      name: "Round 1",
      sequence: 1,
    });

    const format = await Format.create({
      name: "Duo",
      code: "DUO",
      teams_per_room: 2,
      speakers_per_team: 1,
      score_min: 50,
      score_max: 100,
    });

    const completedRoom = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "completed",
    });
    completedRoomId = completedRoom.id;

    const pendingRoom = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "pending",
    });
    pendingRoomId = pendingRoom.id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe("PATCH /api/rooms/:roomId/confirm", () => {
    it("should return 403 for a user without organiser privileges", async () => {
      const res = await request(app)
        .patch(`/api/rooms/${completedRoomId}/confirm`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
    });

    it("should return 409 when confirming a room that is not completed", async () => {
      const res = await request(app)
        .patch(`/api/rooms/${pendingRoomId}/confirm`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/Only completed rooms can be confirmed/i);
    });

    it("should return 404 for a missing room", async () => {
      const res = await request(app)
        .patch("/api/rooms/99999/confirm")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(404);
    });

    it("should confirm a completed room", async () => {
      const res = await request(app)
        .patch(`/api/rooms/${completedRoomId}/confirm`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Ballot confirmed/i);

      const room = await Room.findByPk(completedRoomId);
      expect(room.status).toBe("confirmed");
    });
  });

  describe("confirmed rooms are locked", () => {
    it("should refuse score submission for a confirmed room", async () => {
      const res = await request(app)
        .post(`/api/rooms/${completedRoomId}/scores`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          teamRankings: [{ room_team_id: 1, rank: 1 }],
          speakerScores: [{ room_speaker_id: 1, score: 70 }],
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/already confirmed/i);
    });

    it("should refuse to delete a confirmed room", async () => {
      const res = await request(app)
        .delete(`/api/rooms/${completedRoomId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/Cannot delete a room in 'confirmed'/i);
    });
  });

  describe("PATCH /api/rooms/:roomId/unconfirm", () => {
    it("should return 409 when unconfirming a room that is not confirmed", async () => {
      const res = await request(app)
        .patch(`/api/rooms/${pendingRoomId}/unconfirm`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /Only confirmed rooms can be unconfirmed/i,
      );
    });

    it("should unlock a confirmed room back to completed", async () => {
      const res = await request(app)
        .patch(`/api/rooms/${completedRoomId}/unconfirm`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);

      const room = await Room.findByPk(completedRoomId);
      expect(room.status).toBe("completed");
    });

    it("should accept score resubmission again after unconfirm", async () => {
      // the 409 lock is gone: the request reaches payload validation
      // (this fixture room has no teams, so the format check rejects it)
      const res = await request(app)
        .post(`/api/rooms/${completedRoomId}/scores`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          teamRankings: [{ room_team_id: 1, rank: 1 }],
          speakerScores: [{ room_speaker_id: 1, score: 70 }],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/requires exactly/i);
    });
  });
});
