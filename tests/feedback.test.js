const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Admin,
  Organisation,
  Owner,
  Event,
  EventParticipant,
  Round,
  Format,
  Team,
  TeamMember,
  Room,
  RoomTeam,
  RoomSpeaker,
  RoomAdjudicator,
  Feedback,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Feedback API Endpoints", () => {
  let adminToken;
  let ownerToken;
  let randomToken;

  let ownerId;

  let targetEventId;
  let targetRoomId;
  let pendingRoomId;

  let adjudicatorId;
  let speakerId;
  let externalSpeakerId;
  let teamId;

  let victimSpeakerId;
  let victimTeamId;

  let individualFeedbackId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    const adminUser = await User.create({
      username: "admin_user",
      password: "hashedpassword123",
    });
    await Admin.create({ user_id: adminUser.id });
    adminToken = jwt.sign(
      { id: adminUser.id, isAdmin: true },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const orgOwner = await User.create({
      username: "org_owner",
      password: "hashed123",
    });
    ownerId = orgOwner.id;
    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
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

    // Victim User for the Impersonation tests
    const victimUser = await User.create({
      username: "victim_user",
      password: "hashedpassword123",
    });

    const targetOrg = await Organisation.create({
      name: "Feedback Org",
      type: "academic",
      status: "active",
    });
    await Owner.create({ user_id: ownerId, organisation_id: targetOrg.id });

    const targetEvent = await Event.create({
      organisation_id: targetOrg.id,
      name: "Feedback Tournament",
      status: "in_progress",
    });
    targetEventId = targetEvent.id;

    const round = await Round.create({
      event_id: targetEventId,
      name: "Round 1",
      sequence: 1,
      status: "completed",
    });

    const format = await Format.create({
      name: "Standard",
      code: "STD",
      teams_per_room: 2,
      speakers_per_team: 2,
      score_min: 50,
      score_max: 100,
    });

    const adjudicatorRecord = await EventParticipant.create({
      event_id: targetEventId,
      display_name: "Judge",
      role: "adjudicator",
    });
    adjudicatorId = adjudicatorRecord.id;

    // "Guest" (user_id is null)
    const speakerRecord = await EventParticipant.create({
      event_id: targetEventId,
      display_name: "Lead Speaker",
      role: "speaker",
    });
    speakerId = speakerRecord.id;

    // fully registered to the Victim User
    const victimSpeakerRecord = await EventParticipant.create({
      event_id: targetEventId,
      display_name: "Victim Speaker",
      role: "speaker",
      user_id: victimUser.id,
    });
    victimSpeakerId = victimSpeakerRecord.id;

    const externalRecord = await EventParticipant.create({
      event_id: targetEventId,
      display_name: "External Speaker",
      role: "speaker",
    });
    externalSpeakerId = externalRecord.id;

    // Guest Team
    const team = await Team.create({
      event_id: targetEventId,
      name: "Feedback Team A",
    });
    teamId = team.id;
    await TeamMember.create({
      team_id: team.id,
      participant_id: speakerId,
    });

    // Victim Team
    const teamB = await Team.create({
      event_id: targetEventId,
      name: "Feedback Team B",
    });
    victimTeamId = teamB.id;
    await TeamMember.create({
      team_id: teamB.id,
      participant_id: victimSpeakerId,
    });

    const room = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "completed",
    });
    targetRoomId = room.id;

    const pendingRoom = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "pending",
    });
    pendingRoomId = pendingRoom.id;

    const roomTeamA = await RoomTeam.create({
      room_id: room.id,
      team_id: team.id,
      position: 1,
    });
    await RoomSpeaker.create({
      room_team_id: roomTeamA.id,
      participant_id: speakerId,
    });

    const roomTeamB = await RoomTeam.create({
      room_id: room.id,
      team_id: teamB.id,
      position: 2,
    });
    await RoomSpeaker.create({
      room_team_id: roomTeamB.id,
      participant_id: victimSpeakerId,
    });

    await RoomAdjudicator.create({
      room_id: room.id,
      participant_id: adjudicatorId,
      role: "chair",
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/rooms/:roomId/feedback", () => {
    it("should allow an individual speaker to submit feedback for their adjudicator", async () => {
      const res = await request(app)
        .post(`/api/rooms/${targetRoomId}/feedback`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({
          adjudicator_id: adjudicatorId,
          issuer_participant_id: speakerId,
          score: 10,
          comment: "Excellent feedback.",
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.score).toBe(10);
      expect(res.body.data.issuer_participant_id).toBe(speakerId);
      expect(res.body.data.issuer_team_id).toBeNull();

      individualFeedbackId = res.body.data.id;
    });

    it("should allow a team to submit a collective feedback score", async () => {
      const res = await request(app)
        .post(`/api/rooms/${targetRoomId}/feedback`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({
          adjudicator_id: adjudicatorId,
          issuer_team_id: teamId,
          score: 9,
          comment: "Fair feedback.",
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.issuer_team_id).toBe(teamId);
      expect(res.body.data.issuer_participant_id).toBeNull();
    });

    it("should return 403 if random user tries to impersonate a fully registered individual speaker", async () => {
      const res = await request(app)
        .post(`/api/rooms/${targetRoomId}/feedback`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({
          adjudicator_id: adjudicatorId,
          issuer_participant_id: victimSpeakerId,
          score: 1,
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You can only submit feedback for yourself/i,
      );
    });

    it("should return 403 if random user tries to impersonate a fully registered team", async () => {
      const res = await request(app)
        .post(`/api/rooms/${targetRoomId}/feedback`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({
          adjudicator_id: adjudicatorId,
          issuer_team_id: victimTeamId,
          score: 1,
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You can only submit collective feedback for a team you belong to/i,
      );
    });

    it("should return 400 if both issuer_participant_id and issuer_team_id are provided", async () => {
      const res = await request(app)
        .post(`/api/rooms/${targetRoomId}/feedback`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({
          adjudicator_id: adjudicatorId,
          issuer_participant_id: speakerId,
          issuer_team_id: teamId,
          score: 5,
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/exactly one entity/i);
    });

    it("should return 400 if neither issuer_participant_id nor issuer_team_id are provided", async () => {
      const res = await request(app)
        .post(`/api/rooms/${targetRoomId}/feedback`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ adjudicator_id: adjudicatorId, score: 5 });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/exactly one entity/i);
    });

    it("should return 400 if the adjudicator was not in the specified room", async () => {
      const res = await request(app)
        .post(`/api/rooms/${targetRoomId}/feedback`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({
          adjudicator_id: externalSpeakerId,
          issuer_team_id: teamId,
          score: 5,
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/did not judge in this room/i);
    });

    it("should return 400 if the issuing speaker was not in the specified room", async () => {
      const res = await request(app)
        .post(`/api/rooms/${targetRoomId}/feedback`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({
          adjudicator_id: adjudicatorId,
          issuer_participant_id: externalSpeakerId,
          score: 5,
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/did not debate in this room/i);
    });

    it("should return 409 if duplicate feedback is submitted by the same individual", async () => {
      const res = await request(app)
        .post(`/api/rooms/${targetRoomId}/feedback`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({
          adjudicator_id: adjudicatorId,
          issuer_participant_id: speakerId,
          score: 5,
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/already been submitted/i);
    });

    it("should return 409 if attempting to submit feedback for a room that is not completed", async () => {
      const res = await request(app)
        .post(`/api/rooms/${pendingRoomId}/feedback`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({
          adjudicator_id: adjudicatorId,
          issuer_participant_id: speakerId,
          score: 8,
          comment: "Great judge.",
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/not yet completed/i);
    });
  });

  // GET Part
  describe("GET /api/events/:eventId/feedback", () => {
    it("should return 403 if a standard user tries to view all event feedback", async () => {
      const res = await request(app)
        .get(`/api/events/${targetEventId}/feedback`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });

    it("should allow an Event Owner to view all feedback for the event", async () => {
      const res = await request(app)
        .get(`/api/events/${targetEventId}/feedback`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toBe("success");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      expect(res.body.data[0].Room).toBeDefined();
      expect(res.body.data[0].Adjudicator).toBeDefined();
    });
  });

  // DELETE Part
  describe("DELETE /api/feedback/:feedbackId", () => {
    it("should return 403 if an Owner attempts to delete feedback", async () => {
      const res = await request(app)
        .delete(`/api/feedback/${individualFeedbackId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(/Admin required/i);
    });

    it("should allow an Admin to delete feedback", async () => {
      const res = await request(app)
        .delete(`/api/feedback/${individualFeedbackId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/archived successfully/i);

      const dbCheck = await Feedback.findByPk(individualFeedbackId);
      expect(dbCheck).toBeNull();
    });

    it("should return 404 for a non-existent feedback record", async () => {
      const res = await request(app)
        .delete("/api/feedback/999999")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Feedback record not found/i);
    });
  });
});
