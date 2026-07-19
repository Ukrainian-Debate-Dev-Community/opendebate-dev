"use strict";
const bcrypt = require("bcryptjs");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const passwordHash = bcrypt.hashSync("password123", 10);

    await queryInterface.bulkInsert(
      "users",
      [
        {
          username: "test",
          password: passwordHash,
          created_at: new Date(),
        },
        {
          username: "admin",
          password: passwordHash,
          created_at: new Date(),
        },
        {
          username: "owner",
          password: passwordHash,
          created_at: new Date(),
        },
      ],
      {},
    );

    const users = await queryInterface.sequelize.query(
      `SELECT id, username FROM users WHERE username IN ('test', 'admin', 'owner');`,
      { type: Sequelize.QueryTypes.SELECT },
    );

    const adminId = users.find((u) => u.username === "admin").id;
    const ownerId = users.find((u) => u.username === "owner").id;

    await queryInterface.bulkInsert(
      "admins",
      [{ user_id: adminId, granted_at: new Date() }],
      {},
    );

    await queryInterface.bulkInsert(
      "organisations",
      [
        {
          name: "Debate Society",
          type: "academic",
          status: "active",
          created_at: new Date(),
        },
      ],
      {},
    );

    const orgs = await queryInterface.sequelize.query(
      `SELECT id FROM organisations WHERE name = 'Debate Society';`,
      { type: Sequelize.QueryTypes.SELECT },
    );
    const orgId = orgs[0].id;

    await queryInterface.bulkInsert(
      "owners",
      [{ user_id: ownerId, organisation_id: orgId, granted_at: new Date() }],
      {},
    );

    await queryInterface.bulkInsert(
      "formats",
      [
        {
          name: "British Parliamentary",
          code: "BP",
          teams_per_room: 4,
          speakers_per_team: 2,
          has_reply: false,
          score_min: 50,
          score_max: 100,
        },
      ],
      {},
    );

    await queryInterface.bulkInsert(
      "events",
      [
        {
          organisation_id: orgId,
          name: "Test BP Meeting",
          status: "scheduled",
        },
      ],
      {},
    );

    const events = await queryInterface.sequelize.query(
      `SELECT id FROM events WHERE name = 'Test BP Meeting' AND organisation_id = ${orgId};`,
      { type: Sequelize.QueryTypes.SELECT },
    );
    const eventId = events[0].id;

    const participants = Array.from({ length: 8 }).map((_, i) => ({
      event_id: eventId,
      display_name: `Speaker ${i + 1}`,
      role: "speaker",
      is_eliminated: false,
    }));

    await queryInterface.bulkInsert("event_participants", participants, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete(
      "event_participants",
      { display_name: { [Sequelize.Op.like]: "Speaker %" } },
      {},
    );
    await queryInterface.bulkDelete("events", { name: "Test BP Meeting" }, {});
    await queryInterface.bulkDelete("formats", { code: "BP" }, {});

    const users = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE username IN ('test', 'admin', 'owner');`,
      { type: Sequelize.QueryTypes.SELECT },
    );

    if (users.length > 0) {
      const userIds = users.map((u) => u.id);
      await queryInterface.bulkDelete(
        "admins",
        { user_id: { [Sequelize.Op.in]: userIds } },
        {},
      );
      await queryInterface.bulkDelete(
        "owners",
        { user_id: { [Sequelize.Op.in]: userIds } },
        {},
      );
      await queryInterface.bulkDelete(
        "users",
        { id: { [Sequelize.Op.in]: userIds } },
        {},
      );
    }

    await queryInterface.bulkDelete(
      "organisations",
      { name: "Debate Society" },
      {},
    );
  },
};
