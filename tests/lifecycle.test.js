const request = require("supertest");
const app = require("../src/app");
const { sequelize, Admin, User } = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Tournament Lifecycle Stress-Test", () => {
  let adminToken;
  let ownerToken;
  let randomToken;
  let ownerId;

  let orgId;
  let formatId;
  let eventId;
  let roundId;
  let motionId;

  let speakers = [];
  let adjudicators = [];
  let targetClaimToken;
  let targetParticipantId;

  let teamAId; // Permanent
  let roomId;
  let roomTeamAId; // Mapped from Permanent Team
  let roomTeamBId; // Mapped from Temp Team
  let roomSpeakerIds = {};

  let newlyRegisteredToken;
  let newlyRegisteredUserId;

  beforeAll(async () => {
    // wipe and sync
    await sequelize.sync({ force: true });

    // create an Admin User
    const adminUser = await User.create({
      username: "admin",
      password: "hashedpassword123",
    });
    await Admin.create({ user_id: adminUser.id });

    adminToken = jwt.sign(
      { id: adminUser.id, isAdmin: true },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create an Owner User
    const orgOwner = await User.create({
      username: "owner",
      password: "hashedpassword123",
    });
    ownerId = orgOwner.id;
    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    // create a Random User
    const randomUser = await User.create({
      username: "random_user",
      password: "hashedpassword123",
    });
    randomToken = jwt.sign(
      { id: randomUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // Infrastructure part (Org and Format)
  describe("Tournament Infrastructure", () => {
    it("should allow Admin to create an organisation and bind the Owner", async () => {
      const res = await request(app)
        .post("/api/organisations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Ultimate Club",
          type: "academic",
          owner_id: ownerId,
        });

      expect(res.statusCode).toEqual(201);
      orgId = res.body.data.id;
    });

    it("should deny Owner from creating a global format", async () => {
      const res = await request(app)
        .post("/api/formats")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "British Parliamentary",
          code: "BP",
          teams_per_room: 4,
          speakers_per_team: 2,
          score_min: 50,
          score_max: 100,
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /You do not have permission to perform this action/i,
      );
    });

    it("should allow Admin to create a 2v2 Format", async () => {
      const res = await request(app)
        .post("/api/formats")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Standard 2v2",
          code: "STD2v2",
          teams_per_room: 2,
          speakers_per_team: 2,
          has_reply: false,
          score_min: 50,
          score_max: 100,
        });

      expect(res.statusCode).toEqual(201);
      formatId = res.body.data.id;
    });
  });

  // Event part (Event, Round, Motion)
  describe("Event Initialisation", () => {
    it("should allow Owner to create an Event", async () => {
      const res = await request(app)
        .post(`/api/events/${orgId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "KPI 2026",
          is_ranked: true,
        });

      expect(res.statusCode).toEqual(201);
      eventId = res.body.data.id;
    });

    it("should allow Owner to create Round 1", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/rounds`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Round 1",
          sequence: 1,
        });

      expect(res.statusCode).toEqual(201);
      roundId = res.body.data.id;
    });

    it("should deny Round creation if sequence is duplicated", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/rounds`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Round 1 Duplicate", sequence: 1 });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /Sequence 1 already exists for this event/i,
      );
    });

    it("should allow Owner to create a Motion", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/motions`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          motion_text: "This House would ban artificial intelligence.",
          is_released: false,
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.is_released).toBe(false);
      motionId = res.body.data.id;
    });
  });

  // Motion Visibility Part
  describe("Motion Visibility and Release", () => {
    it("should mask the unreleased motion text for a non-privileged random user", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/motions`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data[0].is_released).toBe(false);
      expect(res.body.data[0].motion_text).toBe(
        "Motion will be revealed later.",
      );
    });

    it("should reveal the unreleased motion text for the Event Owner", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/motions`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data[0].is_released).toBe(false);
      expect(res.body.data[0].motion_text).toBe(
        "This House would ban artificial intelligence.",
      );
    });

    it("should allow the Owner to release the motion globally", async () => {
      const res = await request(app)
        .put(`/api/events/${eventId}/motions/${motionId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ is_released: true });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.is_released).toBe(true);
    });

    it("should now reveal the actual motion text for the non-privileged random user", async () => {
      const res = await request(app)
        .get(`/api/events/${eventId}/motions`)
        .set("Authorization", `Bearer ${randomToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data[0].is_released).toBe(true);
      expect(res.body.data[0].motion_text).toBe(
        "This House would ban artificial intelligence.",
      );
    });
  });

  // Registration part
  describe("Participant Registration", () => {
    it("should deny participant addition if role is missing", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/participants`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ display_name: "No Role" });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Display name and role are required/i);
    });

    it("should register 4 guest speakers and 2 adjudicators, capturing one claim token", async () => {
      // 4 Speakers
      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post(`/api/events/${eventId}/participants`)
          .set("Authorization", `Bearer ${ownerToken}`)
          .send({ display_name: `Speaker ${i}`, role: "speaker" });

        expect(res.statusCode).toEqual(201);
        speakers.push(res.body.data.id);

        // capture the first speaker's token for the identity claim test later
        if (i === 1) {
          targetClaimToken = res.body.data.raw_claim_token;
          targetParticipantId = res.body.data.id;
        }
      }

      // 2 Adjudicators (Chair and Panelist)
      for (let i = 1; i <= 2; i++) {
        const res = await request(app)
          .post(`/api/events/${eventId}/participants`)
          .set("Authorization", `Bearer ${ownerToken}`)
          .send({ display_name: `Judge ${i}`, role: "adjudicator" });

        expect(res.statusCode).toEqual(201);
        adjudicators.push(res.body.data.id);
      }

      expect(speakers.length).toBe(4);
      expect(adjudicators.length).toBe(2);
    });
  });

  // Debate part (Hybrid Teams and Rooms)
  describe("Hybrid Pairing", () => {
    it("should allow Owner to construct a Permanent Team at the Event level", async () => {
      // Team A (Constant)
      const res = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Government CONST",
          participant_ids: [speakers[0], speakers[1]],
          is_temporary: false,
        });

      expect(res.statusCode).toEqual(201);
      teamAId = res.body.data.id;
    });

    it("should deny Team creation if a participant is double-booked in another Permanent Team", async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/teams`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Duplicate Team",
          participant_ids: [speakers[0], speakers[3]],
          is_temporary: false,
        });

      expect(res.statusCode).toEqual(409);
      expect(res.body.message).toMatch(
        /already assigned to a permanent team in this event/i,
      );
    });

    it("should deny Room creation if no Chair is assigned", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          motion_id: motionId,
          teams: [
            { team_id: teamAId, position: 1 },
            {
              participant_ids: [speakers[2], speakers[3]],
              name: "Opposition FC",
              position: 2,
            },
          ],
          adjudicators: [{ participant_id: adjudicators[0], role: "panelist" }],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(
        /A room must have at least one adjudicator with the role 'chair'/i,
      );
    });

    it("should allow Owner to generate the Room using Hybrid teams (Permanent + Temporary) and properly map all relations", async () => {
      const res = await request(app)
        .post(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          format_id: formatId,
          motion_id: motionId,
          teams: [
            { team_id: teamAId, position: 1 }, // Permanent Team
            {
              participant_ids: [speakers[2], speakers[3]],
              name: "Opposition FC",
              position: 2,
            }, // Temporary FC Team
          ],
          adjudicators: [
            { participant_id: adjudicators[0], role: "chair" },
            { participant_id: adjudicators[1], role: "panelist" },
          ],
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.message).toMatch(/Room created successfully/i);

      // fetch the generated room to extract the IDs for the scoring
      const getRes = await request(app)
        .get(`/api/rounds/${roundId}/rooms`)
        .set("Authorization", `Bearer ${ownerToken}`);

      const room = getRes.body.data[0];
      roomId = room.id;

      // extract generated RoomTeam IDs
      const rtA = room.RoomTeams.find((rt) => rt.Team.id === teamAId);
      const rtB = room.RoomTeams.find((rt) => rt.Team.name === "Opposition FC");
      roomTeamAId = rtA.id;
      roomTeamBId = rtB.id;

      // map speakers to their explicit positions to ensure score processing works
      rtA.RoomSpeakers.forEach((rs) => {
        // Position 1 or 2 for speakers[0] and speakers[1]
        const participantId = speakers[rs.speech_position - 1];
        roomSpeakerIds[participantId] = rs.id;
      });

      rtB.RoomSpeakers.forEach((rs) => {
        // Position 1 or 2 for speakers[2] and speakers[3]
        const participantId = speakers[rs.speech_position + 1];
        roomSpeakerIds[participantId] = rs.id;
      });
    });
  });

  // Scoring part
  describe("Ballot Submission", () => {
    it("should deny score submission with out-of-bounds metrics", async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${adminToken}`) // since the chair is a participant without an account the admin submits the scores
        .send({
          teamRankings: [
            { room_team_id: roomTeamAId, rank: 1 },
            { room_team_id: roomTeamBId, rank: 2 },
          ],
          speakerScores: [
            { room_speaker_id: roomSpeakerIds[speakers[0]], score: 105 },
            { room_speaker_id: roomSpeakerIds[speakers[1]], score: 80 },
            { room_speaker_id: roomSpeakerIds[speakers[2]], score: 75 },
            { room_speaker_id: roomSpeakerIds[speakers[3]], score: 70 },
          ],
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/is out of bounds for format/i);
    });

    it("should allow valid score submission, lock the room, and calculate ranks", async () => {
      const res = await request(app)
        .post(`/api/rooms/${roomId}/scores`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          teamRankings: [
            { room_team_id: roomTeamAId, rank: 1 },
            { room_team_id: roomTeamBId, rank: 2 },
          ],
          speakerScores: [
            { room_speaker_id: roomSpeakerIds[speakers[0]], score: 85 },
            { room_speaker_id: roomSpeakerIds[speakers[1]], score: 80 },
            { room_speaker_id: roomSpeakerIds[speakers[2]], score: 75 },
            { room_speaker_id: roomSpeakerIds[speakers[3]], score: 70 },
          ],
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Scores submitted successfully/i);
    });
  });

  // Post-Tournament part (Identity Claim and Stats)
  describe("Account Generation, Identity Claim, and Analytics", () => {
    it("should successfully register a new user on the platform", async () => {
      const res = await request(app).post("/api/users/register").send({
        username: "newby",
        password: "hashedpassword123",
      });

      expect(res.statusCode).toEqual(201);

      const loginRes = await request(app).post("/api/users/login").send({
        username: "newby",
        password: "hashedpassword123",
      });

      expect(loginRes.statusCode).toEqual(200);
      newlyRegisteredToken = loginRes.body.token;
      newlyRegisteredUserId = loginRes.body.data.id;
    });

    it("should deny identity claim with an invalid token", async () => {
      const res = await request(app)
        .post(`/api/users/claim-participant/${targetParticipantId}`)
        .set("Authorization", `Bearer ${newlyRegisteredToken}`)
        .send({ claim_token: "invalid_token_123" });

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toMatch(/Invalid claim token/i);
    });

    it("should successfully claim the guest participant record and link it to the user", async () => {
      const res = await request(app)
        .post(`/api/users/claim-participant/${targetParticipantId}`)
        .set("Authorization", `Bearer ${newlyRegisteredToken}`)
        .send({ claim_token: targetClaimToken });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/Identity claimed successfully/i);
      expect(res.body.data.user_id).toBe(newlyRegisteredUserId);
    });

    it("should correctly aggregate and return user statistics based on the tournament results", async () => {
      const res = await request(app)
        .get(`/api/users/${newlyRegisteredUserId}/stats`)
        .set("Authorization", `Bearer ${newlyRegisteredToken}`);

      expect(res.statusCode).toEqual(200);

      // target participant was on Team A (Rank 1), scored 85.
      expect(res.body.data.overview.total_ballots_received).toBe(1);
      expect(res.body.data.overview.total_debates_ranked).toBe(1);
      expect(parseFloat(res.body.data.overview.average_speaker_score)).toBe(
        85.0,
      );
      expect(res.body.data.placements.first_places).toBe(1);
      expect(parseFloat(res.body.data.placements.win_rate_percentage)).toBe(
        100.0,
      );
    });
  });
});
