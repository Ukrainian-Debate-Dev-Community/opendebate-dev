const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Organisation,
  Owner,
  Event,
  EventParticipant,
  Round,
  Team,
  TeamMember,
  Room,
  RoomAdjudicator,
  Format,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Event Participant API Endpoints", () => {
  let ownerToken;
  let randomToken;

  let ownerId;
  let joiningUserId;

  let targetOrgId;
  let targetEventId;

  let guestParticipantId;
  let linkedParticipantId;
  let lockedSpeakerId;
  let lockedAdjudicatorId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    // create the Organisation Owner
    const orgOwner = await User.create({
      username: "org_owner",
      password: "hashedpassword123",
    });
    ownerId = orgOwner.id;

    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create a Random User
    const randomUser = await User.create({
      username: "random_user",
      password: "hashedpassword123",
    });

    randomToken = jwt.sign(
      { id: randomUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create a User meant to be linked
    const joiningUser = await User.create({
      username: "joining_user",
      password: "hashedpassword123",
    });
    joiningUserId = joiningUser.id;

    // create Organisation and assign Owner
    const targetOrg = await Organisation.create({
      name: "Participant Org",
      type: "academic",
      status: "active",
    });
    targetOrgId = targetOrg.id;

    await Owner.create({
      user_id: ownerId,
      organisation_id: targetOrgId,
    });

    // create Event
    const targetEvent = await Event.create({
      organisation_id: targetOrgId,
      name: "KPI 2026",
      status: "scheduled",
    });
    targetEventId = targetEvent.id;

    // create participants for the DELETE constraint tests
    const speakerRecord = await EventParticipant.create({
      event_id: targetEventId,
      display_name: "Locked Speaker",
      role: "speaker",
    });
    lockedSpeakerId = speakerRecord.id;

    const adjudicatorRecord = await EventParticipant.create({
      event_id: targetEventId,
      display_name: "Locked Adjudicator",
      role: "adjudicator",
    });
    lockedAdjudicatorId = adjudicatorRecord.id;

    const round = await Round.create({
      event_id: targetEventId,
      name: "Round 1",
      sequence: 1,
      status: "draft",
    });

    const team = await Team.create({
      event_id: targetEventId,
      name: "Team A",
    });

    await TeamMember.create({
      team_id: team.id,
      participant_id: lockedSpeakerId,
    });

    const format = await Format.create({
      name: "Standard",
      code: "STD",
      teams_per_room: 2,
      speakers_per_team: 2,
      score_min: 50,
      score_max: 100,
    });

    const room = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "pending",
    });

    await RoomAdjudicator.create({
      room_id: room.id,
      participant_id: lockedAdjudicatorId,
      role: "chair",
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/events/:eventId/participants", () => {
    it("should allow an Owner to add a guest participant and receive a claim token", async () => {
      const res = await request(app)
        .post(`/api/events/${targetEventId}/participants`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          display_name: "Guest Speaker",
          role: "speaker",
          is_waitlist: false,
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.display_name).toBe("Guest Speaker");
      expect(res.body.data.user_id).toBeNull();
      expect(res.body.data.raw_claim_token).toBeDefined();

      guestParticipantId = res.body.data.id; // save for subsequent tests
    });

    it("should allow an Owner to add a linked platform user", async () => {
      const res = await request(app)
        .post(`/api/events/${targetEventId}/participants`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          user_id: joiningUserId,
          display_name: "Linked Adjudicator",
          role: "adjudicator",
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.user_id).toBe(joiningUserId);
      expect(res.body.data.raw_claim_token).toBeUndefined(); // linked users don't get tokens

      linkedParticipantId = res.body.data.id;
    });

    it("should return 400 if display name or role is missing", async () => {
      const res = await request(app)
        .post(`/api/events/${targetEventId}/participants`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ role: "speaker" });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Display name and role are required/i);
    });

    it("should return 404 if assigning a user_id that does not exist", async () => {
      const res = await request(app)
        .post(`/api/events/${targetEventId}/participants`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ user_id: 999999, display_name: "Ghost User", role: "speaker" });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/User not found/i);
    });

    it("should return 409 if the user is already a participant in this event", async () => {
      const res = await request(app)
        .post(`/api/events/${targetEventId}/participants`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          user_id: joiningUserId,
          display_name: "Duplicate Try",
          role: "speaker",
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /User is already a participant in this event/i,
      );
    });

    it("should return 403 if a random user tries to add a participant", async () => {
      const res = await request(app)
        .post(`/api/events/${targetEventId}/participants`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ display_name: "Hacker", role: "speaker" });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });
  });

  // GET part
  describe("GET /api/events/:eventId/participants", () => {
    it("should retrieve paginated participants without leaking claim token hashes", async () => {
      const res = await request(app)
        .get(`/api/events/${targetEventId}/participants?page=1&limit=10`)
        .set("Authorization", `Bearer ${randomToken}`); // no restrictions on the route, so should work

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toBe("success");

      // checking the pagination object structure
      expect(res.body.data.total_participants).toBeGreaterThanOrEqual(4);
      expect(res.body.data.current_page).toBe(1);
      expect(Array.isArray(res.body.data.participants)).toBe(true);

      // verify claim_token_hash is excluded
      const guest = res.body.data.participants.find(
        (p) => p.id === guestParticipantId,
      );
      expect(guest.claim_token_hash).toBeUndefined();
    });
  });

  // PUT part
  describe("PUT /api/events/:eventId/participants/:participantId", () => {
    it("should allow an Owner to update participant details", async () => {
      const res = await request(app)
        .put(`/api/events/${targetEventId}/participants/${guestParticipantId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ role: "adjudicator" });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.role).toBe("adjudicator");
    });

    it("should return 404 for updating a non-existent participant", async () => {
      const res = await request(app)
        .put(`/api/events/${targetEventId}/participants/999999`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ display_name: "Ghost" });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Participant not found/i);
    });

    it("should return 403 if a random user attempts to update", async () => {
      const res = await request(app)
        .put(`/api/events/${targetEventId}/participants/${guestParticipantId}`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ is_waitlist: true });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });
  });

  // PATCH part
  describe("PATCH /api/events/:eventId/eliminations", () => {
    it("should return 400 if status boolean is missing", async () => {
      const res = await request(app)
        .patch(`/api/events/${targetEventId}/eliminations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ participant_ids: [lockedSpeakerId] });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/boolean 'status' field is required/i);
    });

    it("should return 400 if no teams or participants are provided", async () => {
      const res = await request(app)
        .patch(`/api/events/${targetEventId}/eliminations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ status: true, team_ids: [], participant_ids: [] });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /provide at least one team_id or participant_id/i,
      );
    });

    it("should return 403 if a random user attempts bulk elimination", async () => {
      const res = await request(app)
        .patch(`/api/events/${targetEventId}/eliminations`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ status: true, participant_ids: [lockedSpeakerId] });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });

    it("should return 400 if attempting to eliminate an adjudicator", async () => {
      const res = await request(app)
        .patch(`/api/events/${targetEventId}/eliminations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          status: true,
          participant_ids: [lockedAdjudicatorId],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Adjudicators cannot be eliminated/i);
    });

    it("should successfully update the elimination status of provided entities", async () => {
      const res = await request(app)
        .patch(`/api/events/${targetEventId}/eliminations`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          status: true,
          participant_ids: [lockedSpeakerId],
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/successfully set to true/i);

      const dbCheck = await EventParticipant.findByPk(lockedSpeakerId);
      expect(dbCheck.is_eliminated).toBe(true);
    });
  });

  // DELETE part
  describe("DELETE /api/events/:eventId/participants/:participantId", () => {
    it("should return 409 if attempting to remove a participant assigned to a Team", async () => {
      const res = await request(app)
        .delete(`/api/events/${targetEventId}/participants/${lockedSpeakerId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /Cannot remove participant: still a member of a team/i,
      );
    });

    it("should return 409 if attempting to remove a participant assigned as a Room Adjudicator", async () => {
      const res = await request(app)
        .delete(
          `/api/events/${targetEventId}/participants/${lockedAdjudicatorId}`,
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /Cannot remove participant: still assigned as a room adjudicator/i,
      );
    });

    it("should return 403 if a random user attempts deletion", async () => {
      const res = await request(app)
        .delete(
          `/api/events/${targetEventId}/participants/${linkedParticipantId}`,
        )
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });

    it("should successfully remove an isolated participant and return 200", async () => {
      const res = await request(app)
        .delete(
          `/api/events/${targetEventId}/participants/${linkedParticipantId}`,
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toMatch(/Participant removed/i);

      // verify deletion in database
      const dbCheck = await EventParticipant.findByPk(linkedParticipantId);
      expect(dbCheck).toBeNull();
    });
  });
});
