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
  TeamMember,
} = require("../src/models");
const jwt = require("jsonwebtoken");

// An iron-person speaks twice for their team in one room. Both speeches
// count for the team; only one counts for the speaker standings.
describe("Iron speeches", () => {
  let ownerToken;
  let eventId;
  let userId;
  let ironId;
  let pairA, pairB;
  let roomId;
  let rtPair, rtIron;
  let pairSlots, ironSlots;

  const speakerStandings = async () =>
    (
      await request(app)
        .get(`/api/events/${eventId}/standings/calculated/speakers`)
        .set("Authorization", `Bearer ${ownerToken}`)
    ).body.data;

  const submit = (ironMark) =>
    request(app)
      .post(`/api/rooms/${roomId}/scores`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        teamRankings: [
          { room_team_id: rtIron.id, rank: 1 },
          { room_team_id: rtPair.id, rank: 2 },
        ],
        speakerScores: [
          { room_speaker_id: pairSlots[0].id, score: 70 },
          { room_speaker_id: pairSlots[1].id, score: 71 },
          { room_speaker_id: ironSlots[0].id, score: 80, ...ironMark(0) },
          { room_speaker_id: ironSlots[1].id, score: 76, ...ironMark(1) },
        ],
      });

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const owner = await User.create({ username: "iron_owner", password: "hashedpassword123" });
    ownerToken = jwt.sign(
      { id: owner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );
    const org = await Organisation.create({ name: "Iron Org" });
    await Owner.create({ user_id: owner.id, organisation_id: org.id });

    const event = await Event.create({ organisation_id: org.id, name: "Iron Event" });
    eventId = event.id;

    const ironUser = await User.create({ username: "iron_person", password: "hashedpassword123" });
    userId = ironUser.id;

    const [a, b, iron, judge] = await EventParticipant.bulkCreate([
      { event_id: eventId, display_name: "Pair A", role: "speaker" },
      { event_id: eventId, display_name: "Pair B", role: "speaker" },
      { event_id: eventId, display_name: "Iron", role: "speaker", user_id: userId },
      { event_id: eventId, display_name: "Judge", role: "adjudicator" },
    ]);
    ironId = iron.id;
    pairA = a.id;
    pairB = b.id;

    const format = await Format.create({
      name: "Duo",
      code: "DUO2",
      teams_per_room: 2,
      speakers_per_team: 2,
      score_min: 50,
      score_max: 100,
    });
    const round = await Round.create({ event_id: eventId, name: "Round 1", sequence: 1 });
    const room = await Room.create({ round_id: round.id, format_id: format.id, status: "pending" });
    roomId = room.id;

    const pairTeam = await Team.create({ event_id: eventId, name: "Pair" });
    const ironTeam = await Team.create({ event_id: eventId, name: "Iron" });
    await TeamMember.bulkCreate([
      { team_id: pairTeam.id, participant_id: a.id },
      { team_id: pairTeam.id, participant_id: b.id },
      { team_id: ironTeam.id, participant_id: iron.id },
    ]);
    rtPair = await RoomTeam.create({ room_id: roomId, team_id: pairTeam.id, position: 1 });
    rtIron = await RoomTeam.create({ room_id: roomId, team_id: ironTeam.id, position: 2 });

    pairSlots = await RoomSpeaker.bulkCreate([
      { room_team_id: rtPair.id, participant_id: a.id },
      { room_team_id: rtPair.id, participant_id: b.id },
    ]);
    ironSlots = await RoomSpeaker.bulkCreate([
      { room_team_id: rtIron.id, participant_id: iron.id },
      { room_team_id: rtIron.id, participant_id: iron.id },
    ]);

    await RoomAdjudicator.create({ room_id: roomId, participant_id: judge.id, role: "chair" });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it("marks the later speech iron when the ballot does not say", async () => {
    const res = await submit(() => ({}));
    expect(res.statusCode).toEqual(200);

    await Promise.all(ironSlots.map((s) => s.reload()));
    expect(ironSlots.map((s) => s.is_iron)).toEqual([false, true]);
  });

  it("counts only the unmarked speech in the speaker standings", async () => {
    const iron = (await speakerStandings()).find((s) => s.id === ironId);
    // rank 1 of 2 teams: multiplier 1.1, one speech of 80
    expect(iron.total_points).toEqual(88);
  });

  it("follows the ballot's mark, and the speaker stats follow it too", async () => {
    const res = await submit((i) => ({ is_iron: i === 0 }));
    expect(res.statusCode).toEqual(200);

    const iron = (await speakerStandings()).find((s) => s.id === ironId);
    expect(iron.total_points).toEqual(83.6);

    const stats = await request(app)
      .get(`/api/events/${eventId}/stats/speakers`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const row = stats.body.data.find((s) => s.id === ironId);
    expect(row.total).toEqual(76);
  });

  it("keeps both speeches in the room read, with the flag", async () => {
    const res = await request(app)
      .get(`/api/rounds/${(await Room.findByPk(roomId)).round_id}/rooms`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const ironTeam = res.body.data[0].RoomTeams.find((rt) => rt.id === rtIron.id);
    expect(ironTeam.RoomSpeakers.map((s) => s.is_iron).sort()).toEqual([false, true]);
  });

  it("refuses a mark on a speech that is not an iron's, or on both", async () => {
    const wrong = await request(app)
      .post(`/api/rooms/${roomId}/scores`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        teamRankings: [
          { room_team_id: rtIron.id, rank: 1 },
          { room_team_id: rtPair.id, rank: 2 },
        ],
        speakerScores: [
          { room_speaker_id: pairSlots[0].id, score: 70, is_iron: true },
          { room_speaker_id: pairSlots[1].id, score: 71 },
          { room_speaker_id: ironSlots[0].id, score: 80 },
          { room_speaker_id: ironSlots[1].id, score: 76 },
        ],
      });
    expect(wrong.statusCode).toEqual(400);

    const both = await submit(() => ({ is_iron: true }));
    expect(both.statusCode).toEqual(400);
  });

  it("files a speech under the teammate who gave it; the absent one gets nothing", async () => {
    const send = (pairExtra) =>
      request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          teamRankings: [
            { room_team_id: rtIron.id, rank: 1 },
            { room_team_id: rtPair.id, rank: 2 },
          ],
          speakerScores: [
            { room_speaker_id: pairSlots[0].id, score: 70 },
            { room_speaker_id: pairSlots[1].id, score: 69, ...pairExtra },
            { room_speaker_id: ironSlots[0].id, score: 80 },
            { room_speaker_id: ironSlots[1].id, score: 76 },
          ],
        });

    // someone outside the team cannot be named
    expect((await send({ participant_id: ironId })).statusCode).toEqual(400);

    // Pair A gave both of the pair's speeches
    const res = await send({ participant_id: pairA });
    expect(res.statusCode).toEqual(200);

    await Promise.all(pairSlots.map((s) => s.reload()));
    expect(pairSlots.map((s) => s.participant_id)).toEqual([pairA, pairA]);
    expect(pairSlots.map((s) => s.is_iron)).toEqual([false, true]);

    const standings = await speakerStandings();
    // rank 2 of 2: multiplier 1.0, one speech of 70 counted
    expect(standings.find((s) => s.id === pairA).total_points).toEqual(70);
    expect(standings.find((s) => s.id === pairB).total_points).toEqual(0);
  });
});
