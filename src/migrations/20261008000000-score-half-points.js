"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // BP speaker scores move in 0.5 steps — SMALLINT silently forbade them
    await queryInterface.changeColumn("scores", "value", {
      type: Sequelize.DECIMAL(4, 1),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("scores", "value", {
      type: Sequelize.SMALLINT,
      allowNull: false,
    });
  },
};
