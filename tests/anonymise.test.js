const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Admin,
  Organisation,
  Event,
  Round,
  Format,
  EventParticipant,
  Team,
  Room,
  RoomTeam,
  RoomSpeaker,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Admin User Anonymisation", () => {
  let adminToken;
  let regularToken;

  let targetUserId;
  let targetToken;
  let participantId;
  let roomSpeakerId;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const adminUser = await User.create({
      username: "anon_admin",
      password: "hashedpassword123",
    });
    await Admin.create({ user_id: adminUser.id });
    adminToken = jwt.sign(
      { id: adminUser.id, isAdmin: true },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const regularUser = await User.create({
      username: "anon_regular",
      password: "hashedpassword123",
    });
    regularToken = jwt.sign(
      { id: regularUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const targetUser = await User.create({
      username: "person_with_history",
      password: "hashedpassword123",
    });
    targetUserId = targetUser.id;
    targetToken = jwt.sign(
      { id: targetUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // build debate history for the target user
    const org = await Organisation.create({ name: "Anon Org" });
    const event = await Event.create({
      organisation_id: org.id,
      name: "Historic Event",
      status: "completed",
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

    const participant = await EventParticipant.create({
      event_id: event.id,
      user_id: targetUserId,
      display_name: "Real Person Name",
      role: "speaker",
    });
    participantId = participant.id;

    const team = await Team.create({ event_id: event.id, name: "History FC" });
    const room = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "completed",
    });
    const roomTeam = await RoomTeam.create({
      room_id: room.id,
      team_id: team.id,
      position: 1,
      rank: 1,
    });
    const roomSpeaker = await RoomSpeaker.create({
      room_team_id: roomTeam.id,
      participant_id: participantId,
      rank: 1,
    });
    roomSpeakerId = roomSpeaker.id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe("POST /api/admins/anonymise", () => {
    it("should return 403 for a non-admin caller", async () => {
      const res = await request(app)
        .post("/api/admins/anonymise")
        .set("Authorization", `Bearer ${regularToken}`)
        .send({ targetUserId });

      expect(res.statusCode).toEqual(403);
    });

    it("should return 400 if targetUserId is missing", async () => {
      const res = await request(app)
        .post("/api/admins/anonymise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Please provide the targetUserId/i);
    });

    it("should return 404 if the target user does not exist", async () => {
      const res = await request(app)
        .post("/api/admins/anonymise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetUserId: 99999 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/User not found/i);
    });

    it("should anonymise the user while preserving history", async () => {
      const res = await request(app)
        .post("/api/admins/anonymise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetUserId });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/anonymised successfully/i);

      const user = await User.findByPk(targetUserId);
      expect(user.username).toBe(`deleted_user_${targetUserId}`);
      expect(user.is_deleted).toBe(true);
      expect(user.password).not.toBe("hashedpassword123");

      // PII scrubbed from participant records
      const participant = await EventParticipant.findByPk(participantId);
      expect(participant.display_name).toBe(`deleted_user_${targetUserId}`);
      // but the record and its user link survive for historical integrity
      expect(participant.user_id).toBe(targetUserId);

      // debate history remains intact
      const roomSpeaker = await RoomSpeaker.findByPk(roomSpeakerId);
      expect(roomSpeaker).not.toBeNull();
      expect(roomSpeaker.rank).toBe(1);
    });

    it("should block the anonymised user from authenticating", async () => {
      const res = await request(app)
        .get("/api/users/history")
        .set("Authorization", `Bearer ${targetToken}`);

      expect(res.statusCode).toEqual(401);
    });

    it("should return 409 when anonymising an already anonymised user", async () => {
      const res = await request(app)
        .post("/api/admins/anonymise")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetUserId });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/already anonymised or deleted/i);
    });
  });
});
