const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Owner,
  Organisation,
  Event,
  Round,
  Team,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Opt-in list pagination", () => {
  let ownerToken;
  let eventId;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const ownerUser = await User.create({
      username: "pag_owner",
      password: "hashedpassword123",
    });
    ownerToken = jwt.sign(
      { id: ownerUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const org = await Organisation.create({ name: "Pagination Org" });
    await Owner.create({ user_id: ownerUser.id, organisation_id: org.id });

    const event = await Event.create({
      organisation_id: org.id,
      name: "Pagination Event",
    });
    eventId = event.id;

    for (let i = 1; i <= 5; i++) {
      await Round.create({ event_id: eventId, name: `Round ${i}`, sequence: i });
      await Team.create({ event_id: eventId, name: `Team ${i}` });
    }
  });

  afterAll(async () => {
    await sequelize.close();
  });

  const getRounds = (query = "") =>
    request(app)
      .get(`/api/events/${eventId}/rounds${query}`)
      .set("Authorization", `Bearer ${ownerToken}`);

  it("returns the complete list when no pagination params are given", async () => {
    const res = await getRounds();
    expect(res.statusCode).toEqual(200);
    expect(res.body.data.length).toEqual(5);
  });

  it("slices the list when limit is provided, preserving order", async () => {
    const res = await getRounds("?limit=2");
    expect(res.statusCode).toEqual(200);
    expect(res.body.data.map((r) => r.sequence)).toEqual([1, 2]);
  });

  it("returns subsequent pages with page param", async () => {
    const res = await getRounds("?limit=2&page=2");
    expect(res.body.data.map((r) => r.sequence)).toEqual([3, 4]);
  });

  it("signals the last page by returning fewer rows than the limit", async () => {
    const res = await getRounds("?limit=2&page=3");
    expect(res.body.data.map((r) => r.sequence)).toEqual([5]);

    const beyond = await getRounds("?limit=2&page=4");
    expect(beyond.body.data).toEqual([]);
  });

  it("ignores invalid limit values and returns the complete list", async () => {
    for (const q of ["?limit=0", "?limit=-3", "?limit=abc", "?page=2"]) {
      const res = await getRounds(q);
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toEqual(5);
    }
  });

  it("paginates teams the same way", async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}/teams?limit=3&page=2`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body.data.length).toEqual(2);
  });

  it("paginates the organisation listing", async () => {
    const res = await request(app)
      .get("/api/organisations?limit=1")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body.data.length).toEqual(1);
  });
});
