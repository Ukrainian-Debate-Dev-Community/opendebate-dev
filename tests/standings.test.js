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

describe("Standings API Endpoints", () => {
  let ownerToken;
  let randomToken;

  let eventId;
  let visibleRoomId;
  let hiddenRoomId;

  let teamAId, teamBId;
  let p1Id, p2Id;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    const orgOwner = await User.create({
      username: "org_owner",
      password: "hashedpassword123",
    });
    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const randomUser = await User.create({
      username: "random_user",
      password: "hashedpassword123",
    });
    randomToken = jwt.sign(
      { id: randomUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const org = await Organisation.create({ name: "Standings Org" });
    await Owner.create({ user_id: orgOwner.id, organisation_id: org.id });

    const event = await Event.create({
      organisation_id: org.id,
      name: "Standings Event",
    });
    eventId = event.id;

    const format = await Format.create({
      name: "STD",
      code: "STD",
      teams_per_room: 2,
      speakers_per_team: 2,
      score_min: 50,
      score_max: 100,
    });

    const p1 = await EventParticipant.create({
      event_id: eventId,
      display_name: "Speaker 1",
      role: "speaker",
    });
    const p2 = await EventParticipant.create({
      event_id: eventId,
      display_name: "Speaker 2",
      role: "speaker",
    });
    p1Id = p1.id;
    p2Id = p2.id;

    const teamA = await Team.create({ event_id: eventId, name: "Team A" });
    const teamB = await Team.create({ event_id: eventId, name: "Team B" });
    teamAId = teamA.id;
    teamBId = teamB.id;

    // visible part
    const visibleRound = await Round.create({
      event_id: eventId,
      name: "Round 1",
      sequence: 1,
      is_hidden: false,
    });
    const visibleRoom = await Room.create({
      round_id: visibleRound.id,
      format_id: format.id,
      status: "completed",
    });
    visibleRoomId = visibleRoom.id;

    const vRt1 = await RoomTeam.create({
      room_id: visibleRoomId,
      team_id: teamAId,
      position: 1,
      rank: 1,
    });
    const vRt2 = await RoomTeam.create({
      room_id: visibleRoomId,
      team_id: teamBId,
      position: 2,
      rank: 2,
    });

    await RoomSpeaker.create({
      room_team_id: vRt1.id,
      participant_id: p1Id,
      rank: 1,
    });
    await RoomSpeaker.create({
      room_team_id: vRt2.id,
      participant_id: p2Id,
      rank: 2,
    });

    // hidden part
    const hiddenRound = await Round.create({
      event_id: eventId,
      name: "Secret Final",
      sequence: 2,
      is_hidden: true,
    });
    const hiddenRoom = await Room.create({
      round_id: hiddenRound.id,
      format_id: format.id,
      status: "completed",
    });
    hiddenRoomId = hiddenRoom.id;

    const hRt1 = await RoomTeam.create({
      room_id: hiddenRoomId,
      team_id: teamAId,
      position: 1,
      rank: 2,
    });
    const hRt2 = await RoomTeam.create({
      room_id: hiddenRoomId,
      team_id: teamBId,
      position: 2,
      rank: 1,
    });

    await RoomSpeaker.create({
      room_team_id: hRt1.id,
      participant_id: p1Id,
      rank: 2,
    });
    await RoomSpeaker.create({
      room_team_id: hRt2.id,
      participant_id: p2Id,
      rank: 1,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // GET TEAMS part
  describe("GET /api/events/:eventId/standings/teams", () => {
    it("should allow an Owner to see team standings from ALL rounds (visible and hidden)", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/standings/teams`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      const standings = res.body.data;

      // Team A has both rooms mapped
      expect(standings[teamAId].rooms[visibleRoomId]).toBe(1);
      expect(standings[teamAId].rooms[hiddenRoomId]).toBe(2);
    });

    it("should only return team standings from VISIBLE rounds for a default user", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/standings/teams`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);
      const standings = res.body.data;

      // Team A has visible room, but hidden room is undefined
      expect(standings[teamAId].rooms[visibleRoomId]).toBe(1);
      expect(standings[teamAId].rooms[hiddenRoomId]).toBeUndefined();
    });
  });

  // GET SPEAKERS part
  describe("GET /api/events/:eventId/standings/speakers", () => {
    it("should allow an Owner to see speaker standings from ALL rounds (visible and hidden)", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/standings/speakers`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      const standings = res.body.data;

      expect(standings[p1Id].rooms[visibleRoomId]).toBe(1);
      expect(standings[p1Id].rooms[hiddenRoomId]).toBe(2);
    });

    it("should only return speaker standings from VISIBLE rounds for a default user", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/standings/speakers`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);
      const standings = res.body.data;

      expect(standings[p1Id].rooms[visibleRoomId]).toBe(1);
      expect(standings[p1Id].rooms[hiddenRoomId]).toBeUndefined();
    });
  });

  // CALCULATED STANDINGS part
  describe("Calculated Standings: GET /api/events/:eventId/standings/calculated/...", () => {
    beforeAll(async () => {
      const dummyAdj = await EventParticipant.create({
        event_id: eventId,
        display_name: "Math Judge",
        role: "adjudicator",
      });
      const vAdj = await RoomAdjudicator.create({
        room_id: visibleRoomId,
        participant_id: dummyAdj.id,
        role: "chair",
      });
      const hAdj = await RoomAdjudicator.create({
        room_id: hiddenRoomId,
        participant_id: dummyAdj.id,
        role: "chair",
      });

      const speakers = await RoomSpeaker.findAll({ order: [["id", "ASC"]] });

      for (let i = 0; i < speakers.length; i++) {
        const adjId = i < 2 ? vAdj.id : hAdj.id;
        await Score.create({
          room_speaker_id: speakers[i].id,
          room_adjudicator_id: adjId,
          value: 80,
        });
      }
    });

    it("Random User views Team Standings (Only Visible Round - Team A is Leader)", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/standings/calculated/teams`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);
      const standings = res.body.data;

      expect(standings[0].id).toBe(teamAId);
      expect(standings[0].total_points).toBe(1);

      expect(standings[1].id).toBe(teamBId);
      expect(standings[1].total_points).toBe(0);
    });

    it("Random User views Speaker Standings (Only Visible Round - Speaker 1 is Leader)", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/standings/calculated/speakers`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);
      const standings = res.body.data;

      expect(standings[0].id).toBe(p1Id);
      expect(standings[0].total_points).toBe(88);

      expect(standings[1].id).toBe(p2Id);
      expect(standings[1].total_points).toBe(80);
    });

    it("Owner views Team Standings (Both Rounds - Mathematical Tie)", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/standings/calculated/teams`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      const standings = res.body.data;

      const teamA = standings.find((t) => t.id === teamAId);
      const teamB = standings.find((t) => t.id === teamBId);

      expect(teamA.total_points).toBe(1);
      expect(teamB.total_points).toBe(1);
    });

    it("Owner views Speaker Standings (Both Rounds - Mathematical Tie)", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/standings/calculated/speakers`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      const standings = res.body.data;

      const p1 = standings.find((s) => s.id === p1Id);
      const p2 = standings.find((s) => s.id === p2Id);

      expect(p1.total_points).toBe(168);
      expect(p2.total_points).toBe(168);
    });
  });
});
