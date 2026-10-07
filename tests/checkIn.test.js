const request = require("supertest");
const app = require("../src/app");
const {
  sequelize,
  User,
  Organisation,
  Owner,
  Event,
  EventParticipant,
  Format,
} = require("../src/models");
const jwt = require("jsonwebtoken");

describe("Participant Check-in API Endpoints", () => {
  let ownerToken;
  let selfToken;
  let randomToken;

  let eventId;
  let formatId;
  let selfParticipantId;
  let guestParticipantId;
  let speakerIds = [];

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const orgOwner = await User.create({
      username: "checkin_owner",
      password: "hashedpassword123",
    });
    ownerToken = jwt.sign(
      { id: orgOwner.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const selfUser = await User.create({
      username: "checkin_self",
      password: "hashedpassword123",
    });
    selfToken = jwt.sign(
      { id: selfUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const randomUser = await User.create({
      username: "checkin_random",
      password: "hashedpassword123",
    });
    randomToken = jwt.sign(
      { id: randomUser.id, isAdmin: false },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "1h" },
    );

    const org = await Organisation.create({ name: "Check-in Org" });
    await Owner.create({ user_id: orgOwner.id, organisation_id: org.id });

    const event = await Event.create({
      organisation_id: org.id,
      name: "Check-in Cup",
      status: "scheduled",
    });
    eventId = event.id;

    const format = await Format.create({
      name: "British Parliamentary",
      code: "BP",
      teams_per_room: 4,
      speakers_per_team: 2,
      score_min: 50,
      score_max: 100,
    });
    formatId = format.id;

    // a participant linked to selfUser
    const selfParticipant = await EventParticipant.create({
      event_id: eventId,
      user_id: selfUser.id,
      display_name: "Self Speaker",
      role: "speaker",
    });
    selfParticipantId = selfParticipant.id;
    speakerIds.push(selfParticipant.id);

    // an organiser-created guest
    const guest = await EventParticipant.create({
      event_id: eventId,
      user_id: null,
      display_name: "Guest Speaker",
      role: "speaker",
    });
    guestParticipantId = guest.id;
    speakerIds.push(guest.id);

    // extra free speakers for team generation
    for (let i = 1; i <= 4; i++) {
      const sp = await EventParticipant.create({
        event_id: eventId,
        display_name: `Free Speaker ${i}`,
        role: "speaker",
      });
      speakerIds.push(sp.id);
    }
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe("PATCH /api/events/:eventId/participants/:participantId/check-in", () => {
    it("should default new participants to not checked in", async () => {
      const participant = await EventParticipant.findByPk(guestParticipantId);
      expect(participant.checked_in).toBe(false);
    });

    it("should allow an Organiser/Owner to check a participant in", async () => {
      const res = await request(app)
        .patch(
          `/api/events/${eventId}/participants/${guestParticipantId}/check-in`,
        )
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ checked_in: true });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.checked_in).toBe(true);

      const checkRecord = await EventParticipant.findByPk(guestParticipantId);
      expect(checkRecord.checked_in).toBe(true);
    });

    it("should allow a participant to check themselves in", async () => {
      const res = await request(app)
        .patch(
          `/api/events/${eventId}/participants/${selfParticipantId}/check-in`,
        )
        .set("Authorization", `Bearer ${selfToken}`)
        .send({ checked_in: true });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.checked_in).toBe(true);
    });

    it("should return 403 if a random user tries to check someone else in", async () => {
      const res = await request(app)
        .patch(
          `/api/events/${eventId}/participants/${guestParticipantId}/check-in`,
        )
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ checked_in: false });

      expect(res.statusCode).toEqual(403);
      expect(res.body.message).toMatch(
        /Only Organisers or the participant themselves/i,
      );
    });

    it("should return 400 if checked_in is not a boolean", async () => {
      const res = await request(app)
        .patch(
          `/api/events/${eventId}/participants/${guestParticipantId}/check-in`,
        )
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ checked_in: "yes" });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/boolean 'checked_in'/i);
    });

    it("should return 404 if the participant does not exist in this event", async () => {
      const res = await request(app)
        .patch(`/api/events/${eventId}/participants/99999/check-in`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ checked_in: true });

      expect(res.statusCode).toEqual(404);
      expect(res.body.message).toMatch(/Participant not found/i);
    });

    it("should allow an Organiser/Owner to undo a check-in", async () => {
      const res = await request(app)
        .patch(
          `/api/events/${eventId}/participants/${guestParticipantId}/check-in`,
        )
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ checked_in: false });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.checked_in).toBe(false);
    });
  });

  describe("PATCH /api/events/:eventId/check-ins (bulk)", () => {
    it("should return 403 if a random user attempts a bulk check-in", async () => {
      const res = await request(app)
        .patch(`/api/events/${eventId}/check-ins`)
        .set("Authorization", `Bearer ${randomToken}`)
        .send({ status: true, participant_ids: speakerIds });

      expect(res.statusCode).toEqual(403);
    });

    it("should return 400 if status is missing", async () => {
      const res = await request(app)
        .patch(`/api/events/${eventId}/check-ins`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ participant_ids: speakerIds });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/boolean 'status'/i);
    });

    it("should return 400 if participant_ids is missing or empty", async () => {
      const res = await request(app)
        .patch(`/api/events/${eventId}/check-ins`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ status: true, participant_ids: [] });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/at least one participant_id/i);
    });

    it("should allow an Organiser/Owner to bulk update check-in status", async () => {
      const res = await request(app)
        .patch(`/api/events/${eventId}/check-ins`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ status: false, participant_ids: speakerIds });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/successfully set to false/i);

      const stillCheckedIn = await EventParticipant.count({
        where: { event_id: eventId, checked_in: true },
      });
      expect(stillCheckedIn).toBe(0);
    });
  });

  describe("GET /api/events/:eventId/teams/auto-generate (attendance-aware)", () => {
    it("should include all active speakers when nobody has checked in (fallback)", async () => {
      const res = await request(app)
        .get(
          `/api/events/${eventId}/teams/auto-generate?format_id=${formatId}`,
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.total_free_speakers).toBe(speakerIds.length);
    });

    it("should only draft checked-in speakers once check-in is in use", async () => {
      const checkedInIds = speakerIds.slice(0, 2);
      await request(app)
        .patch(`/api/events/${eventId}/check-ins`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ status: true, participant_ids: checkedInIds });

      const res = await request(app)
        .get(
          `/api/events/${eventId}/teams/auto-generate?format_id=${formatId}`,
        )
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.total_free_speakers).toBe(2);

      const proposedIds = res.body.data.proposed_teams.flatMap(
        (t) => t.participant_ids,
      );
      expect(proposedIds.sort()).toEqual(checkedInIds.sort());
    });
  });
});
