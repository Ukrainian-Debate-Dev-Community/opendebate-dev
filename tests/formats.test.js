const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Admin,
  Format,
  Organisation,
  Event,
  Round,
  Room,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Format API Endpoints", () => {
  let adminToken;
  let randomToken;

  let standardFormatId;
  let inUseFormatId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    // create an Admin User
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

    // create a Format that will be binded to a Room
    const inUseFormat = await Format.create({
      name: "British Parliamentary",
      code: "BP",
      teams_per_room: 4,
      speakers_per_team: 2,
      has_reply: false,
      score_min: 50,
      score_max: 100,
    });
    inUseFormatId = inUseFormat.id;

    // create the Org-Event-Round relations to attach the Format to a Room
    const org = await Organisation.create({
      name: "Format Test Org",
      type: "academic",
    });

    const event = await Event.create({
      organisation_id: org.id,
      name: "Format Test Event",
    });

    const round = await Round.create({
      event_id: event.id,
      name: "Round 1",
      sequence: 1,
    });

    await Room.create({
      round_id: round.id,
      format_id: inUseFormatId,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/formats", () => {
    it("should allow an Admin to create a new format", async () => {
      const res = await request(app)
        .post("/api/formats")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "American Parliamentary",
          code: "AP",
          teams_per_room: 2,
          speakers_per_team: 3,
          has_reply: false,
          score_min: 50,
          score_max: 100,
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.code).toBe("AP");

      standardFormatId = res.body.data.id; // save for subsequent tests
    });

    it("should return 400 if required parameters are missing", async () => {
      const res = await request(app)
        .post("/api/formats")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Incomplete Format", code: "INC" }); // I won't test each field

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Please provide all required format parameters/i,
      );
    });

    it("should return 400 if score_min is greater than or equal to score_max", async () => {
      const res = await request(app)
        .post("/api/formats")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Broken Format",
          code: "BF1",
          teams_per_room: 2,
          speakers_per_team: 3,
          score_min: 100,
          score_max: 50,
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Minimum score must be less than maximum score/i,
      );
    });

    it("should return 400 if teams or speakers are not positive integers", async () => {
      const res = await request(app)
        .post("/api/formats")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Broken Format 2",
          code: "BF2",
          teams_per_room: 0,
          speakers_per_team: 2,
          score_min: 50,
          score_max: 100,
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /teams_per_room and speakers_per_team must be positive integers/i,
      );
    });

    it("should return 409 if the format code already exists", async () => {
      const res = await request(app)
        .post("/api/formats")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Duplicate AP",
          code: "AP",
          teams_per_room: 2,
          speakers_per_team: 3,
          score_min: 50,
          score_max: 100,
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it("should return 403 if a regular user tries to create a format", async () => {
      const res = await request(app)
        .post("/api/formats")
        .set("Authorization", `Bearer ${randomToken}`)
        .send({
          name: "User Format",
          code: "UF",
          teams_per_room: 2,
          speakers_per_team: 3,
          score_min: 50,
          score_max: 100,
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have permission to perform this action. Admin required/i,
      );
    });
  });

  // GET ALL part
  describe("GET /api/formats", () => {
    it("should retrieve all formats for any authenticated user", async () => {
      const res = await request(app)
        .get("/api/formats")
        .set("Authorization", `Bearer ${randomToken}`); // no restrictions on the route, so should work

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // GET BY ID part
  describe("GET /api/formats/:formatId", () => {
    it("should retrieve a specific format by ID", async () => {
      const res = await request(app)
        .get(`/api/formats/${standardFormatId}`)
        .set("Authorization", `Bearer ${randomToken}`); // no restrictions as well

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.code).toBe("AP");
    });

    it("should return 404 for a non-existent format", async () => {
      const res = await request(app)
        .get("/api/formats/99999")
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Format not found/i);
    });
  });

  // PUT part
  describe("PUT /api/formats/:formatId", () => {
    it("should allow an Admin to update an existing format", async () => {
      const res = await request(app)
        .put(`/api/formats/${standardFormatId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "American Parliamentary Updated", score_max: 90 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.name).toBe("American Parliamentary Updated");
      expect(res.body.data.score_max).toBe(90);
    });

    it("should return 400 if updating creates invalid score bounds", async () => {
      const res = await request(app)
        .put(`/api/formats/${standardFormatId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ score_min: 95 }); // 95 > 90 (current max)

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Minimum score must be less than maximum/i,
      );
    });

    it("should return 409 if updating to a code that belongs to another format", async () => {
      const res = await request(app)
        .put(`/api/formats/${standardFormatId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ code: "BP" });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it("should return 404 if updating a non-existent format", async () => {
      const res = await request(app)
        .put("/api/formats/99999")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ code: "NEW" });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Format not found/i);
    });

    it("should return 400 if teams are not positive integers", async () => {
      const res = await request(app)
        .put(`/api/formats/${standardFormatId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ teams_per_room: 0 });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /teams_per_room must be a positive integer/i,
      );
    });

    it("should return 400 if speakers are not positive integers", async () => {
      const res = await request(app)
        .put(`/api/formats/${standardFormatId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ speakers_per_team: 0 });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /speakers_per_team must be a positive integer/i,
      );
    });

    it("should return 403 if a regular user tries to update a format", async () => {
      const res = await request(app)
        .put(`/api/formats/${standardFormatId}`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ name: "User Format" });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have permission to perform this action. Admin required/i,
      );
    });
  });

  // DELETE part
  describe("DELETE /api/formats/:formatId", () => {
    it("should return 403 if a regular user tries to delete a format", async () => {
      const res = await request(app)
        .delete(`/api/formats/${standardFormatId}`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have permission to perform this action. Admin required/i,
      );
    });

    it("should archive an in-use format, and refuse to hard-delete it", async () => {
      const res = await request(app)
        .delete(`/api/formats/${inUseFormatId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Format archived successfully/i);

      // rooms still reference it; a permanent delete must be blocked
      const hardRes = await request(app)
        .delete(`/api/formats/${inUseFormatId}?hard=true`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(hardRes.statusCode).toEqual(409);
      expect(hardRes.body.message).toMatch(/dependent records exist/i);
    });

    it("should return 404 if attempting to delete a non-existent format", async () => {
      const res = await request(app)
        .delete("/api/formats/99999")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Format not found/i);
    });

    it("should successfully delete an unused format", async () => {
      const res = await request(app)
        .delete(`/api/formats/${standardFormatId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Format archived successfully/i);

      // verify it is completely gone
      const dbCheck = await Format.findByPk(standardFormatId);
      expect(dbCheck).toBeNull();
    });
  });
});
