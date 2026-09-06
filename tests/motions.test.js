const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Organisation,
  Owner,
  Event,
  Motion,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Motion API Endpoints", () => {
  let ownerToken;
  let randomToken;

  let orgId;
  let eventId;
  let emptyEventId;
  let releasedMotionId;
  let unreleasedMotionId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    // create Event Owner
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

    // create Org, Event and Motions
    const org = await Organisation.create({
      name: "Motion Test Org",
    });
    orgId = org.id;

    await Owner.create({
      user_id: orgOwner.id,
      organisation_id: orgId,
    });

    const event = await Event.create({
      organisation_id: orgId,
      name: "Motion Test Event",
      status: "scheduled",
    });
    eventId = event.id;

    const emptyEvent = await Event.create({
      organisation_id: orgId,
      name: "Empty Event",
      status: "scheduled",
    });
    emptyEventId = emptyEvent.id;

    const releasedMotion = await Motion.create({
      event_id: eventId,
      motion_text: "THW ban something.",
      infoslide: "Climate change is bad.",
      is_released: true,
    });
    releasedMotionId = releasedMotion.id;

    const unreleasedMotion = await Motion.create({
      event_id: eventId,
      motion_text: "THW invade Mars.",
      is_released: false,
    });
    unreleasedMotionId = unreleasedMotion.id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/events/:eventId/motions", () => {
    it("should allow an Owner to create a new motion", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/motions`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          motion_text: "THW ban something else.",
          infoslide: "Infoslide.",
          is_released: false,
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.motion_text).toBe("THW ban something else.");
      expect(res.body.data.infoslide).toBe("Infoslide.");
      expect(res.body.data.is_released).toBe(false);
    });

    it("should return 400 if motion_text is missing", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/motions`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ is_released: true });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Please provide the motion_text/i);
    });

    it("should return 404 if the event is soft-deleted", async () => {
      const deletedEvent = await Event.create({
        organisation_id: orgId,
        name: "Deleted Event",
      });
      await deletedEvent.destroy(); // archive it

      const res = await request(app)
        .post(`/api/events/${deletedEvent.id}/motions`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ motion_text: "THW test this endpoint." });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Event not found/i);
    });

    it("should return 404 for a non-existent event", async () => {
      const res = await request(app)
        .post(`/api/events/99999/motions`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ motion_text: "THW test this endpoint." });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Event not found/i);
    });

    it("should return 403 if a random user tries to create a motion", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/motions`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ motion_text: "Rogue motion" });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });
  });

  // GET ALL part
  describe("GET /api/events/:eventId/motions", () => {
    it("should mask unreleased motions for a regular user", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/motions`)
        .set("Authorization", `Bearer ${randomToken}`); // no restrictions on the route, so should work

      expect(res.statusCode).toEqual(200);

      const released = res.body.data.find((m) => m.id === releasedMotionId);
      const unreleased = res.body.data.find((m) => m.id === unreleasedMotionId);

      // released motion should be fully visible
      expect(released.motion_text).toBe("THW ban something.");

      // unreleased motion should be masked
      expect(unreleased.motion_text).toBe("Motion will be revealed later.");
      expect(unreleased.infoslide).toBeNull();
      expect(unreleased.is_released).toBe(false);
    });

    it("should reveal all motions for an Owner", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/motions`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);

      const unreleased = res.body.data.find((m) => m.id === unreleasedMotionId);

      expect(unreleased.motion_text).toBe("THW invade Mars.");
    });

    it("should return 404 if no motions exist for the event", async () => {
      const res = await request(app)
        .get(`/api/events/${emptyEventId}/motions`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/No motions found/i);
    });

    it("should return 404 for a non-existent event", async () => {
      const res = await request(app)
        .get(`/api/events/99999/motions`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/No motions found/i);
    });
  });

  // GET BY ID part
  describe("GET /api/events/:eventId/motions/:motionId", () => {
    it("should allow a regular user to fetch a released motion", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/motions/${releasedMotionId}`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.motion_text).toBe("THW ban something.");
    });

    it("should return 403 if a regular user tries to fetch an unreleased motion by ID", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/motions/${unreleasedMotionId}`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have permission to view this unreleased motion/i,
      );
    });

    it("should allow an Owner to fetch an unreleased motion by ID", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/motions/${unreleasedMotionId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.motion_text).toBe("THW invade Mars.");
    });

    it("should return 404 if the motion does not exist", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/motions/99999`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Motion not found/i);
    });

    it("should return 404 if the event does not exist", async () => {
      const res = await request(app)
        .get(`/api/events/99999/motions/${releasedMotionId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Motion not found/i);
    });
  });

  // PUT part
  describe("PUT /api/events/:eventId/motions/:motionId", () => {
    it("should allow an Owner to update a motion", async () => {
      const res = await request(app)
        .put(`/api/events/${eventId}/motions/${unreleasedMotionId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ is_released: true });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.is_released).toBe(true);
    });

    it("should return 404 if updating a non-existent motion", async () => {
      const res = await request(app)
        .put(`/api/events/${eventId}/motions/99999`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ motion_text: "No Motion" });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Motion not found/i);
    });

    it("should return 403 if a regular user tries to update a motion", async () => {
      const res = await request(app)
        .put(`/api/events/${eventId}/motions/${releasedMotionId}`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ motion_text: "User motion" });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });
  });

  // DELETE part
  describe("DELETE /api/events/:eventId/motions/:motionId", () => {
    it("should return 403 if a regular user tries to delete a motion", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/motions/${releasedMotionId}`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });

    it("should successfully soft-delete the motion for an Owner", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/motions/${releasedMotionId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Motion archived successfully/i);

      // hidden from default queries, but preserved with an archival timestamp
      expect(await Motion.findByPk(releasedMotionId)).toBeNull();
      const dbCheck = await Motion.findByPk(releasedMotionId, {
        paranoid: false,
      });
      expect(dbCheck.archived_at).not.toBeNull();
    });

    it("should return 409 if attempting to archive an already archived motion", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}/motions/${releasedMotionId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/already archived/i);
    });
  });
});
