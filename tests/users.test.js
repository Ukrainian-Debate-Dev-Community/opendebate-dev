const request = require("supertest");
const app = require("../src/app");
const { sequelize, User } = require("../src/models");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

describe("User API Endpoints", () => {
  let userToken;
  let userId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    // create a user to test unique username constraints
    await User.create({
      username: "taken_username",
      password: "hashedpassword123",
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST REGISTER part
  describe("POST /api/users/register", () => {
    it("should successfully register a new user and return a token", async () => {
      const res = await request(app)
        .post("/api/users/register")
        .send({ username: "testuser", password: "password" });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toBe("success");
      expect(res.body.token).toBeDefined();
      expect(res.body.data.username).toBe("testuser");

      userToken = res.body.token; // save for authenticated routes
      userId = res.body.data.id;
    });

    it("should return 400 if password is missing", async () => {
      const res = await request(app)
        .post("/api/users/register")
        .send({ username: "incompleteuser" }); // missing password

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Please provide username and password/i);
    });

    it("should return 400 if username is missing", async () => {
      const res = await request(app)
        .post("/api/users/register")
        .send({ password: "password" }); // missing username

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Please provide username and password/i);
    });

    it("should return 409 for Sequelize UniqueConstraintError for an existing username", async () => {
      const res = await request(app)
        .post("/api/users/register")
        .send({ username: "taken_username", password: "newpassword" });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /A record with that information already exists/i,
      );
    });
  });

  // POST LOGIN part
  describe("POST /api/users/login", () => {
    it("should login successfully with correct credentials", async () => {
      const res = await request(app)
        .post("/api/users/login")
        .send({ username: "testuser", password: "password" });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toBe("success");
      expect(res.body.token).toBeDefined();
    });

    it("should return 401 for an incorrect password", async () => {
      const res = await request(app)
        .post("/api/users/login")
        .send({ username: "testuser", password: "wrongpassword" });

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toMatch(/Invalid credentials/i);
    });

    it("should return 401 for a non-existent user", async () => {
      const res = await request(app)
        .post("/api/users/login")
        .send({ username: "ghostuser", password: "password" });

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toMatch(/Invalid credentials/i);
    });

    it("should return 400 if password is missing", async () => {
      const res = await request(app)
        .post("/api/users/login")
        .send({ username: "testuser" });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Please provide both a username and a password/i,
      );
    });

    it("should return 400 if username is missing", async () => {
      const res = await request(app)
        .post("/api/users/login")
        .send({ password: "password" });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Please provide both a username and a password/i,
      );
    });
  });

  // PUT PASSWORD part
  describe("PUT /api/users/password", () => {
    it("should return 401 if the old password does not match", async () => {
      const res = await request(app)
        .put("/api/users/password")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          oldPassword: "wrongoldpassword",
          newPassword: "newpassword",
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toMatch(/Password mismatch/i);
    });

    it("should successfully update the password", async () => {
      const res = await request(app)
        .put("/api/users/password")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ oldPassword: "password", newPassword: "newpassword" });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Password updated successfully/i);

      // verify the db hash actually changed
      const dbUser = await User.findByPk(userId);
      const isMatch = await bcrypt.compare("newpassword", dbUser.password);
      expect(isMatch).toBe(true);
    });

    it("should return 400 if old password is missing", async () => {
      const res = await request(app)
        .put("/api/users/password")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ newPassword: "newpassword" });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Please provide both old and new passwords/i,
      );
    });

    it("should return 400 if new password is missing", async () => {
      const res = await request(app)
        .put("/api/users/password")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ oldPassword: "password" });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Please provide both old and new passwords/i,
      );
    });
  });

  // PUT USERNAME part
  describe("PUT /api/users/username", () => {
    it("should successfully update the username", async () => {
      const res = await request(app)
        .put("/api/users/username")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ username: "updated_testuser" });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.username).toBe("updated_testuser");
    });

    it("should return 400 if the new username is missing", async () => {
      const res = await request(app)
        .put("/api/users/username")
        .set("Authorization", `Bearer ${userToken}`)
        .send({});

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Please provide a new username/i);
    });

    it("should return 409 if the username is taken", async () => {
      const res = await request(app)
        .put("/api/users/username")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ username: "taken_username" });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /A record with that information already exists/i,
      );
    });
  });

  // DELETE part
  describe("DELETE /api/users/ and Consequences", () => {
    it("should successfully hard delete the user", async () => {
      const res = await request(app)
        .delete("/api/users/")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toEqual(204);

      // verify the user is completely gone from the DB
      const dbUser = await User.findByPk(userId);
      expect(dbUser).toBeNull();
    });

    it("should fail to login with the deleted user's credentials", async () => {
      const res = await request(app)
        .post("/api/users/login")
        .send({ username: "updated_testuser", password: "newpassword" });

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toMatch(/Invalid credentials/i);
    });

    it("should return 401 if trying to use the token from the deleted user", async () => {
      // the token is still valid until it expires but the database record is gone.
      const res = await request(app)
        .delete("/api/users/")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toMatch(
        /The user belonging to this token no longer exists/i,
      );
    });
  });
});
