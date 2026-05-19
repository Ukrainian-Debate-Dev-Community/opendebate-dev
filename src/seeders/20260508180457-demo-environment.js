"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const defaultPassword =
      "$2b$10$CCf6shKhpi7qCSxEdZBqAe.7zwOPjjJdoyWP9/Pn6te6lpim5.Vya"; // password
    const now = new Date();

    // two Formats default BP and 1v1
    await queryInterface.bulkInsert("formats", [
      {
        name: "British Parliamentary",
        code: "BP",
        teams_per_room: 4,
        speakers_per_team: 2,
        has_reply: false,
        score_min: 50,
        score_max: 90,
      },
      {
        name: "Lincoln-Douglas",
        code: "LD",
        teams_per_room: 2,
        speakers_per_team: 1,
        has_reply: false,
        score_min: 0,
        score_max: 30,
      },
    ]);

    // get bp id
    const [formats] = await queryInterface.sequelize.query(
      `SELECT id, code FROM formats;`,
    );
    const bpFormatId = formats.find((f) => f.code === "BP").id;

    // seed Users
    await queryInterface.bulkInsert("users", [
      { username: "Admin", password: defaultPassword, created_at: now },
      { username: "OrgOwner", password: defaultPassword, created_at: now },
      { username: "DebaterOne", password: defaultPassword, created_at: now },
      { username: "Chair", password: defaultPassword, created_at: now },
    ]);

    const [users] = await queryInterface.sequelize.query(
      `SELECT id, username FROM users;`,
    );

    // helper to find ID by username
    const getId = (name) => users.find((u) => u.username === name).id;

    // seed Admin
    await queryInterface.bulkInsert("admins", [
      { user_id: getId("Admin"), granted_at: now },
    ]);

    await queryInterface.bulkInsert("organisations", [
      {
        name: "KPI Debate Club",
        type: "academical",
        status: "active",
        online: false,
        created_at: now,
      },
    ]);

    const [orgs] = await queryInterface.sequelize.query(
      `SELECT id FROM organisations LIMIT 1;`,
    );
    const orgId = orgs[0].id;

    // assign the Owner
    await queryInterface.bulkInsert("owners", [
      { user_id: getId("OrgOwner"), organisation_id: orgId, granted_at: now },
    ]);

    // seed an Event
    await queryInterface.bulkInsert("events", [
      {
        organisation_id: orgId,
        name: "KPI CUP 2026",
        status: "scheduled",
        is_ranked: true,
      },
    ]);

    const [events] = await queryInterface.sequelize.query(
      `SELECT id FROM events LIMIT 1;`,
    );
    const eventId = events[0].id;

    await queryInterface.bulkInsert("organizers", [
      { user_id: getId("OrgOwner"), event_id: eventId, granted_at: now },
    ]);

    // seed Event Participants
    const participants = [
      {
        event_id: eventId,
        user_id: getId("DebaterOne"),
        display_name: "DebaterOne (Registered)",
        role: "speaker",
      },
      {
        event_id: eventId,
        user_id: null,
        display_name: "Guest Speaker 2",
        role: "speaker",
      },
      {
        event_id: eventId,
        user_id: null,
        display_name: "Guest Speaker 3",
        role: "speaker",
      },
      {
        event_id: eventId,
        user_id: null,
        display_name: "Guest Speaker 4",
        role: "speaker",
      },
      {
        event_id: eventId,
        user_id: null,
        display_name: "Guest Speaker 5",
        role: "speaker",
      },
      {
        event_id: eventId,
        user_id: null,
        display_name: "Guest Speaker 6",
        role: "speaker",
      },
      {
        event_id: eventId,
        user_id: null,
        display_name: "Guest Speaker 7",
        role: "speaker",
      },
      {
        event_id: eventId,
        user_id: null,
        display_name: "Guest Speaker 8",
        role: "speaker",
      },
      {
        event_id: eventId,
        user_id: getId("Chair"),
        display_name: "Chair (Registered)",
        role: "adjudicator",
      },
    ];
    await queryInterface.bulkInsert("event_participants", participants);

    // participants
    const [parts] = await queryInterface.sequelize.query(
      `SELECT id, display_name FROM event_participants;`,
    );

    // seed Round & Motion
    await queryInterface.bulkInsert("rounds", [
      {
        event_id: eventId,
        name: "Round 1",
        sequence: 1,
        status: "scheduled",
      },
    ]);
    const [rounds] = await queryInterface.sequelize.query(
      `SELECT id FROM rounds LIMIT 1;`,
    );
    const roundId = rounds[0].id;

    await queryInterface.bulkInsert("motions", [
      {
        event_id: eventId,
        motion_text: "TH will allow something.",
        is_released: true,
      },
    ]);
    const [motions] = await queryInterface.sequelize.query(
      `SELECT id FROM motions LIMIT 1;`,
    );
    const motionId = motions[0].id;

    // seed Teams
    await queryInterface.bulkInsert("teams", [
      { round_id: roundId, name: "OG Team" },
      { round_id: roundId, name: "OO Team" },
      { round_id: roundId, name: "CG Team" },
      { round_id: roundId, name: "CO Team" },
    ]);
    const [teamsRes] = await queryInterface.sequelize.query(
      `SELECT id, name FROM teams ORDER BY id ASC;`,
    );

    // seed Room
    await queryInterface.bulkInsert("rooms", [
      {
        round_id: roundId,
        format_id: bpFormatId,
        motion_id: motionId,
        status: "pending",
      },
    ]);
    const [rooms] = await queryInterface.sequelize.query(
      `SELECT id FROM rooms LIMIT 1;`,
    );
    const roomId = rooms[0].id;

    let pIdx = 0; // participant index
    // for each of the 4 teams in BP
    for (let i = 0; i < 4; i++) {
      const teamId = teamsRes[i].id;

      // Room Team Mapping
      await queryInterface.bulkInsert("room_teams", [
        { room_id: roomId, team_id: teamId, position: i + 1 },
      ]);
      const [rt] = await queryInterface.sequelize.query(
        `SELECT id FROM room_teams WHERE team_id = ${teamId};`,
      );

      // 2 Speakers per team
      for (let j = 1; j <= 2; j++) {
        const participantId = parts[pIdx].id;
        await queryInterface.bulkInsert("team_members", [
          { team_id: teamId, participant_id: participantId, speaker_order: j },
        ]);
        await queryInterface.bulkInsert("room_speakers", [
          {
            room_team_id: rt[0].id,
            participant_id: participantId,
            speech_position: j,
          },
        ]);
        pIdx++;
      }
    }

    // Chair Assigment
    const chairId = parts.find((p) => p.display_name.includes("Chair")).id;
    await queryInterface.bulkInsert("room_adjudicators", [
      { room_id: roomId, participant_id: chairId, role: "chair" },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("formats", null, {});
    await queryInterface.bulkDelete("users", null, {});
  },
};
