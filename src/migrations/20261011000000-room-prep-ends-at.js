"use strict";

// when the room's prep ends (the debate starts): set with the motion
// or moved on its own while the room is open
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("rooms", "prep_ends_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("rooms", "prep_ends_at");
  },
};
