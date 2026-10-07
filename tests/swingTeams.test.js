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
  RoomSpeaker,
  RoomAdjudicator,
  Score,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Swing Team Flag", () => {
  let ownerToken;

  let eventId;
  let normalTeamId;
  let swingTeamId;
  let p1, p2;
  let roomId;

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

    const normalRT = await RoomTeam.create({
      room_id: room.id,
      team_id: normalTeamId,
      position: 1,
      rank: 1,
    });
    const swingRT = await RoomTeam.create({
      room_id: room.id,
      team_id: swingTeamId,
      position: 2,
      rank: 2,
    });

    // scored speeches: one in the normal slot, one in the swing slot
    roomId = room.id;
    const rsNormal = await RoomSpeaker.create({
      room_team_id: normalRT.id,
      participant_id: p1,
      position: 1,
      rank: 1,
    });
    const rsSwing = await RoomSpeaker.create({
      room_team_id: swingRT.id,
      participant_id: p2,
      position: 1,
      rank: 2,
    });
    const judge = await EventParticipant.create({
      event_id: eventId,
      display_name: "Swing Judge",
      role: "adjudicator",
    });
    const chair = await RoomAdjudicator.create({
      room_id: room.id,
      participant_id: judge.id,
      role: "chair",
    });
    await Score.create({
      room_speaker_id: rsNormal.id,
      room_adjudicator_id: chair.id,
      value: 80,
    });
    await Score.create({
      room_speaker_id: rsSwing.id,
      room_adjudicator_id: chair.id,
      value: 70,
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

  it("should exclude swing-slot performances from raw speaker standings", async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}/standings/speakers`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.statusCode).toEqual(200);
    // normal speaker keeps their room entry
    expect(res.body.data[p1].rooms[roomId]).toEqual(1);
    // the swing speaker's performance is omitted entirely
    expect(res.body.data[p2].rooms).toEqual({});
  });

  it("should exclude swing speeches from calculated speaker standings while keeping room size", async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}/standings/calculated/speakers`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.statusCode).toEqual(200);
    const byId = {};
    res.body.data.forEach((s) => (byId[s.id] = s));
    // N = 2 teams in the room (the swing slot still counts toward N):
    // 80 * (1 + (2 - 1) * 0.1) = 88
    expect(byId[p1].total_points).toEqual(88);
    // swing speaker accumulates nothing
    expect(byId[p2].total_points).toEqual(0);
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
