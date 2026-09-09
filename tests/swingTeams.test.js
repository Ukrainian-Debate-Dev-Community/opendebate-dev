const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Organisation,
  Owner,
  Event,
  Round,
  Format,
  EventParticipant,
  Team,
  Room,
  RoomTeam,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Swing Team Flag", () => {
  let ownerToken;

  let eventId;
  let normalTeamId;
  let swingTeamId;
  let p1, p2;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const orgOwner = await User.create({
      username: "swing_owner",
      password: "hashedpassword123",
    });
    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const org = await Organisation.create({ name: "Swing Org" });
    await Owner.create({ user_id: orgOwner.id, organisation_id: org.id });

    const event = await Event.create({
      organisation_id: org.id,
      name: "Swing Event",
    });
    eventId = event.id;

    const parts = await EventParticipant.bulkCreate([
      { event_id: eventId, display_name: "Normal Speaker", role: "speaker" },
      { event_id: eventId, display_name: "Swing Speaker", role: "speaker" },
    ]);
    p1 = parts[0].id;
    p2 = parts[1].id;

    const format = await Format.create({
      name: "Duo",
      code: "DUO",
      teams_per_room: 2,
      speakers_per_team: 1,
      score_min: 50,
      score_max: 100,
    });

    const normalTeam = await Team.create({
      event_id: eventId,
      name: "Real Team",
    });
    normalTeamId = normalTeam.id;

    // a completed room where the normal team beat the swing team
    const round = await Round.create({
      event_id: eventId,
      name: "Round 1",
      sequence: 1,
    });
    const room = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "completed",
    });

    const swingTeam = await Team.create({
      event_id: eventId,
      name: "Swing A",
      is_swing: true,
    });
    swingTeamId = swingTeam.id;

    await RoomTeam.create({
      room_id: room.id,
      team_id: normalTeamId,
      position: 1,
      rank: 1,
    });
    await RoomTeam.create({
      room_id: room.id,
      team_id: swingTeamId,
      position: 2,
      rank: 2,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it("should create a team with is_swing via the API", async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Swing B", participant_ids: [p2], is_swing: true });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.is_swing).toBe(true);
  });

  it("should default is_swing to false", async () => {
    const res = await request(app)
      .post(`/api/events/${eventId}/teams`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Ordinary", participant_ids: [p1] });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.is_swing).toBe(false);
  });

  it("should expose is_swing on the team listing", async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}/teams`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.statusCode).toEqual(200);
    const swing = res.body.data.find((t) => t.id === swingTeamId);
    expect(swing.is_swing).toBe(true);
  });

  it("should allow toggling is_swing via team update", async () => {
    const res = await request(app)
      .put(`/api/events/${eventId}/teams/${normalTeamId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ is_swing: true });

    expect(res.statusCode).toEqual(200);

    let team = await Team.findByPk(normalTeamId);
    expect(team.is_swing).toBe(true);

    // toggle back for the standings assertions below
    await request(app)
      .put(`/api/events/${eventId}/teams/${normalTeamId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ is_swing: false });

    team = await Team.findByPk(normalTeamId);
    expect(team.is_swing).toBe(false);
  });

  it("should exclude swing teams from raw team standings", async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}/standings/teams`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data[swingTeamId]).toBeUndefined();
    expect(res.body.data[normalTeamId]).toBeDefined();
  });

  it("should exclude swing teams from calculated standings but keep room size intact", async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}/standings/calculated/teams`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.statusCode).toEqual(200);

    const ids = res.body.data.map((t) => t.id);
    expect(ids).not.toContain(swingTeamId);

    // normal team ranked 1st of 2 teams: (2 - 1) = 1 point
    const normal = res.body.data.find((t) => t.id === normalTeamId);
    expect(normal.total_points).toBe(1);
  });
});
