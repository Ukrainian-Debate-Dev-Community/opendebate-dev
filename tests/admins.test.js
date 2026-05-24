const request = require("supertest");
const app = require("../src/app");
const { sequelize, User, Admin } = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Admin API Endpoints", () => {
  let adminToken;
  let regularToken;
  let targetUserId;
  let alreadyAdminId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    // create the Admin
    const admin = await User.create({
      username: "admin",
      password: "hashedpassword123",
    });
    await Admin.create({ user_id: admin.id });

    adminToken = jwt.sign(
      { id: admin.id, isAdmin: true },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create a Regular User
    const regularUser = await User.create({
      username: "normal_user",
      password: "hashedpassword123",
    });

    regularToken = jwt.sign(
      { id: regularUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create a Target User
    const target = await User.create({
      username: "future_admin",
      password: "hashedpassword123",
    });
    targetUserId = target.id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe("POST /api/admins/grant", () => {
    it("should successfully grant admin privileges to a target user", async () => {
      const res = await request(app)
        .post("/api/admins/grant")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetUserId });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/successfully granted/i);

      // verify in db
      const checkAdmin = await Admin.findOne({
        where: { user_id: targetUserId },
      });
      expect(checkAdmin).not.toBeNull();
    });

    it("should return 400 if the target user is already an admin", async () => {
      const res = await request(app)
        .post("/api/admins/grant")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetUserId: targetUserId });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/This user is already an Admin/i);
    });

    it("should return 400 if the targetUserId is not provided", async () => {
      const res = await request(app)
        .post("/api/admins/grant")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Please provide the targetUserId/i);
    });

    it("should return 404 if the target user does not exist", async () => {
      const res = await request(app)
        .post("/api/admins/grant")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetUserId: 999999 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/User not found/i);
    });

    it("should return 404 if the target user is_deleted", async () => {
      // force is_deleted state
      const targetUser = await User.findByPk(targetUserId);
      targetUser.is_deleted = true;
      await targetUser.save();

      const res = await request(app)
        .post("/api/admins/grant")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ targetUserId: targetUserId });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/User not found/i);
    });

    it("should return 403 Forbidden if a regular user tries to grant admin rights", async () => {
      // response comes from the middleware
      const res = await request(app)
        .post("/api/admins/grant")
        .set("Authorization", `Bearer ${regularToken}`)
        .send({ targetUserId: 2 });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have permission to perform this action. Admin required/i,
      );
    });
  });
});
