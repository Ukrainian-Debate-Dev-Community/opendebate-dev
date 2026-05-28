const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Admin,
  Organisation,
  Owner,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Owner API Endpoints", () => {
  let adminToken;
  let ownerToken;
  let randomToken;
  let targetUserId;
  let orgId;
  let initialOwnerId;

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

    // create a Regular User (initially Owner)
    const orgOwner = await User.create({
      username: "org_owner",
      password: "hashedpassword123",
    });
    initialOwnerId = orgOwner.id;

    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create a Target User (to be added)
    const targetUser = await User.create({
      username: "target_user",
      password: "hashedpassword123",
    });
    targetUserId = targetUser.id;

    // create a Random User (no permissions)
    const randomUser = await User.create({
      username: "random_user",
      password: "hashedpassword123",
    });

    randomToken = jwt.sign(
      { id: randomUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create the Organisation
    const org = await Organisation.create({
      name: "Debate Test Org",
    });
    orgId = org.id;

    await Owner.create({
      user_id: initialOwnerId,
      organisation_id: orgId,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/organisations/:organisationId/owners", () => {
    it("should allow an existing Owner to add a new owner", async () => {
      const res = await request(app)
        .post(`/api/organisations/${orgId}/owners`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ targetUserId });

      expect(res.statusCode).toEqual(201);
      expect(res.body.message).toMatch(/Owner added successfully/i);
    });

    it("should allow an Admin to add an owner", async () => {
      // temporary user to add
      const anotherUser = await User.create({
        username: "another_user",
        password: "hashedpassword123",
      });

      const res = await request(app)
        .post(`/api/organisations/${orgId}/owners`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetUserId: anotherUser.id });

      expect(res.statusCode).toEqual(201);
      expect(res.body.message).toMatch(/Owner added successfully/i);
    });

    it("should return 400 if the targetUserId is missing", async () => {
      const res = await request(app)
        .post(`/api/organisations/${orgId}/owners`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({});

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Please provide the targetUserId/i);
    });

    it("should return 400 if the user is already an owner", async () => {
      const res = await request(app)
        .post(`/api/organisations/${orgId}/owners`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ targetUserId });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /User is already an owner of this Organisation/i,
      );
    });

    it("should return 404 if the target user does not exist", async () => {
      const res = await request(app)
        .post(`/api/organisations/${orgId}/owners`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ targetUserId: 999999 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/User not found/i);
    });

    it("should return 404 if the target user is soft-deleted", async () => {
      // create a deleted User
      const deletedUser = await User.create({
        username: "deleted_owner_candidate",
        password: "hashedpassword123",
        is_deleted: true,
      });

      const res = await request(app)
        .post(`/api/organisations/${orgId}/owners`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ targetUserId: deletedUser.id });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/User not found/i);
    });

    it("should return 403 if a user with no permissions tries to add an owner", async () => {
      const res = await request(app)
        .post(`/api/organisations/${orgId}/owners`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ targetUserId: 2 });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /Only an Owner of this organisation can perform this action/i,
      );
    });
  });

  // DELETE part
  describe("DELETE /api/organisations/:organisationId/owners/:ownerId", () => {
    it("should return 403 if an existing Owner tries to remove another owner", async () => {
      const res = await request(app)
        .delete(`/api/organisations/${orgId}/owners/${targetUserId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have permission to perform this action. Admin required/i,
      );
    });

    it("should allow an Admin to remove an owner", async () => {
      const res = await request(app)
        .delete(`/api/organisations/${orgId}/owners/${targetUserId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Owner removed successfully/i);
    });

    it("should return 404 if attempting to remove a user who is not an owner", async () => {
      const res = await request(app)
        .delete(`/api/organisations/${orgId}/owners/${targetUserId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(
        /This user is not an owner of this Organisation/i,
      );
    });

    it("should prevent an Admin from removing the last remaining owner", async () => {
      // force deletion of all owners except the initial one
      const remainingOwners = await Owner.findAll({
        where: { organisation_id: orgId },
      });

      for (let owner of remainingOwners) {
        if (owner.user_id !== initialOwnerId) {
          await Owner.destroy({ where: { user_id: owner.user_id } });
        }
      }

      const res = await request(app)
        .delete(`/api/organisations/${orgId}/owners/${initialOwnerId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Cannot remove the last owner/i);
    });
  });
});
