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
  EventParticipant,
  RoomAdjudicator,
} = require("../src/models");
const jwt = require("jsonwebtoken");

const sign = (id) =>
  jwt.sign({ id, isAdmin: false }, process.env.JWT_SECRET || "testsecret", {
    expiresIn: "1h",
  });

// The room's prep end lives with the room: set with the motion, moved or
// cleared on its own while the room is open, and read back with the rooms.
describe("Room prep end time", () => {
  let ownerToken;
  let chairToken;
  let randomToken;
  let roundId;
  let roomId;
  let completedRoomId;

  const prepOf = async (id) => (await Room.findByPk(id)).prep_ends_at;

  beforeAll(async () => {
    await sequelize.sync({ force: true });

    const owner = await User.create({
      username: "prep_owner",
      password: "hashedpassword123",
    });
    const chair = await User.create({
      username: "prep_chair",
      password: "hashedpassword123",
    });
    const random = await User.create({
      username: "prep_random",
      password: "hashedpassword123",
    });
    ownerToken = sign(owner.id);
    chairToken = sign(chair.id);
    randomToken = sign(random.id);

    const org = await Organisation.create({ name: "Prep Org" });
    await Owner.create({ user_id: owner.id, organisation_id: org.id });
    const event = await Event.create({
      organisation_id: org.id,
      name: "Prep Event",
    });
    const round = await Round.create({
      event_id: event.id,
      name: "Club round",
      sequence: 1,
    });
    roundId = round.id;
    const format = await Format.create({
      name: "Duo",
      code: "DUOP",
      teams_per_room: 2,
      speakers_per_team: 1,
      score_min: 50,
      score_max: 100,
    });

    const chairParticipant = await EventParticipant.create({
      event_id: event.id,
      user_id: chair.id,
      display_name: "Chair",
      role: "adjudicator",
    });
    const room = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "pending",
    });
    roomId = room.id;
    await RoomAdjudicator.create({
      room_id: room.id,
      participant_id: chairParticipant.id,
      role: "chair",
    });

    const completed = await Room.create({
      round_id: round.id,
      format_id: format.id,
      status: "completed",
    });
    completedRoomId = completed.id;
    await RoomAdjudicator.create({
      room_id: completed.id,
      participant_id: chairParticipant.id,
      role: "chair",
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  const motion = (body) =>
    request(app)
      .post(`/api/rooms/${roomId}/motion`)
      .set("Authorization", `Bearer ${chairToken}`)
      .send({ motion_text: "THW keep the clock", ...body });

  const patchPrep = (id, token, body) =>
    request(app)
      .patch(`/api/rooms/${id}/prep`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  it("stores the prep end sent with the motion", async () => {
    const res = await motion({ prep_ends_at: "2026-10-11T18:15:00Z" });
    expect(res.statusCode).toBe(201);
    expect(new Date(res.body.data.prep_ends_at).toISOString()).toBe(
      "2026-10-11T18:15:00.000Z",
    );
    expect((await prepOf(roomId)).toISOString()).toBe(
      "2026-10-11T18:15:00.000Z",
    );
  });

  it("leaves the prep end as it is when the motion comes without one", async () => {
    const res = await motion({});
    expect(res.statusCode).toBe(201);
    expect((await prepOf(roomId)).toISOString()).toBe(
      "2026-10-11T18:15:00.000Z",
    );
  });

  it("clears the prep end with null", async () => {
    const res = await motion({ prep_ends_at: null });
    expect(res.statusCode).toBe(201);
    expect(await prepOf(roomId)).toBeNull();
  });

  it("refuses a prep end that is not a timestamp", async () => {
    expect((await motion({ prep_ends_at: "soon" })).statusCode).toBe(400);
    expect(
      (await patchPrep(roomId, chairToken, { prep_ends_at: 42 })).statusCode,
    ).toBe(400);
    expect((await patchPrep(roomId, chairToken, {})).statusCode).toBe(400);
  });

  it("lets the chair, or the owner, move and clear the prep end", async () => {
    let res = await patchPrep(roomId, chairToken, {
      prep_ends_at: "2026-10-11T18:30:00Z",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.room_id).toBe(roomId);
    expect((await prepOf(roomId)).toISOString()).toBe(
      "2026-10-11T18:30:00.000Z",
    );

    res = await patchPrep(roomId, ownerToken, { prep_ends_at: null });
    expect(res.statusCode).toBe(200);
    expect(await prepOf(roomId)).toBeNull();
  });

  it("refuses someone who is neither the chair nor an organiser", async () => {
    const res = await patchPrep(roomId, randomToken, {
      prep_ends_at: "2026-10-11T18:30:00Z",
    });
    expect(res.statusCode).toBe(403);
  });

  it("refuses once the room's ballot is in", async () => {
    const res = await patchPrep(completedRoomId, chairToken, {
      prep_ends_at: "2026-10-11T18:30:00Z",
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns the prep end with the round's rooms", async () => {
    await patchPrep(roomId, chairToken, {
      prep_ends_at: "2026-10-11T19:00:00Z",
    });
    const res = await request(app)
      .get(`/api/rounds/${roundId}/rooms`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.statusCode).toBe(200);
    const room = res.body.data.find((r) => r.id === roomId);
    expect(new Date(room.prep_ends_at).toISOString()).toBe(
      "2026-10-11T19:00:00.000Z",
    );
    const completed = res.body.data.find((r) => r.id === completedRoomId);
    expect(completed.prep_ends_at).toBeNull();
  });
});
