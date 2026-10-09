const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Admin,
  Owner,
  Organisation,
  Event,
  EventParticipant,
} = require("../src/models");
const jwt = require("jsonwebtoken");

const sign = (id, isAdmin) =>
  jwt.sign({ id, isAdmin }, process.env.JWT_SECRET || "testsecret", {
    expiresIn: "1h",
  });

describe("POST /api/admins/merge", () => {
  let adminToken;
  let regularToken;
  let org;

  const user = (username) =>
    User.create({ username, password: "hashedpassword123" });

  const event = (name) =>
    Event.create({ organisation_id: org.id, name, status: "completed" });

  const register = (eventRow, userRow, display_name) =>
    EventParticipant.create({
      event_id: eventRow.id,
      user_id: userRow.id,
      display_name,
      role: "speaker",
    });

  const merge = (body, token = adminToken) =>
    request(app)
      .post("/api/admins/merge")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const admin = await user("merge_admin");
    await Admin.create({ user_id: admin.id });
    adminToken = sign(admin.id, true);

    const regular = await user("merge_regular");
    regularToken = sign(regular.id, false);

    org = await Organisation.create({ name: "Merge Org" });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it("moves every participation, archived ones included, then anonymises the source", async () => {
    const guest = await user("guest-abc");
    const account = await user("real_account");
    const first = await event("First night");
    const second = await event("Second night");
    const kept = await register(first, guest, "Olena");
    const archived = await register(second, guest, "Olena");
    await archived.destroy();

    const res = await merge({
      sourceUserId: guest.id,
      targetUserId: account.id,
      displayName: "Olena Petrenko",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.moved).toBe(2);

    const moved = await EventParticipant.findAll({
      where: { user_id: account.id },
      paranoid: false,
    });
    expect(moved.map((p) => p.id).sort()).toEqual(
      [kept.id, archived.id].sort(),
    );
    expect(moved.every((p) => p.display_name === "Olena Petrenko")).toBe(true);

    const source = await User.findByPk(guest.id);
    expect(source.is_deleted).toBe(true);
    expect(source.username).toBe(`deleted_user_${guest.id}`);
  });

  it("keeps display names when none is given", async () => {
    const guest = await user("guest-keep");
    const account = await user("keep_account");
    const night = await event("Keep night");
    await register(night, guest, "Guest Name");

    const res = await merge({
      sourceUserId: guest.id,
      targetUserId: account.id,
    });

    expect(res.status).toBe(200);
    const row = await EventParticipant.findOne({
      where: { user_id: account.id },
    });
    expect(row.display_name).toBe("Guest Name");
  });

  it("refuses when both users are registered in the same event", async () => {
    const guest = await user("guest-clash");
    const account = await user("clash_account");
    const night = await event("Clash night");
    await register(night, guest, "Guest");
    await register(night, account, "Account");

    const res = await merge({
      sourceUserId: guest.id,
      targetUserId: account.id,
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(`event ${night.id}`);
    const stillGuest = await EventParticipant.count({
      where: { user_id: guest.id },
    });
    expect(stillGuest).toBe(1);
    expect((await User.findByPk(guest.id)).is_deleted).toBe(false);
  });

  it("refuses a source that holds roles beyond participations", async () => {
    const owner = await user("owner_source");
    const account = await user("owner_target");
    await Owner.create({ user_id: owner.id, organisation_id: org.id });

    const res = await merge({
      sourceUserId: owner.id,
      targetUserId: account.id,
    });

    expect(res.status).toBe(409);
    expect((await User.findByPk(owner.id)).is_deleted).toBe(false);
  });

  it("validates its input", async () => {
    const someone = await user("validate_someone");

    expect((await merge({ targetUserId: someone.id })).status).toBe(400);
    expect(
      (await merge({ sourceUserId: someone.id, targetUserId: someone.id }))
        .status,
    ).toBe(400);
    expect(
      (await merge({ sourceUserId: someone.id, targetUserId: 999999 })).status,
    ).toBe(404);
    expect(
      (
        await merge({
          sourceUserId: 999999,
          targetUserId: someone.id,
          displayName: " ",
        })
      ).status,
    ).toBe(400);
  });

  it("is admin-only", async () => {
    const a = await user("admin_only_a");
    const b = await user("admin_only_b");

    const res = await merge(
      { sourceUserId: a.id, targetUserId: b.id },
      regularToken,
    );

    expect(res.status).toBe(403);
    expect((await User.findByPk(a.id)).is_deleted).toBe(false);
  });
});
