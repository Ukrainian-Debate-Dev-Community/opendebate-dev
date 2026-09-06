"use strict";

const ARCHIVABLE_TABLES = [
  "organisations",
  "events",
  "rounds",
  "rooms",
  "teams",
  "event_participants",
  "motions",
  "feedbacks",
  "conflicts",
  "formats",
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const table of ARCHIVABLE_TABLES) {
        await queryInterface.addColumn(
          table,
          "archived_at",
          { type: Sequelize.DATE, allowNull: true },
          { transaction },
        );
      }

      // carry over the old soft-delete flags, then retire them
      await queryInterface.sequelize.query(
        `UPDATE organisations SET archived_at = NOW() WHERE is_deleted = true`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE events SET archived_at = NOW() WHERE is_deleted = true`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE motions SET archived_at = NOW() WHERE is_deleted = true`,
        { transaction },
      );
      await queryInterface.removeColumn("organisations", "is_deleted", {
        transaction,
      });
      await queryInterface.removeColumn("events", "is_deleted", {
        transaction,
      });
      await queryInterface.removeColumn("motions", "is_deleted", {
        transaction,
      });

      // archived rows must not block reuse of a round sequence or team name
      await queryInterface.removeConstraint(
        "rounds",
        "unique_sequence_per_event",
        { transaction },
      );
      await queryInterface.addIndex("rounds", ["event_id", "sequence"], {
        unique: true,
        name: "unique_sequence_per_event",
        where: { archived_at: null },
        transaction,
      });
      await queryInterface.removeConstraint(
        "teams",
        "unique_team_name_per_event",
        { transaction },
      );
      await queryInterface.addIndex("teams", ["event_id", "name"], {
        unique: true,
        name: "unique_team_name_per_event",
        where: { archived_at: null },
        transaction,
      });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex("teams", "unique_team_name_per_event", {
        transaction,
      });
      await queryInterface.addConstraint("teams", {
        fields: ["event_id", "name"],
        type: "unique",
        name: "unique_team_name_per_event",
        transaction,
      });
      await queryInterface.removeIndex("rounds", "unique_sequence_per_event", {
        transaction,
      });
      await queryInterface.addConstraint("rounds", {
        fields: ["event_id", "sequence"],
        type: "unique",
        name: "unique_sequence_per_event",
        transaction,
      });

      for (const table of ["organisations", "events", "motions"]) {
        await queryInterface.addColumn(
          table,
          "is_deleted",
          { type: Sequelize.BOOLEAN, defaultValue: false },
          { transaction },
        );
        await queryInterface.sequelize.query(
          `UPDATE ${table} SET is_deleted = true WHERE archived_at IS NOT NULL`,
          { transaction },
        );
      }

      for (const table of ARCHIVABLE_TABLES) {
        await queryInterface.removeColumn(table, "archived_at", {
          transaction,
        });
      }
    });
  },
};
