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
  Room,
  Motion,
  EventParticipant,
  RoomAdjudicator,
} = require("../src/models");
const jwt = require("jsonwebtoken");

const sign = (id) =>
  jwt.sign({ id, isAdmin: false }, process.env.JWT_SECRET || "testsecret", {
    expiresIn: "1h",
  });

describe("Per-room motions (judge sets the motion of their room)", () => {
  let ownerToken;
  let chairToken;
  let randomToken;

  let eventId;
  let roundId;
  let chairedRoomId;
  let otherRoomId;
  let completedRoomId;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const orgOwner = await User.create({
      username: "motion_owner",
      password: "hashedpassword123",
    });
    ownerToken = sign(orgOwner.id);

    const chairUser = await User.create({
      username: "motion_chair",
      password: "hashedpassword123",
    });
    chairToken = sign(chairUser.id);

    const randomUser = await User.create({
      username: "motion_random",
      password: "hashedpassword123",
    });
    randomToken = sign(randomUser.id);

    const org = await Organisation.create({ name: "Motion Org" });
    await Owner.create({ user_id: orgOwner.id, organisation_id: org.id });

    const event = await Event.create({
      organisation_id: org.id,
      name: "Motion Event",
    });
    eventId = event.id;

    const round = await Round.create({
      event_id: event.id,
      name: "Club round",
      sequence: 1,
    });
    roundId = round.id;

    const format = await Format.create({
      name: "Duo",
      code: "DUO",
      teams_per_room: 2,
      speakers_per_team: 1,
      score_min: 50,
      score_max: 100,
    });

    const chairParticipant = await EventParticipant.create({
      event_id: event.id,
      user_id: chairUser.id,
      display_name: "Chair Judge",
      role: "adjudicator",
    });

    const chairedRoom = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "pending",
    });
    chairedRoomId = chairedRoom.id;
    await RoomAdjudicator.create({
      room_id: chairedRoom.id,
      participant_id: chairParticipant.id,
      role: "chair",
    });

    const otherRoom = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "judging",
    });
    otherRoomId = otherRoom.id;

    const completedRoom = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "completed",
    });
    completedRoomId = completedRoom.id;
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it("lets the room's chair set the motion (created released, attached to the room)", async () => {
    const res = await request(app)
      .post(`/api/rooms/${chairedRoomId}/motion`)
      .set("Authorization", `Bearer ${chairToken}`)
      .send({ motion_text: "THW let judges set motions" });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.motion.motion_text).toBe(
      "THW let judges set motions",
    );
    expect(res.body.data.motion.is_released).toBe(true);
    expect(res.body.data.motion.event_id).toBe(eventId);

    const room = await Room.findByPk(chairedRoomId);
    expect(room.motion_id).toBe(res.body.data.motion.id);
  });

  it("falls through to the event owner for rooms without their own chair claim", async () => {
    const res = await request(app)
      .post(`/api/rooms/${otherRoomId}/motion`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ motion_text: "THW let hosts fix motions", infoslide: "note" });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.motion.infoslide).toBe("note");

    const room = await Room.findByPk(otherRoomId);
    expect(room.motion_id).toBe(res.body.data.motion.id);
  });

  it("allows two rooms of the same round to carry different motions", async () => {
    const rooms = await Room.findAll({ where: { round_id: roundId } });
    const withMotions = rooms.filter((r) => r.motion_id !== null);
    const distinct = new Set(withMotions.map((r) => r.motion_id));
    expect(distinct.size).toBe(2);
  });

  it("rejects a user who is neither chair nor owner/organiser", async () => {
    const res = await request(app)
      .post(`/api/rooms/${chairedRoomId}/motion`)
      .set("Authorization", `Bearer ${randomToken}`)
      .send({ motion_text: "THW sneak motions in" });

    expect(res.statusCode).toBe(403);
  });

  it("rejects setting a motion on a completed room", async () => {
    const res = await request(app)
      .post(`/api/rooms/${completedRoomId}/motion`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ motion_text: "THW rewrite history" });

    expect(res.statusCode).toBe(409);
  });

  it("requires motion_text", async () => {
    const res = await request(app)
      .post(`/api/rooms/${chairedRoomId}/motion`)
      .set("Authorization", `Bearer ${chairToken}`)
      .send({});

    expect(res.statusCode).toBe(400);
  });

  it("returns each room's motion in the round rooms listing", async () => {
    const res = await request(app)
      .get(`/api/rounds/${roundId}/rooms`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.statusCode).toBe(200);
    const withMotion = res.body.data.find((r) => r.id === chairedRoomId);
    expect(withMotion.Motion.motion_text).toBe(
      "THW let judges set motions",
    );
  });
});
