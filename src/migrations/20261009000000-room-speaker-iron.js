"use strict";

// an iron-person speaks twice in one room; the speech flagged here
// counts for the team but stays out of the speaker standings
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("room_speakers", "is_iron", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("room_speakers", "is_iron");
  },
};
