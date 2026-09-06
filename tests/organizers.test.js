const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Organisation,
  Owner,
  Event,
  Organizer,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Organiser API Endpoints", () => {
  let ownerToken;
  let existingOrganizerToken;
  let randomToken;

  let targetUserId;
  let orgId;
  let eventId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    // create the Organisation Owner
    const orgOwner = await User.create({
      username: "org_owner",
      password: "hashedpassword123",
    });
    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create an existing Organiser
    const existingOrganizer = await User.create({
      username: "existing_organiser",
      password: "hashedpassword123",
    });
    existingOrganizerToken = jwt.sign(
      { id: existingOrganizer.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create the Target User
    const targetUser = await User.create({
      username: "target_user",
      password: "hashedpassword123",
    });
    targetUserId = targetUser.id;

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

    // create the Organisation, Event and assign the existing Organiser
    const org = await Organisation.create({
      name: "Debate Test Org",
    });
    orgId = org.id;

    await Owner.create({
      user_id: orgOwner.id,
      organisation_id: orgId,
    });

    const event = await Event.create({
      organisation_id: orgId,
      name: "KPI 2026",
      status: "scheduled",
    });
    eventId = event.id;

    await Organizer.create({
      user_id: existingOrganizer.id,
      event_id: eventId,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // GET part
  describe("GET /api/events/:eventId/organizers", () => {
    it("should successfully retrieve a list of organisers for the event", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/organizers`)
        .set("Authorization", `Bearer ${randomToken}`); // no restrictions on the route, so should work

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].User.username).toBe("existing_organiser");
    });
  });

  // POST part
  describe("POST /api/events/:eventId/organizers", () => {
    it("should allow an existing Organiser to add a new Organiser", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/organizers`)
        .set("Authorization", `Bearer ${existingOrganizerToken}`)
        .send({ targetUserId });

      expect(res.statusCode).toEqual(201);
      expect(res.body.message).toMatch(/Organiser role granted successfully/i);

      // verify in the database
      const checkRecord = await Organizer.findOne({
        where: { event_id: eventId, user_id: targetUserId },
      });
      expect(checkRecord).not.toBeNull();
    });

    it("should return 404 if the target user is soft-deleted", async () => {
      // create a deleted User
      const deletedUser = await User.create({
        username: "deleted_org_candidate",
        password: "hashedpassword123",
        is_deleted: true,
      });

      const res = await request(app)
        .post(`/api/events/${eventId}/organizers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ targetUserId: deletedUser.id });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/User not found/i);
    });

    it("should return 404 if attempting to add an organiser to a completed event", async () => {
      // create a completed Event
      const completedEvent = await Event.create({
        organisation_id: orgId,
        name: "Completed Event",
        status: "completed",
      });

      const res = await request(app)
        .post(`/api/events/${completedEvent.id}/organizers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ targetUserId });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Event not found/i);
    });

    it("should return 404 if attempting to add an organiser to a soft-deleted event", async () => {
      // create a deleted Event
      const deletedEvent = await Event.create({
        organisation_id: orgId,
        name: "Deleted Event",
        status: "scheduled",
      });
      await deletedEvent.destroy(); // archive it

      const res = await request(app)
        .post(`/api/events/${deletedEvent.id}/organizers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ targetUserId });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Event not found/i);
    });

    it("should return 409 if the user is already an organiser", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/organizers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ targetUserId });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /This user is already an organiser for this event/i,
      );
    });

    it("should return 400 if the targetUserId is missing", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/organizers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({});

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Please provide a targetUserId/i);
    });

    it("should return 404 if the Event does not exist", async () => {
      const res = await request(app)
        .post("/api/events/99999/organizers")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ targetUserId });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Event not found/i);
    });

    it("should return 404 if the Target User does not exist", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/organizers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ targetUserId: 99999 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/User not found/i);
    });

    it("should return 403 if a random user tries to add an organiser", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/organizers`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ targetUserId: 1 });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });
  });

  // DELETE part
  describe("DELETE /api/events/:eventId/organizers/:targetUserId", () => {
    it("should return 403 if a random user tries to remove an organiser", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/organizers/${targetUserId}`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });

    it("should allow the Organisation Owner to remove an organiser", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/organizers/${targetUserId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Organiser role revoked successfully/i);

      // verify removal
      const checkRecord = await Organizer.findOne({
        where: { event_id: eventId, user_id: targetUserId },
      });
      expect(checkRecord).toBeNull();
    });

    it("should return 404 if attempting to remove a user who is not an organiser", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/organizers/${targetUserId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(
        /This user is not an organiser for this event/i,
      );
    });
  });
});
