const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Organisation,
  Owner,
  Event,
  Round,
  EventParticipant,
  Team,
  TeamMember,
  Room,
  RoomTeam,
  Format,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Team API Endpoints", () => {
  let ownerToken;
  let randomToken;

  let orgId;
  let eventId;
  let round1Id;
  let round2Id;
  let formatId;

  let p1, p2, p3, p4;
  let team1Id;
  let team2Id;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    // create Owner User
    const orgOwner = await User.create({
      username: "org_owner",
      password: "hashedpassword123",
    });
    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create Random User
    const randomUser = await User.create({
      username: "random_user",
      password: "hashedpassword123",
    });
    randomToken = jwt.sign(
      { id: randomUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create Org, Event, and Rounds
    const org = await Organisation.create({ name: "Team Test Org" });
    orgId = org.id;

    await Owner.create({
      user_id: orgOwner.id,
      organisation_id: orgId,
    });

    const event = await Event.create({
      organisation_id: orgId,
      name: "Team Test Event",
      status: "scheduled",
    });
    eventId = event.id;

    const round1 = await Round.create({
      event_id: eventId,
      name: "Round 1",
      sequence: 1,
    });
    round1Id = round1.id;

    const round2 = await Round.create({
      event_id: eventId,
      name: "Round 2",
      sequence: 2,
    });
    round2Id = round2.id;

    const format = await Format.create({
      name: "Standard",
      code: "STD",
      teams_per_room: 2,
      speakers_per_team: 2,
      has_reply: false,
      score_min: 50,
      score_max: 100,
    });
    formatId = format.id;

    // create Event Participants
    const participants = await EventParticipant.bulkCreate([
      {
        event_id: eventId,
        display_name: "Alice",
        role: "speaker",
        is_waitlist: true,
      },
      {
        event_id: eventId,
        display_name: "Bob",
        role: "speaker",
        is_waitlist: true,
      },
      {
        event_id: eventId,
        display_name: "Charlie",
        role: "speaker",
        is_waitlist: true,
      },
      {
        event_id: eventId,
        display_name: "John",
        role: "speaker",
        is_waitlist: true,
      },
    ]);

    p1 = participants[0].id;
    p2 = participants[1].id;
    p3 = participants[2].id;
    p4 = participants[3].id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // POST part
  describe("POST /api/rounds/:roundId/teams", () => {
    it("should allow an Owner to create a team", async () => {
      const res = await request(app)
        .post(`/api/rounds/${round1Id}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Team A",
          participant_ids: [p1, p2],
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.name).toBe("Team A");
      team1Id = res.body.data.id;

      // verify TeamMembers were created
      const members = await TeamMember.findAll({ where: { team_id: team1Id } });
      expect(members.length).toBe(2);
      expect(members[0].speaker_order).toBe(1);
    });

    it("should return 400 if participants are missing", async () => {
      const res = await request(app)
        .post(`/api/rounds/${round1Id}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Incomplete Team", participant_ids: [] });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Please provide a team name and an array of participant IDs/i,
      );
    });

    it("should return 400 if name is missing", async () => {
      const res = await request(app)
        .post(`/api/rounds/${round1Id}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ participant_ids: [p1, p2] });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /Please provide a team name and an array of participant IDs/i,
      );
    });

    it("should return 400 if a participant does not belong to the event", async () => {
      const res = await request(app)
        .post(`/api/rounds/${round1Id}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Invalid Team", participant_ids: [99998, 99999] });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /One or more participants are invalid or do not belong to this event/i,
      );
    });

    it("should return 404 if the round does not exist", async () => {
      const res = await request(app)
        .post(`/api/rounds/99999/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Missing Team", participant_ids: [p3, p4] });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Round not found/i);
    });

    it("should return 409 if a participant is already in a team this round", async () => {
      const res = await request(app)
        .post(`/api/rounds/${round1Id}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Duplicate Team", participant_ids: [p1, p3] });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /One or more participants are already assigned to a team in this round/i,
      );
    });

    it("should successfully allow the same participant to join a team in a different round", async () => {
      const res = await request(app)
        .post(`/api/rounds/${round2Id}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Round 2 Team A", participant_ids: [p1, p2] });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.name).toBe("Round 2 Team A");
      team2Id = res.body.data.id;

      // verify TeamMembers were created
      const members = await TeamMember.findAll({ where: { team_id: team2Id } });
      expect(members.length).toBe(2);
      expect(members[0].speaker_order).toBe(1);
    });

    it("should return 403 if a random user tries to create a team", async () => {
      const res = await request(app)
        .post(`/api/rounds/${round1Id}/teams`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ name: "Hacked Team", participant_ids: [p3, p4] });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });
  });

  // GET part
  describe("GET /api/rounds/:roundId/teams", () => {
    it("should successfully fetch and format teams for a round", async () => {
      const res = await request(app)
        .get(`/api/rounds/${round1Id}/teams`)
        .set("Authorization", `Bearer ${randomToken}`); // no restrictions on the route, so should work

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);

      const team = res.body.data[0];
      expect(team.name).toBe("Team A");
      expect(team.speakers.length).toBe(2);
      expect(team.speakers[0].name).toBe("Alice");
      expect(team.speakers[0].order).toBe(1);
    });
  });

  // PUT part
  describe("PUT /api/rounds/teams/:teamId", () => {
    it("should return 404 for a non-existent team", async () => {
      const res = await request(app)
        .put(`/api/rounds/teams/99999`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Updated Name" });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Team not found/i);
    });

    it("should allow an Owner to rename a team without touching members", async () => {
      const res = await request(app)
        .put(`/api/rounds/teams/${team1Id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Updated Team A" });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Team roster updated successfully/i);

      const dbCheck = await Team.findByPk(team1Id);
      expect(dbCheck.name).toBe("Updated Team A");
    });

    it("should update members, removing old ones to the waitlist and activating new ones", async () => {
      const res = await request(app)
        .put(`/api/rounds/teams/${team1Id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ participant_ids: [p3, p4] });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Team roster updated successfully/i);

      // verify new members are off the waitlist
      const newMembers = await EventParticipant.findAll({
        where: { id: [p3, p4] },
      });
      expect(newMembers[0].is_waitlist).toBe(false);
      expect(newMembers[1].is_waitlist).toBe(false);

      // verify old members are on the waitlist
      const oldMembers = await EventParticipant.findAll({
        where: { id: [p1, p2] },
      });
      expect(oldMembers[0].is_waitlist).toBe(true);
      expect(oldMembers[1].is_waitlist).toBe(true);
    });

    it("should return 400 if attempting to modify a team inside an active/completed room", async () => {
      // create a Room with status judging
      const activeRoom = await Room.create({
        round_id: round1Id,
        format_id: formatId,
        status: "judging",
      });

      // assign the team to this room
      await RoomTeam.create({
        room_id: activeRoom.id,
        team_id: team1Id,
        position: 1,
      });

      // try to update the team's roster
      const res = await request(app)
        .put(`/api/rounds/teams/${team1Id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ participant_ids: [p1, p2] });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /currently being judged or is already completed/i,
      );

      // back to pending for future testing
      activeRoom.status = "pending";
      await activeRoom.save();
    });
  });

  // DELETE part
  describe("DELETE /api/rounds/teams/:teamId", () => {
    it("should return 403 if a random user tries to delete the team", async () => {
      const res = await request(app)
        .delete(`/api/rounds/teams/${team1Id}`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have Organiser or Owner privileges for this event/i,
      );
    });

    it("should return 404 for a non-existent team", async () => {
      const res = await request(app)
        .delete(`/api/rounds/teams/99999`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Team not found/i);
    });

    it("should successfully delete a team and return completely freed participants to the waitlist", async () => {
      const res = await request(app)
        .delete(`/api/rounds/teams/${team1Id}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Team dissolved successfully/i);

      // verify p3 and p4 are back on the waitlist
      const freedMembers = await EventParticipant.findAll({
        where: { id: [p3, p4] },
      });
      expect(freedMembers[0].is_waitlist).toBe(true);
      expect(freedMembers[1].is_waitlist).toBe(true);

      // verify the team is actually gone
      const dbCheck = await Team.findByPk(team1Id);
      expect(dbCheck).toBeNull();
    });
  });
});
