const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Organisation,
  Owner,
  Event,
  EventParticipant,
  Team,
  Conflict,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Conflict API Endpoints", () => {
  let ownerToken;
  let randomToken;

  let eventId;
  let issuerParticipantId;
  let targetParticipantId;
  let targetTeamId;
  let externalParticipantId;
  let externalTeamId;

  let createdConflictId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    const orgOwner = await User.create({
      username: "org_owner",
      password: "hashedpassword123",
    });
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

    const org = await Organisation.create({ name: "Conflict Test Org" });
    await Owner.create({ user_id: orgOwner.id, organisation_id: org.id });

    const event = await Event.create({
      organisation_id: org.id,
      name: "Conflict Test Event",
      status: "scheduled",
    });
    eventId = event.id;

    const externalEvent = await Event.create({
      organisation_id: org.id,
      name: "Other Event",
      status: "scheduled",
    });

    const issuer = await EventParticipant.create({
      event_id: eventId,
      display_name: "Judge",
      role: "adjudicator",
    });
    issuerParticipantId = issuer.id;

    const targetPart = await EventParticipant.create({
      event_id: eventId,
      display_name: "Speaker",
      role: "speaker",
    });
    targetParticipantId = targetPart.id;

    const externalPart = await EventParticipant.create({
      event_id: externalEvent.id,
      display_name: "External Speaker",
      role: "speaker",
    });
    externalParticipantId = externalPart.id;

    const targetTeam = await Team.create({
      event_id: eventId,
      name: "Team",
    });
    targetTeamId = targetTeam.id;

    const externalTeam = await Team.create({
      event_id: externalEvent.id,
      name: "External Team",
    });
    externalTeamId = externalTeam.id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/events/:eventId/conflicts", () => {
    it("should return 403 if a random user tries to create a conflict", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({
          issuer_participant_id: issuerParticipantId,
          target_participant_id: targetParticipantId,
        });

      expect(res.statusCode).toEqual(403);
    });

    it("should return 400 if issuer_participant_id is missing", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ target_participant_id: targetParticipantId });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/An issuer_participant_id is required/i);
    });

    it("should return 400 if neither target is provided", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ issuer_participant_id: issuerParticipantId });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/exactly one target/i);
    });

    it("should return 400 if both targets are provided", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          issuer_participant_id: issuerParticipantId,
          target_participant_id: targetParticipantId,
          target_team_id: targetTeamId,
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/exactly one target/i);
    });

    it("should return 400 if issuer and target participant are the same", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          issuer_participant_id: issuerParticipantId,
          target_participant_id: issuerParticipantId,
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /cannot declare a conflict with themselves/i,
      );
    });

    it("should return 404 if issuer does not exist in the event", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          issuer_participant_id: externalParticipantId,
          target_team_id: targetTeamId,
        });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(
        /Issuer participant not found in this event/i,
      );
    });

    it("should return 404 if target participant does not exist in the event", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          issuer_participant_id: issuerParticipantId,
          target_participant_id: externalParticipantId,
        });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(
        /Target participant not found in this event/i,
      );
    });

    it("should return 404 if target team does not exist in the event", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          issuer_participant_id: issuerParticipantId,
          target_team_id: externalTeamId,
        });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Target team not found in this event/i);
    });

    it("should successfully create a participant-to-participant conflict", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          issuer_participant_id: issuerParticipantId,
          target_participant_id: targetParticipantId,
          comment: "Personal conflict",
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.issuer_participant_id).toBe(issuerParticipantId);
      expect(res.body.data.target_participant_id).toBe(targetParticipantId);
      expect(res.body.data.target_team_id).toBeNull();

      createdConflictId = res.body.data.id;
    });

    it("should return 409 if creating a duplicate conflict", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          issuer_participant_id: issuerParticipantId,
          target_participant_id: targetParticipantId,
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/already been logged/i);
    });

    it("should successfully create a participant-to-team conflict", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          issuer_participant_id: issuerParticipantId,
          target_team_id: targetTeamId,
          comment: "Institutional conflict",
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.target_team_id).toBe(targetTeamId);
      expect(res.body.data.target_participant_id).toBeNull();
    });
  });

  // GET part
  describe("GET /api/events/:eventId/conflicts", () => {
    it("should return 403 if a random user tries to view conflicts", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
    });

    it("should successfully return all conflicts for the event", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/conflicts`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);

      expect(res.body.data[0].Issuer).toBeDefined();
    });
  });

  // DELETE part
  describe("DELETE /api/events/:eventId/conflicts/:conflictId", () => {
    it("should return 403 if a random user tries to delete a conflict", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/conflicts/${createdConflictId}`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
    });

    it("should return 404 for a non-existent conflict", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/conflicts/99999`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Conflict record not found/i);
    });

    it("should successfully delete a conflict", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/conflicts/${createdConflictId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/archived successfully/i);

      const dbCheck = await Conflict.findByPk(createdConflictId);
      expect(dbCheck).toBeNull();
    });
  });
});
