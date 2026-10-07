const request = require("supertest");
const app = require("../src/app");
const { sequelize, Organisation, Event } = require("../src/models");

describe("GET /api/events (public listing)", () => {
  let orgAId;
  let orgBId;
  let scheduledEventId;
  let inProgressEventId;
  let completedEventId;
  let archivedEventId;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const orgA = await Organisation.create({ name: "Public Org A" });
    orgAId = orgA.id;

    const orgB = await Organisation.create({ name: "Public Org B" });
    orgBId = orgB.id;

    const scheduledEvent = await Event.create({
      organisation_id: orgAId,
      name: "Spring Open",
      start_date: "2026-06-01",
      end_date: "2026-06-03",
      status: "scheduled",
      is_ranked: true,
    });
    scheduledEventId = scheduledEvent.id;

    const inProgressEvent = await Event.create({
      organisation_id: orgBId,
      name: "Summer Cup",
      start_date: "2026-07-01",
      status: "in_progress",
    });
    inProgressEventId = inProgressEvent.id;

    const completedEvent = await Event.create({
      organisation_id: orgAId,
      name: "May Invitational",
      start_date: "2026-05-01",
      status: "completed",
    });
    completedEventId = completedEvent.id;

    const archivedEvent = await Event.create({
      organisation_id: orgAId,
      name: "Ghost Event",
    });
    archivedEventId = archivedEvent.id;
    await archivedEvent.destroy();

    // filler events to exercise opt-in pagination
    for (let i = 1; i <= 22; i++) {
      await Event.create({
        organisation_id: orgBId,
        name: `Filler Event ${i}`,
      });
    }
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it("returns events without authentication in the standard envelope", async () => {
    const res = await request(app).get("/api/events");

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);

    const event = res.body.data.find((e) => e.id === scheduledEventId);
    expect(event).toMatchObject({
      id: scheduledEventId,
      name: "Spring Open",
      status: "scheduled",
      is_ranked: true,
      Organisation: { id: orgAId, name: "Public Org A" },
    });
    expect(event.start_date).toBeDefined();
    expect(event.end_date).toBeDefined();
  });

  it("returns the complete list when limit is omitted (opt-in pagination)", async () => {
    const res = await request(app).get("/api/events");
    expect(res.body.data.length).toEqual(25);

    // page without limit does not activate slicing
    const paged = await request(app).get("/api/events?page=2");
    expect(paged.statusCode).toEqual(200);
    expect(paged.body.data.length).toEqual(25);
  });

  it("paginates with an explicit limit, preserving id order", async () => {
    const firstPage = await request(app).get("/api/events?limit=2");
    expect(firstPage.body.data.map((e) => e.id)).toEqual([
      scheduledEventId,
      inProgressEventId,
    ]);

    const secondPage = await request(app).get("/api/events?limit=2&page=2");
    expect(secondPage.body.data.length).toEqual(2);
    expect(secondPage.body.data[0].id).toEqual(completedEventId);
  });

  it("filters by status", async () => {
    const res = await request(app).get("/api/events?status=in_progress");

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.length).toEqual(1);
    expect(res.body.data[0].id).toEqual(inProgressEventId);
  });

  it("returns 400 for an invalid status", async () => {
    const res = await request(app).get("/api/events?status=archived");

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toMatch(/Invalid status state/i);
  });

  it("filters by start_date range with from/to", async () => {
    const res = await request(app).get(
      "/api/events?from=2026-04-01&to=2026-06-30",
    );

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.map((e) => e.id).sort()).toEqual(
      [scheduledEventId, completedEventId].sort(),
    );
  });

  it("returns 400 for an invalid date filter", async () => {
    const res = await request(app).get("/api/events?from=not-a-date");

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toMatch(/Invalid from date/i);
  });

  it("excludes soft-deleted events", async () => {
    const res = await request(app).get("/api/events?limit=100");

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.map((e) => e.id)).not.toContain(archivedEventId);
  });

  it("keeps the per-event routes protected", async () => {
    const res = await request(app).get(`/api/events/${scheduledEventId}`);

    expect(res.statusCode).toEqual(401);
  });
});
