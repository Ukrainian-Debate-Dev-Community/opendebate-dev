const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Owner,
  Organisation,
  Event,
  Round,
  Room,
  Team,
  Format,
  EventParticipant,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Archival Lifecycle", () => {
  let adminToken;
  let ownerToken;
  let orgId;
  let eventId;
  let formatId;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const adminUser = await User.create({
      username: "arch_admin",
      password: "hashedpassword123",
    });
    adminToken = jwt.sign(
      { id: adminUser.id, isAdmin: true },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const ownerUser = await User.create({
      username: "arch_owner",
      password: "hashedpassword123",
    });
    ownerToken = jwt.sign(
      { id: ownerUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const org = await Organisation.create({ name: "Archive Org" });
    orgId = org.id;
    await Owner.create({ user_id: ownerUser.id, organisation_id: orgId });

    const event = await Event.create({
      organisation_id: orgId,
      name: "Archive Event",
    });
    eventId = event.id;

    const format = await Format.create({
      name: "Archival Standard",
      code: "ARC",
      teams_per_room: 2,
      speakers_per_team: 2,
      score_min: 50,
      score_max: 100,
    });
    formatId = format.id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe("archive by default", () => {
    it("hides an archived event from default listings but keeps it under include_archived", async () => {
      const archiveRes = await request(app)
        .delete(`/api/events/${eventId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(archiveRes.statusCode).toEqual(200);
      expect(archiveRes.body.message).toMatch(/archived/i);

      const defaultList = await request(app)
        .get(`/api/events/organisation/${orgId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(defaultList.body.data.map((e) => e.id)).not.toContain(eventId);

      const archivedList = await request(app)
        .get(`/api/events/organisation/${orgId}?include_archived=true`)
        .set("Authorization", `Bearer ${ownerToken}`);
      const archived = archivedList.body.data.find((e) => e.id === eventId);
      expect(archived).toBeDefined();
      expect(archived.archived_at).not.toBeNull();
    });

    it("returns 409 when archiving an already archived record", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/already archived/i);
    });

    it("restores an archived event", async () => {
      const res = await request(app)
        .patch(`/api/events/${eventId}/restore`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.statusCode).toEqual(200);

      const dbCheck = await Event.findByPk(eventId);
      expect(dbCheck).not.toBeNull();
      expect(dbCheck.archived_at).toBeNull();
    });

    it("returns 409 when restoring a record that is not archived", async () => {
      const res = await request(app)
        .patch(`/api/events/${eventId}/restore`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/not archived/i);
    });
  });

  describe("explicit hard delete", () => {
    it("returns 403 when a non-admin requests a hard delete", async () => {
      const res = await request(app)
        .delete(`/api/events/${eventId}?hard=true`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(/Only an Admin/i);
    });

    it("returns 409 when hard delete is blocked by dependent records", async () => {
      await Round.create({ event_id: eventId, name: "R1", sequence: 1 });

      const res = await request(app)
        .delete(`/api/events/${eventId}?hard=true`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(/dependent records exist/i);
    });

    it("permanently deletes an archived record when an Admin passes hard=true", async () => {
      const disposable = await Event.create({
        organisation_id: orgId,
        name: "Disposable Event",
      });
      await disposable.destroy(); // archive first — the usual flow

      const res = await request(app)
        .delete(`/api/events/${disposable.id}?hard=true`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/deleted/i);

      const dbCheck = await Event.findByPk(disposable.id, { paranoid: false });
      expect(dbCheck).toBeNull();
    });
  });

  describe("archival side-effects", () => {
    it("frees the team name and its members for reuse after the team is archived", async () => {
      const speaker = await EventParticipant.create({
        event_id: eventId,
        display_name: "Recycled Speaker",
        role: "speaker",
      });

      const createRes = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Phoenix", participant_ids: [speaker.id] });
      expect(createRes.statusCode).toEqual(201);
      const teamId = createRes.body.data.id;

      const archiveRes = await request(app)
        .delete(`/api/events/${eventId}/teams/${teamId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(archiveRes.statusCode).toEqual(200);

      // same name AND same member must both be available again
      const recreateRes = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Phoenix", participant_ids: [speaker.id] });
      expect(recreateRes.statusCode).toEqual(201);
    });

    it("archives and restores a room together with its round", async () => {
      const round = await Round.findOne({ where: { event_id: eventId } });
      const room = await Room.create({
        round_id: round.id,
        format_id: formatId,
        status: "pending",
      });

      const archiveRes = await request(app)
        .delete(`/api/rooms/${room.id}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(archiveRes.statusCode).toEqual(200);
      expect(await Room.findByPk(room.id)).toBeNull();

      const restoreRes = await request(app)
        .patch(`/api/rooms/${room.id}/restore`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(restoreRes.statusCode).toEqual(200);
      expect(await Room.findByPk(room.id)).not.toBeNull();
    });
  });
});
