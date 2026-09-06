"use strict";

const ALL_TABLES = [
  "users",
  "admins",
  "organisations",
  "owners",
  "formats",
  "events",
  "organizers",
  "event_participants",
  "rounds",
  "motions",
  "teams",
  "team_members",
  "rooms",
  "room_teams",
  "room_adjudicators",
  "room_speakers",
  "scores",
  "feedbacks",
  "conflicts",
];

// users and organisations already carry created_at from the initial schema
const HAVE_CREATED_AT = ["users", "organisations"];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of ALL_TABLES) {
        if (!HAVE_CREATED_AT.includes(table)) {
          // add the column bare, THEN set the default: adding it with a
          // volatile default would make Postgres stamp every existing row
          // with the migration time — fabricated provenance. Rows predating
          // this migration must honestly stay NULL ("unknown").
          await queryInterface.addColumn(
            table,
            "created_at",
            { type: Sequelize.DATE, allowNull: true },
            { transaction },
          );
          await queryInterface.sequelize.query(
            `ALTER TABLE "${table}" ALTER COLUMN created_at SET DEFAULT NOW()`,
            { transaction },
          );
        }
        await queryInterface.addColumn(
          table,
          "updated_at",
          { type: Sequelize.DATE, allowNull: true },
          { transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of ALL_TABLES) {
        if (!HAVE_CREATED_AT.includes(table)) {
          await queryInterface.removeColumn(table, "created_at", {
            transaction,
          });
        }
        await queryInterface.removeColumn(table, "updated_at", { transaction });
      }
    });
  },
};
