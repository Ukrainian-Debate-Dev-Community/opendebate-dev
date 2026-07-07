const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Organisation,
  Owner,
  Event,
  Round,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Event API Endpoints", () => {
  let ownerToken;
  let unauthorizedOwnerToken;
  let randomToken;

  let ownerId;
  let unauthorizedOwnerId;

  let targetOrgId;
  let otherOrgId;

  let standardEventId;
  let softDeleteEventId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    // create the primary Org Owner User
    const orgOwner = await User.create({
      username: "event_owner",
      password: "hashedpassword123",
    });
    ownerId = orgOwner.id;

    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create a secondary Owner to test cross-organisation
    const otherOwner = await User.create({
      username: "other_owner",
      password: "hashedpassword123",
    });
    unauthorizedOwnerId = otherOwner.id;

    unauthorizedOwnerToken = jwt.sign(
      { id: otherOwner.id, isAdmin: false },
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

    // pre-create an Organisation for the primary owner
    const targetOrg = await Organisation.create({
      name: "Primary Debate Org",
      type: "academic",
      status: "active",
    });
    targetOrgId = targetOrg.id;

    await Owner.create({
      user_id: ownerId,
      organisation_id: targetOrgId,
    });

    // pre-create an Organisation for the secondary owner
    const otherOrg = await Organisation.create({
      name: "Secondary Debate Org",
      type: "personal",
      status: "active",
    });
    otherOrgId = otherOrg.id;

    await Owner.create({
      user_id: unauthorizedOwnerId,
      organisation_id: otherOrgId,
    });

    // create an Event with a child Round
    const softDeleteEvent = await Event.create({
      organisation_id: targetOrgId,
      name: "KPI 2025",
      status: "completed",
      is_deleted: false,
    });
    softDeleteEventId = softDeleteEvent.id;

    await Round.create({
      event_id: softDeleteEventId,
      name: "Round 1",
      sequence: 1,
      status: "completed",
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/events/:organisationId", () => {
    it("should allow an Owner to create a new event for their organisation", async () => {
      const res = await request(app)
        .post(`/api/events/${targetOrgId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "KPI 2026",
          start_date: "2026-06-01",
          end_date: "2026-06-03",
          is_ranked: true,
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.name).toBe("KPI 2026");
      expect(res.body.data.status).toBe("scheduled");

      standardEventId = res.body.data.id; // save for subsequent tests
    });

    it("should return 400 if the event name is missing", async () => {
      const res = await request(app)
        .post(`/api/events/${targetOrgId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ start_date: "2026-06-01" });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Please provide a name/i);
    });

    it("should return 403 if an Owner tries to create an event in an organisation they do not own", async () => {
      const res = await request(app)
        .post(`/api/events/${otherOrgId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Invalid Event" });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /Only an Owner of this organisation can perform this action/i,
      );
    });

    it("should return 403 if a random user tries to create an event", async () => {
      const res = await request(app)
        .post(`/api/events/${targetOrgId}`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ name: "Invalid Event" });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /Only an Owner of this organisation can perform this action/i,
      );
    });
  });

  // GET part
  describe("GET /api/events/organisation/:organisationId", () => {
    it("should retrieve all active events for a specific organisation", async () => {
      const res = await request(app)
        .get(`/api/events/organisation/${targetOrgId}`)
        .set("Authorization", `Bearer ${randomToken}`); // no restrictions on the route, so should work

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);

      // only fetch events belonging to targetOrgId
      const allBelongToTargetOrg = res.body.data.every(
        (e) => e.organisation_id === targetOrgId,
      );
      expect(allBelongToTargetOrg).toBe(true);
    });
  });

  // PUT part
  describe("PUT /api/events/:eventId", () => {
    it("should allow the Organisation Owner to update their event", async () => {
      const res = await request(app)
        .put(`/api/events/${standardEventId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ status: "in_progress", is_ranked: false });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.status).toBe("in_progress");
      expect(res.body.data.is_ranked).toBe(false);
    });

    it("should return 400 if the updated status is invalid", async () => {
      const res = await request(app)
        .put(`/api/events/${standardEventId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ status: "archived" });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Invalid status state/i);
    });

    it("should return 403 if an Owner from another organisation tries to update the event", async () => {
      const res = await request(app)
        .put(`/api/events/${standardEventId}`)
        .set("Authorization", `Bearer ${unauthorizedOwnerToken}`)
        .send({ name: "Hijacked Event" });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });

    it("should return 404 if attempting to update a non-existent event", async () => {
      const res = await request(app)
        .put("/api/events/999999")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "No Event" });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Event not found/i);
    });
  });

  // DELETE part
  describe("DELETE /api/events/:eventId", () => {
    it("should return 403 if a random user tries to delete the event", async () => {
      const res = await request(app)
        .delete(`/api/events/${standardEventId}`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });

    it("should soft-delete an Event if it has historical Round dependencies", async () => {
      const res = await request(app)
        .delete(`/api/events/${softDeleteEventId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(
        /Event deactivated due to historical records/i,
      );

      // verify the soft-delete state
      const dbCheck = await Event.findByPk(softDeleteEventId);
      expect(dbCheck.is_deleted).toBe(true);
    });

    it("should return 404 if attempting to update an event that is already soft-deleted", async () => {
      const res = await request(app)
        .put(`/api/events/${softDeleteEventId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Zombie Event" });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Event not found/i);
    });

    it("should hard-delete an Event with no associated relational records", async () => {
      const res = await request(app)
        .delete(`/api/events/${standardEventId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(204);

      // verify removal from the DB
      const dbCheck = await Event.findByPk(standardEventId);
      expect(dbCheck).toBeNull();
    });
  });
});
