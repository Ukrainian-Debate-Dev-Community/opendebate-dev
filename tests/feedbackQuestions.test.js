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
  TeamMember,
  Room,
  RoomTeam,
  RoomAdjudicator,
} = require("../src/models");
const jwt = require("jsonwebtoken");

// An event defines its feedback form; feedback answers it, and with
// counting questions the score is the average of those answers.
describe("Feedback questions", () => {
  let ownerToken;
  let randomToken;
  let eventId;
  let plainEventId;
  let roomId;
  let plainRoomId;
  let adjA, adjB, adjC, plainAdj;
  let teams;
  let plainTeamId;
  let noteId, fairId, accuracyId;

  const token = (user) =>
    jwt.sign(
      { id: user.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      {
        expiresIn: "1h",
      },
    );

  const questions = (path = "", method = "post", tok = ownerToken) => {
    const url = `/api/events/${eventId}/feedback-questions${path}`;
    const req =
      method === "get"
        ? request(app).get(url)
        : method === "patch"
          ? request(app).patch(url)
          : method === "delete"
            ? request(app).delete(url)
            : request(app).post(url);
    return req.set("Authorization", `Bearer ${tok}`);
  };

  const submit = (room, body) =>
    request(app)
      .post(`/api/rooms/${room}/feedback`)
      .set("Authorization", `Bearer ${randomToken}`)
      .send(body);

  const stats = (event, query = "") =>
    request(app)
      .get(`/api/events/${event}/stats/adjudicators${query}`)
      .set("Authorization", `Bearer ${ownerToken}`);

  // a confirmed room with three adjudicators and teams whose members
  // are unclaimed, so any signed-in user may speak for them
  const makeRoom = async (event, format, adjudicators, teamNames) => {
    const round = await Round.create({
      event_id: event,
      name: "Round 1",
      sequence: 1,
    });
    const room = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "confirmed",
    });
    await RoomAdjudicator.bulkCreate(
      adjudicators.map((a, i) => ({
        room_id: room.id,
        participant_id: a.id,
        role: i === 0 ? "chair" : "panellist",
      })),
    );
    const made = [];
    for (const [i, name] of teamNames.entries()) {
      const speaker = await EventParticipant.create({
        event_id: event,
        display_name: `${name} speaker`,
        role: "speaker",
      });
      const team = await Team.create({ event_id: event, name });
      await TeamMember.create({ team_id: team.id, participant_id: speaker.id });
      await RoomTeam.create({
        room_id: room.id,
        team_id: team.id,
        position: i + 1,
      });
      made.push(team.id);
    }
    return { roomId: room.id, teams: made };
  };

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const owner = await User.create({
      username: "fq_owner",
      password: "hashed123",
    });
    const random = await User.create({
      username: "fq_random",
      password: "hashed123",
    });
    ownerToken = token(owner);
    randomToken = token(random);

    const org = await Organisation.create({ name: "Form Org" });
    await Owner.create({ user_id: owner.id, organisation_id: org.id });
    const format = await Format.create({
      name: "British Parliamentary",
      code: "BPFQ",
      teams_per_room: 4,
      speakers_per_team: 2,
      score_min: 50,
      score_max: 100,
    });

    const event = await Event.create({
      organisation_id: org.id,
      name: "Club night",
    });
    eventId = event.id;
    [adjA, adjB, adjC] = await EventParticipant.bulkCreate(
      ["A", "B", "C"].map((n) => ({
        event_id: eventId,
        display_name: `Adjudicator ${n}`,
        role: "adjudicator",
      })),
    );
    ({ roomId, teams } = await makeRoom(
      eventId,
      format,
      [adjA, adjB, adjC],
      ["OG", "OO", "CG", "CO"],
    ));

    // an event with no form keeps the plain score
    const plain = await Event.create({
      organisation_id: org.id,
      name: "Old style",
    });
    plainEventId = plain.id;
    plainAdj = await EventParticipant.create({
      event_id: plainEventId,
      display_name: "Plain adjudicator",
      role: "adjudicator",
    });
    ({
      roomId: plainRoomId,
      teams: [plainTeamId],
    } = await makeRoom(plainEventId, format, [plainAdj], ["Solo"]));
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it("lets anyone signed in read the form, but only the organisers write it", async () => {
    const list = await questions("", "get", randomToken);
    expect(list.statusCode).toEqual(200);
    expect(list.body.data).toEqual([]);

    const denied = await questions("", "post", randomToken).send({
      key: "accuracy",
      label: "Accuracy",
      type: "integer",
    });
    expect(denied.statusCode).toEqual(403);
  });

  it("creates the club form", async () => {
    const accuracy = await questions().send({
      key: "accuracy",
      label: "How accurate was the adjudicator's call?",
      type: "integer",
      min_value: 1,
      max_value: 10,
      required: true,
      counts_in_score: true,
      position: 1,
    });
    expect(accuracy.statusCode).toEqual(201);
    expect(accuracy.body.data.counts_in_score).toBe(true);
    accuracyId = accuracy.body.data.id;

    const reasoning = await questions().send({
      key: "reasoning",
      label: "How was the adjudicator's reasoning?",
      type: "integer",
      min_value: 1,
      max_value: 10,
      required: true,
      counts_in_score: true,
      position: 2,
    });
    expect(reasoning.statusCode).toEqual(201);

    const verdict = await questions().send({
      key: "verdict",
      label: "Did you agree with the call?",
      type: "choice",
      choices: ["agree", "disagree"],
      position: 3,
    });
    expect(verdict.statusCode).toEqual(201);

    const fair = await questions().send({
      key: "fair",
      label: "Fair?",
      type: "boolean",
    });
    expect(fair.statusCode).toEqual(201);
    fairId = fair.body.data.id;

    const note = await questions().send({
      key: "note",
      label: "Anything else",
      type: "text",
    });
    expect(note.statusCode).toEqual(201);
    noteId = note.body.data.id;

    const list = await questions("", "get", randomToken);
    expect(list.body.data.map((q) => q.key)).toEqual([
      "fair",
      "note",
      "accuracy",
      "reasoning",
      "verdict",
    ]);
  });

  it("refuses bad question definitions", async () => {
    const bad = [
      { key: "Bad Key", label: "x", type: "text" },
      { key: "range", label: "x", type: "integer", min_value: 9, max_value: 2 },
      { key: "scored_text", label: "x", type: "text", counts_in_score: true },
      { key: "int_choices", label: "x", type: "integer", choices: ["a"] },
      { key: "no_choices", label: "x", type: "choice", choices: [] },
      { key: "kind", label: "x", type: "date" },
      { key: "nolabel", label: " ", type: "text" },
    ];
    for (const body of bad) {
      expect((await questions().send(body)).statusCode).toEqual(400);
    }

    const duplicate = await questions().send({
      key: "accuracy",
      label: "Again",
      type: "text",
    });
    expect(duplicate.statusCode).toEqual(409);
  });

  it("checks every answer against the form", async () => {
    const team = teams[0];
    const ok = [
      { key: "accuracy", value: 7 },
      { key: "reasoning", value: 8 },
    ];
    const cases = [
      [{ key: "accuracy", value: 7 }], // required reasoning missing
      [
        { key: "accuracy", value: 11 },
        { key: "reasoning", value: 8 },
      ],
      [
        { key: "accuracy", value: 7.5 },
        { key: "reasoning", value: 8 },
      ],
      [
        { key: "accuracy", value: "7" },
        { key: "reasoning", value: 8 },
      ],
      [...ok, { key: "mood", value: 3 }],
      [...ok, { key: "verdict", value: "maybe" }],
      [...ok, { key: "fair", value: "yes" }],
      [...ok, { key: "note", value: "  " }],
      [...ok, { key: "accuracy", value: 6 }],
    ];
    for (const answers of cases) {
      const res = await submit(roomId, {
        adjudicator_id: adjA.id,
        issuer_team_id: team,
        answers,
      });
      expect(res.statusCode).toEqual(400);
    }

    // the form scores this event's feedback; a score of its own is refused
    const scored = await submit(roomId, {
      adjudicator_id: adjA.id,
      issuer_team_id: team,
      score: 9,
      answers: ok,
    });
    expect(scored.statusCode).toEqual(400);
  });

  it("scores feedback as the average of its counting answers", async () => {
    const res = await submit(roomId, {
      adjudicator_id: adjA.id,
      issuer_team_id: teams[0],
      comment: "The call was right; the comparison of the closings was thin.",
      answers: [
        { key: "accuracy", value: 7 },
        { key: "reasoning", value: 8 },
        { key: "verdict", value: "agree" },
        { key: "fair", value: true },
      ],
    });
    expect(res.statusCode).toEqual(201);
    expect(res.body.data.score).toEqual(7.5);
    expect(res.body.data.answers).toEqual(
      expect.arrayContaining([
        {
          key: "accuracy",
          label: "How accurate was the adjudicator's call?",
          value: 7,
        },
        {
          key: "verdict",
          label: "Did you agree with the call?",
          value: "agree",
        },
        { key: "fair", label: "Fair?", value: true },
      ]),
    );

    // one per team per adjudicator still holds
    const again = await submit(roomId, {
      adjudicator_id: adjA.id,
      issuer_team_id: teams[0],
      answers: [
        { key: "accuracy", value: 1 },
        { key: "reasoning", value: 1 },
      ],
    });
    expect(again.statusCode).toEqual(409);

    const nine = await submit(roomId, {
      adjudicator_id: adjB.id,
      issuer_team_id: teams[1],
      answers: [
        { key: "accuracy", value: 9 },
        { key: "reasoning", value: 9 },
      ],
    });
    expect(nine.body.data.score).toEqual(9);
  });

  it("lists feedback with its answers and computed score", async () => {
    const res = await request(app)
      .get(`/api/events/${eventId}/feedback`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.statusCode).toEqual(200);
    const forA = res.body.data.find((fb) => fb.adjudicator_id === adjA.id);
    expect(forA.score).toEqual(7.5);
    expect(forA.answers.find((a) => a.key === "reasoning").value).toEqual(8);
    expect(forA.IssuerTeam.name).toEqual("OG");
  });

  it("averages feedback scores, with an optional base vote", async () => {
    const plainStats = (await stats(eventId)).body.data;
    expect(plainStats.find((a) => a.id === adjA.id).avg_feedback).toEqual(7.5);
    expect(plainStats.find((a) => a.id === adjC.id).avg_feedback).toBeNull();

    const based = (await stats(eventId, "?base=5")).body.data;
    // one feedback of 9 with a base of 5: (5 + 9) / 2
    expect(based.find((a) => a.id === adjB.id).avg_feedback).toEqual(7);
    expect(based.find((a) => a.id === adjA.id).avg_feedback).toEqual(6.25);
    // no feedback yet: the base alone
    expect(based.find((a) => a.id === adjC.id).avg_feedback).toEqual(5);

    expect((await stats(eventId, "?base=abc")).statusCode).toEqual(400);
  });

  it("keeps answered questions fixed and lets unanswered ones change", async () => {
    expect(
      (await questions(`/${accuracyId}`, "patch").send({ label: "New" }))
        .statusCode,
    ).toEqual(409);
    expect((await questions(`/${accuracyId}`, "delete")).statusCode).toEqual(
      409,
    );
    expect((await questions(`/${fairId}`, "delete")).statusCode).toEqual(409);

    const renamed = await questions(`/${noteId}`, "patch").send({
      label: "Anything to add?",
    });
    expect(renamed.statusCode).toEqual(200);
    expect(renamed.body.data.label).toEqual("Anything to add?");
    expect(
      (
        await questions(`/${noteId}`, "patch").send({
          type: "integer",
          counts_in_score: true,
          choices: ["x"],
        })
      ).statusCode,
    ).toEqual(400);

    expect((await questions(`/${noteId}`, "delete")).statusCode).toEqual(200);
    expect((await questions(`/${noteId}`, "delete")).statusCode).toEqual(404);
  });

  it("leaves an event without a form as it was", async () => {
    const missing = await submit(plainRoomId, {
      adjudicator_id: plainAdj.id,
      issuer_team_id: plainTeamId,
    });
    expect(missing.statusCode).toEqual(400);

    const res = await submit(plainRoomId, {
      adjudicator_id: plainAdj.id,
      issuer_team_id: plainTeamId,
      score: 6,
    });
    expect(res.statusCode).toEqual(201);
    expect(res.body.data.score).toEqual(6);
    expect(res.body.data.answers).toEqual([]);

    const plainStats = (await stats(plainEventId)).body.data;
    expect(plainStats[0].avg_feedback).toEqual(6);
  });
});
