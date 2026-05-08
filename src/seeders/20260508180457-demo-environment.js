"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const defaultPassword =
      "$2b$10$CCf6shKhpi7qCSxEdZBqAe.7zwOPjjJdoyWP9/Pn6te6lpim5.Vya"; // password
    const now = new Date();

    // seed Users
    await queryInterface.bulkInsert("users", [
      { username: "Admin", password: defaultPassword, created_at: now },
      {
        username: "Owner",
        password: defaultPassword,
        created_at: now,
      },
      { username: "Judge", password: defaultPassword, created_at: now },
      { username: "Opener_OG", password: defaultPassword, created_at: now },
      { username: "Closer_OG", password: defaultPassword, created_at: now },
      { username: "Opener_OO", password: defaultPassword, created_at: now },
      { username: "Closer_OO", password: defaultPassword, created_at: now },
      { username: "Opener_CG", password: defaultPassword, created_at: now },
      { username: "Closer_CG", password: defaultPassword, created_at: now },
      { username: "Opener_CO", password: defaultPassword, created_at: now },
      { username: "Closer_CO", password: defaultPassword, created_at: now },
      { username: "ExtraPlayer_1", password: defaultPassword, created_at: now },
      { username: "ExtraPlayer_2", password: defaultPassword, created_at: now },
    ]);

    // fetch the newly created users to get their IDs
    const users = await queryInterface.sequelize.query(
      `SELECT id, username FROM users;`,
    );
    const userRows = users[0];

    // helper to find ID by username
    const getId = (name) => userRows.find((u) => u.username === name).id;

    // seed Admin
    await queryInterface.bulkInsert("admins", [
      { user_id: getId("Admin"), granted_at: now },
    ]);

    // seed a Holding (personal Tournament in this case)
    await queryInterface.bulkInsert("holdings", [
      {
        name: "KPI CUP 2026",
        type: "personal",
        status: "active",
        online: false,
        created_at: now,
      },
    ]);

    // fetch the holding to get its ID
    const holdings = await queryInterface.sequelize.query(
      `SELECT id FROM holdings;`,
    );
    const holdingId = holdings[0][0].id;

    // assign the Owner to the Holding
    await queryInterface.bulkInsert("owners", [
      {
        user_id: getId("Owner"),
        holding_id: holdingId,
        granted_at: now,
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("owners", null, {});
    await queryInterface.bulkDelete("holdings", null, {});
    await queryInterface.bulkDelete("admins", null, {});
    await queryInterface.bulkDelete("users", null, {});
  },
};
