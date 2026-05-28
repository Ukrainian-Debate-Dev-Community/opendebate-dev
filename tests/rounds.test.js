const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Organisation,
  Event,
  Owner,
  Round,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Round API Endpoints", () => {
  let token;
  let activeEventId;
  let completedEventId;
  let createdRoundId;

  // setup
  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    const user = await User.create({
      username: "test_organiser",
      password: "hashedpassword123",
    });

    // create an Organisation and assign Owner
    const org = await Organisation.create({ name: "Debate Test Org" });
    await Owner.create({ user_id: user.id, organisation_id: org.id });

    // create an Active Event
    const activeEvent = await Event.create({
      organisation_id: org.id,
      name: "KPI 2026",
      status: "scheduled",
    });
    activeEventId = activeEvent.id;

    // create a Completed Event
    const completedEvent = await Event.create({
      organisation_id: org.id,
      name: "KPI 2025",
      status: "completed",
    });
    completedEventId = completedEvent.id;

    // generate valid JWT
    token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || "testsecret", {
      expiresIn: "1h",
    });
  });

  // clean up database connection after tests
  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/events/:eventId/rounds", () => {
    it("should successfully create a round for an active event", async () => {
      const res = await request(app)
        .post(`/api/events/${activeEventId}/rounds`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Round 1",
          sequence: 1,
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.name).toBe("Round 1");
      expect(res.body.data.status).toBe("draft"); // Controller should force draft

      createdRoundId = res.body.data.id; // save for future tests
    });

    it("should return 400 if required fields are missing", async () => {
      const res = await request(app)
        .post(`/api/events/${activeEventId}/rounds`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Round 2" }); // no sequence

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/provide a name and a sequence/i);
    });

    it("should return 409 if the sequence already exists for this event", async () => {
      const res = await request(app)
        .post(`/api/events/${activeEventId}/rounds`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Duplicate Round 1",
          sequence: 1,
        });

      expect(res.statusCode).toEqual(409);
    });

    it("should return 403 if trying to add a round to a completed event", async () => {
      const res = await request(app)
        .post(`/api/events/${completedEventId}/rounds`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Post-Tournament Round",
          sequence: 1,
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /Cannot add rounds to an event that is completed/i,
      );
    });

    it("should return 404 if the parent event does not exist", async () => {
      const res = await request(app)
        .post("/api/events/999999/rounds")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Ghost Round", sequence: 1 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Event not found/i);
    });
  });

  // GET part
  describe("GET /api/events/:eventId/rounds", () => {
    it("should retrieve all rounds for a specific event in chronological order", async () => {
      // create 2 extra rounds to check sequence output
      await Round.create({
        event_id: activeEventId,
        name: "Round 3",
        sequence: 3,
      });
      await Round.create({
        event_id: activeEventId,
        name: "Round 2",
        sequence: 2,
      });

      const res = await request(app)
        .get(`/api/events/${activeEventId}/rounds`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(3);
      expect(res.body.data[0].sequence).toBe(1);
      expect(res.body.data[1].sequence).toBe(2);
      expect(res.body.data[2].sequence).toBe(3);
    });
  });

  // GET by id part
  describe("GET /api/rounds/:roundId", () => {
    it("should retrieve a specific round by its ID", async () => {
      const res = await request(app)
        .get(`/api/rounds/${createdRoundId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.id).toBe(createdRoundId);
    });

    it("should return 404 for a non-existent round", async () => {
      const res = await request(app)
        .get("/api/rounds/999999")
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toEqual(404);
    });
  });

  // PUT part
  describe("PUT /api/rounds/:roundId", () => {
    it("should prevent sequence updates that cause a collision", async () => {
      const res = await request(app)
        .put(`/api/rounds/${createdRoundId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ sequence: 2 }); // sequence 2 was created in the GET part

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it("should update round details successfully", async () => {
      const res = await request(app)
        .put(`/api/rounds/${createdRoundId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "in_progress" });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.status).toBe("in_progress");
    });

    it("should prevent changing the sequence of a round actively in progress", async () => {
      // force round to in_progress state
      const round = await Round.findByPk(createdRoundId);
      round.status = "in_progress";
      await round.save();

      const res = await request(app)
        .put(`/api/rounds/${createdRoundId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ sequence: 5 });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /Cannot change the chronological sequence/i,
      );
    });

    it("should prevent modifications if the round is completed", async () => {
      // force round to complete state
      const round = await Round.findByPk(createdRoundId);
      round.status = "completed";
      await round.save();

      const res = await request(app)
        .put(`/api/rounds/${createdRoundId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "New Name" });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(/already been completed/i);
    });

    it("should return 404 if trying to update a non-existent round", async () => {
      const res = await request(app)
        .put("/api/rounds/999999")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Nowhere" });

      expect(res.statusCode).toEqual(404);
    });
  });

  // DELETE part
  describe("DELETE /api/rounds/:roundId", () => {
    it("should prevent deletion of an active or completed round", async () => {
      const res = await request(app)
        .delete(`/api/rounds/${createdRoundId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(/Cannot delete a round/i);
    });

    it("should successfully delete a draft round", async () => {
      // revert status to draft to allow deletion
      const round = await Round.findByPk(createdRoundId);
      round.status = "draft";
      await round.save();

      const res = await request(app)
        .delete(`/api/rounds/${createdRoundId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/deleted successfully/i);

      // verify it is completely gone
      const check = await Round.findByPk(createdRoundId);
      expect(check).toBeNull();
    });

    it("should return 404 if trying to delete a non-existent round", async () => {
      const res = await request(app)
        .delete("/api/rounds/999999")
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toEqual(404);
    });
  });
});
