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
  Feedback,
} = require("../src/models");
const jwt = require("jsonwebtoken");

const sign = (id) =>
  jwt.sign({ id, isAdmin: false }, process.env.JWT_SECRET || "testsecret", {
    expiresIn: "1h",
  });

describe("Statistics API Endpoints", () => {
  let ownerToken;
  let randomToken;

  let orgId;
  let eventId;

  let teamIds; // { A, B, C, D }
  let speakerIds; // { s1..s6, iron }
  let judgeIds; // { j1, j2 }

  // builds one room with 4 ranked teams; speakers[i] is the array of
  // [participantId, score] pairs for the team ranked i+1
  const buildRoom = async (roundId, formatId, status, lineup) => {
    const room = await Room.create({
      round_id: roundId,
      format_id: formatId,
      status,
    });
    const chairRa = await RoomAdjudicator.create({
      room_id: room.id,
      participant_id: judgeIds.j1,
      role: "chair",
    });
    let position = 1;
    for (const { teamId, rank, speakers } of lineup) {
      const roomTeam = await RoomTeam.create({
        room_id: room.id,
        team_id: teamId,
        position,
        rank,
      });
      position += 1;
      for (const [participantId, value] of speakers) {
        const roomSpeaker = await RoomSpeaker.create({
          room_team_id: roomTeam.id,
          participant_id: participantId,
          rank,
        });
        await Score.create({
          room_speaker_id: roomSpeaker.id,
          room_adjudicator_id: chairRa.id,
          value,
        });
      }
    }
    return room;
  };

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const orgOwner = await User.create({
      username: "stats_owner",
      password: "hashedpassword123",
    });
    ownerToken = sign(orgOwner.id);

    const randomUser = await User.create({
      username: "stats_random",
      password: "hashedpassword123",
    });
    randomToken = sign(randomUser.id);

    const org = await Organisation.create({ name: "Stats Org" });
    orgId = org.id;
    await Owner.create({ user_id: orgOwner.id, organisation_id: orgId });

    const event = await Event.create({
      organisation_id: orgId,
      name: "Stats Open",
      status: "completed",
    });
    eventId = event.id;

    // a second completed event without rooms still counts as a session
    await Event.create({
      organisation_id: orgId,
      name: "Roomless Final",
      status: "completed",
    });
    // scheduled events are not sessions
    await Event.create({
      organisation_id: orgId,
      name: "Upcoming Open",
      status: "scheduled",
    });

    const format = await Format.create({
      name: "British Parliamentary",
      code: "BPS",
      teams_per_room: 4,
      speakers_per_team: 2,
      score_min: 50,
      score_max: 100,
    });

    const mkSpeaker = async (name) =>
      (
        await EventParticipant.create({
          event_id: eventId,
          display_name: name,
          role: "speaker",
        })
      ).id;

    speakerIds = {
      s1: await mkSpeaker("Speaker 1"),
      s2: await mkSpeaker("Speaker 2"),
      s3: await mkSpeaker("Speaker 3"),
      s4: await mkSpeaker("Speaker 4"),
      s5: await mkSpeaker("Speaker 5"),
      s6: await mkSpeaker("Speaker 6"),
      iron: await mkSpeaker("Iron Speaker"),
    };

    const j1 = await EventParticipant.create({
      event_id: eventId,
      display_name: "Judge 1",
      role: "adjudicator",
    });
    const j2 = await EventParticipant.create({
      event_id: eventId,
      display_name: "Judge 2",
      role: "adjudicator",
    });
    judgeIds = { j1: j1.id, j2: j2.id };

    const mkTeam = async (name) =>
      (await Team.create({ event_id: eventId, name })).id;
    teamIds = {
      A: await mkTeam("Team A"),
      B: await mkTeam("Team B"),
      C: await mkTeam("Team C"),
      D: await mkTeam("Team D"),
    };

    const visibleRound = await Round.create({
      event_id: eventId,
      name: "Round 1",
      sequence: 1,
      is_hidden: false,
    });
    const hiddenRound = await Round.create({
      event_id: eventId,
      name: "Round 2",
      sequence: 2,
      is_hidden: true,
    });

    // final room in the visible round; Team D irons with one speaker
    await buildRoom(visibleRound.id, format.id, "completed", [
      {
        teamId: teamIds.A,
        rank: 1,
        speakers: [
          [speakerIds.s1, 75],
          [speakerIds.s2, 76],
        ],
      },
      {
        teamId: teamIds.B,
        rank: 2,
        speakers: [
          [speakerIds.s3, 70],
          [speakerIds.s4, 71],
        ],
      },
      {
        teamId: teamIds.C,
        rank: 3,
        speakers: [
          [speakerIds.s5, 68],
          [speakerIds.s6, 69],
        ],
      },
      {
        teamId: teamIds.D,
        rank: 4,
        speakers: [
          [speakerIds.iron, 72],
          [speakerIds.iron, 73],
        ],
      },
    ]);

    // final room in the hidden round — only privileged viewers see it
    await buildRoom(hiddenRound.id, format.id, "completed", [
      {
        teamId: teamIds.A,
        rank: 1,
        speakers: [
          [speakerIds.s1, 80],
          [speakerIds.s2, 80],
        ],
      },
      {
        teamId: teamIds.B,
        rank: 2,
        speakers: [
          [speakerIds.s3, 65],
          [speakerIds.s4, 65],
        ],
      },
      {
        teamId: teamIds.C,
        rank: 3,
        speakers: [
          [speakerIds.s5, 70],
          [speakerIds.s6, 70],
        ],
      },
      {
        teamId: teamIds.D,
        rank: 4,
        speakers: [
          [speakerIds.iron, 60],
          [speakerIds.iron, 61],
        ],
      },
    ]);

    // a room that is still judging never feeds statistics, even if it
    // already carries (stale) ranks and scores
    const judgingRoom = await buildRoom(visibleRound.id, format.id, "judging", [
      {
        teamId: teamIds.B,
        rank: 1,
        speakers: [[speakerIds.s3, 99]],
      },
    ]);

    // feedback for Judge 1: two entries on the final visible room ...
    const finalRooms = await Room.findAll({
      where: { round_id: visibleRound.id, status: "completed" },
    });
    await Feedback.create({
      room_id: finalRooms[0].id,
      adjudicator_id: judgeIds.j1,
      issuer_team_id: teamIds.B,
      issuer_participant_id: null,
      score: 8,
    });
    await Feedback.create({
      room_id: finalRooms[0].id,
      adjudicator_id: judgeIds.j1,
      issuer_participant_id: speakerIds.s3,
      issuer_team_id: null,
      score: 9,
    });
    // ... and one on the judging room, which must not count
    await Feedback.create({
      room_id: judgingRoom.id,
      adjudicator_id: judgeIds.j1,
      issuer_team_id: teamIds.B,
      issuer_participant_id: null,
      score: 1,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe("GET /api/events/:eventId/stats/speakers", () => {
    it("requires authentication", async () => {
      const res = await request(app).get(
        `/api/events/${eventId}/stats/speakers`,
      );
      expect(res.statusCode).toBe(401);
    });

    it("returns 404 for a missing event", async () => {
      const res = await request(app)
        .get(`/api/events/99999/stats/speakers`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.statusCode).toBe(404);
    });

    it("computes rounds/total/avg/std over final rooms for a privileged viewer", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/stats/speakers`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toBe(200);

      const byId = Object.fromEntries(res.body.data.map((s) => [s.id, s]));

      expect(byId[speakerIds.s1]).toEqual({
        id: speakerIds.s1,
        name: "Speaker 1",
        rounds: 2,
        total: 155,
        avg: 77.5,
        std: 2.5,
      });

      // the judging-room score (99) must not leak into Speaker 3's stats
      expect(byId[speakerIds.s3]).toMatchObject({
        rounds: 2,
        total: 135,
        avg: 67.5,
        std: 2.5,
      });
    });

    it("counts an iron's two speeches in one room as a single round", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/stats/speakers`)
        .set("Authorization", `Bearer ${ownerToken}`);

      const iron = res.body.data.find((s) => s.id === speakerIds.iron);
      expect(iron).toEqual({
        id: speakerIds.iron,
        name: "Iron Speaker",
        rounds: 2,
        total: 266,
        avg: 66.5,
        std: 6.02,
      });
    });

    it("hides hidden rounds from unprivileged viewers", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/stats/speakers`)
        .set("Authorization", `Bearer ${randomToken}`);

      const s1 = res.body.data.find((s) => s.id === speakerIds.s1);
      expect(s1).toMatchObject({ rounds: 1, total: 75, avg: 75, std: 0 });
    });
  });

  describe("GET /api/events/:eventId/stats/teams", () => {
    it("aggregates speaker points and placements per team", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/stats/teams`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toBe(200);
      const byId = Object.fromEntries(res.body.data.map((t) => [t.id, t]));

      expect(byId[teamIds.A]).toEqual({
        id: teamIds.A,
        name: "Team A",
        total_speaker_points: 311,
        first_places: 2,
        fourth_places: 0,
      });
      // the judging room's stale rank-1 must not count for Team B
      expect(byId[teamIds.B]).toMatchObject({
        total_speaker_points: 271,
        first_places: 0,
        fourth_places: 0,
      });
      expect(byId[teamIds.D]).toMatchObject({
        total_speaker_points: 266,
        first_places: 0,
        fourth_places: 2,
      });
    });

    it("applies the hidden-round rule for unprivileged viewers", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/stats/teams`)
        .set("Authorization", `Bearer ${randomToken}`);

      const teamA = res.body.data.find((t) => t.id === teamIds.A);
      expect(teamA).toMatchObject({
        total_speaker_points: 151,
        first_places: 1,
      });
    });
  });

  describe("GET /api/events/:eventId/stats/adjudicators", () => {
    it("reports rooms adjudicated in final rooms and average feedback", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/stats/adjudicators`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toBe(200);
      const byId = Object.fromEntries(res.body.data.map((j) => [j.id, j]));

      // judging room excluded; feedback on it (score 1) excluded too
      expect(byId[judgeIds.j1]).toEqual({
        id: judgeIds.j1,
        name: "Judge 1",
        rooms_adjudicated: 2,
        avg_feedback: 8.5,
      });
      expect(byId[judgeIds.j2]).toEqual({
        id: judgeIds.j2,
        name: "Judge 2",
        rooms_adjudicated: 0,
        avg_feedback: null,
      });
    });

    it("excludes hidden rounds for unprivileged viewers", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/stats/adjudicators`)
        .set("Authorization", `Bearer ${randomToken}`);

      const j1 = res.body.data.find((j) => j.id === judgeIds.j1);
      expect(j1).toMatchObject({ rooms_adjudicated: 1 });
    });

    it("still answers at the old /stats/judges address, with rooms_judged", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/stats/judges`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toBe(200);
      const j1 = res.body.data.find((j) => j.id === judgeIds.j1);
      expect(j1).toMatchObject({ rooms_adjudicated: 2, rooms_judged: 2 });
    });
  });

  describe("GET /api/organisations/:organisationId/stats", () => {
    it("requires authentication", async () => {
      const res = await request(app).get(`/api/organisations/${orgId}/stats`);
      expect(res.statusCode).toBe(401);
    });

    it("returns 404 for a missing organisation", async () => {
      const res = await request(app)
        .get(`/api/organisations/99999/stats`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.statusCode).toBe(404);
    });

    it("averages winner and fourth-place speaker points across completed events' final rooms", async () => {
      const res = await request(app)
        .get(`/api/organisations/${orgId}/stats`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual({
        total_sessions: 2,
        avg_winner_speaker_points: 155.5, // (151 + 160) / 2
        avg_fourth_place_speaker_points: 133, // (145 + 121) / 2
      });
    });
  });
});
