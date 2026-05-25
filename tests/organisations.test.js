const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Admin,
  Organisation,
  Owner,
  Event,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Organisation API Endpoints", () => {
  let adminToken;
  let ownerToken;
  let randomToken;

  let adminId;
  let ownerId;

  let standardOrgId;
  let softDeleteOrgId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    // create an Admin User
    const adminUser = await User.create({
      username: "admin_user",
      password: "hashedpassword123",
    });
    await Admin.create({ user_id: adminUser.id });
    adminId = adminUser.id;

    adminToken = jwt.sign(
      { id: adminUser.id, isAdmin: true },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create an Org Owner User
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

    // pre-create an Organisation that has an Event to test Soft Deletion
    const softDeleteOrg = await Organisation.create({
      name: "Historical Org",
      type: "academic",
      status: "active",
    });
    softDeleteOrgId = softDeleteOrg.id;

    await Owner.create({
      user_id: adminId,
      organisation_id: softDeleteOrgId,
    });

    await Event.create({
      organisation_id: softDeleteOrgId,
      name: "Historical Event 2025",
      status: "completed",
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/organisations", () => {
    it("should allow an Admin to create a new organisation", async () => {
      const res = await request(app)
        .post("/api/organisations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Debate Org",
          type: "academic",
          owner_id: ownerId,
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toBe("success");
      expect(res.body.data.name).toBe("Debate Org");

      standardOrgId = res.body.data.id; // save for subsequent tests

      // verify assigned owner in the DB
      const ownerRecord = await Owner.findOne({
        where: { user_id: ownerId, organisation_id: standardOrgId },
      });
      expect(ownerRecord).not.toBeNull();
    });

    it("should return 400 if owner_id is missing", async () => {
      const res = await request(app)
        .post("/api/organisations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Incomplete Org" });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Please provide an organisation name and an initial owner_id/i,
      );
    });

    it("should return 400 if name is missing", async () => {
      const res = await request(app)
        .post("/api/organisations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ owner_id: ownerId });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Please provide an organisation name and an initial owner_id/i,
      );
    });

    it("should return 400 if the type is invalid", async () => {
      const res = await request(app)
        .post("/api/organisations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Invalid Org", type: "corporate", owner_id: adminId });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Organisation type must be strictly 'academic' or 'personal'/i,
      );
    });

    it("should return 404 if the designated owner does not exist", async () => {
      const res = await request(app)
        .post("/api/organisations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Invalid Org", owner_id: 99999 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(
        /The designated owner does not exist or is deleted/i,
      );
    });

    it("should return 403 if a non-admin tries to create an organisation", async () => {
      const res = await request(app)
        .post("/api/organisations")
        .set("Authorization", `Bearer ${ownerToken}`) // owner-case
        .send({ name: "Ivalid Org", owner_id: ownerId });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have permission to perform this action. Admin required/i,
      );
    });

    it("should return 403 if a non-admin tries to create an organisation", async () => {
      const res = await request(app)
        .post("/api/organisations")
        .set("Authorization", `Bearer ${randomToken}`) // user-case
        .send({ name: "Invalid Org", owner_id: ownerId });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have permission to perform this action. Admin required/i,
      );
    });
  });

  // GET ALL part
  describe("GET /api/organisations", () => {
    it("should retrieve all active and non-deleted organisations", async () => {
      const res = await request(app)
        .get("/api/organisations")
        .set("Authorization", `Bearer ${randomToken}`); // no restrictions on the route, so should work

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // GET BY ID part
  describe("GET /api/organisations/:organisationId", () => {
    it("should retrieve a specific active organisation with its Owners", async () => {
      const res = await request(app)
        .get(`/api/organisations/${standardOrgId}`)
        .set("Authorization", `Bearer ${randomToken}`); // also no restrictions

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.id).toBe(standardOrgId);
      expect(res.body.data.Owners).toBeDefined();
      expect(res.body.data.Owners[0].id).toBe(ownerId);
    });

    it("should return 404 if the organisation is inactive or deleted", async () => {
      // force inactive status
      const org = await Organisation.findByPk(standardOrgId);
      org.status = "inactive";
      await org.save();

      const res = await request(app)
        .get(`/api/organisations/${standardOrgId}`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Organisation not found/i);

      // revert status for subsequent tests
      org.status = "active";
      await org.save();
    });
  });

  // PUT part
  describe("PUT /api/organisations/:organisationId", () => {
    it("should allow an Owner to update their own organisation", async () => {
      const res = await request(app)
        .put(`/api/organisations/${standardOrgId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ type: "personal", online: true });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.type).toBe("personal");
      expect(res.body.data.online).toBe(true);
    });

    it("should return 400 if the updated type is invalid", async () => {
      const res = await request(app)
        .put(`/api/organisations/${standardOrgId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ type: "corporate" });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Organisation type must be strictly 'academic' or 'personal'/i,
      );
    });

    // this case also covers Owners of external Org trying to update
    it("should return 403 if a random user tries to update the organisation", async () => {
      const res = await request(app)
        .put(`/api/organisations/${standardOrgId}`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ name: "Hacked Org" });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /Only an Owner of this organisation can perform this action/i,
      );
    });

    // the admin bypasses the 403 check above and may try to update a non-existent Org
    it("should return 404 if attempting to update a non-existent organisation", async () => {
      const res = await request(app)
        .put("/api/organisations/99999")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ type: "personal" });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Organisation not found/i);
    });
  });

  // DELETE part
  describe("DELETE /api/organisations/:organisationId", () => {
    it("should return 403 if an Owner tries to delete the organisation", async () => {
      const res = await request(app)
        .delete(`/api/organisations/${standardOrgId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have permission to perform this action. Admin required/i,
      );
    });

    it("should return 404 if attempting to delete a non-existent organisation", async () => {
      const res = await request(app)
        .delete("/api/organisations/99999")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Organisation not found/i);
    });

    it("should soft-delete if the Organisation has historical events", async () => {
      const res = await request(app)
        .delete(`/api/organisations/${softDeleteOrgId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(
        /Organisation has historical events. It has been deactivated instead of deleted/i,
      );

      // verify the soft-delete state in the DB
      const dbCheck = await Organisation.findByPk(softDeleteOrgId);
      expect(dbCheck.status).toBe("inactive");
      expect(dbCheck.is_deleted).toBe(true);
    });

    it("should hard-delete an empty Organisation", async () => {
      const res = await request(app)
        .delete(`/api/organisations/${standardOrgId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(204);

      // verify it is completely gone
      const dbCheck = await Organisation.findByPk(standardOrgId);
      expect(dbCheck).toBeNull();
    });
  });
});
