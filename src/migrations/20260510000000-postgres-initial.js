"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Users
    await queryInterface.createTable("users", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      password: { type: Sequelize.STRING(255), allowNull: false },
      is_deleted: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // I won't forget to add index for active users
    await queryInterface.addIndex("users", ["id", "username"], {
      name: "idx_active_users",
      where: { is_deleted: false },
    });

    // 2. Admins
    await queryInterface.createTable("admins", {
      user_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      granted_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 3. Holdings
    await queryInterface.createTable("holdings", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(120), allowNull: false },
      type: { type: Sequelize.STRING(20), defaultValue: "academic" },
      status: { type: Sequelize.STRING(20), defaultValue: "active" },
      online: { type: Sequelize.BOOLEAN, defaultValue: false },
      link: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 4. Owners
    await queryInterface.createTable("owners", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      holding_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "holdings", key: "id" },
        onDelete: "CASCADE",
      },
      granted_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // 5. Sessions
    await queryInterface.createTable("sessions", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      holding_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "holdings", key: "id" },
        onDelete: "NO ACTION",
      },
      name: { type: Sequelize.STRING(120), allowNull: true },
      date: { type: Sequelize.DATE, allowNull: false },
      status: { type: Sequelize.STRING(20), defaultValue: "scheduled" },
    });

    // 6. Motions
    await queryInterface.createTable("motions", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "sessions", key: "id" },
        onDelete: "CASCADE",
      },
      motion_text: { type: Sequelize.TEXT, allowNull: false },
      infoslide: { type: Sequelize.TEXT, allowNull: true },
      is_released: { type: Sequelize.BOOLEAN, defaultValue: false },
    });

    // 7. Waitlists
    await queryInterface.createTable("waitlists", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "sessions", key: "id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
    });

    // 8. Teams
    await queryInterface.createTable("teams", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "sessions", key: "id" },
        onDelete: "CASCADE",
      },
      opener: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "NO ACTION",
      },
      closer: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "NO ACTION",
      },
    });

    // 9. Rooms
    await queryInterface.createTable("rooms", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "sessions", key: "id" },
        onDelete: "CASCADE",
      },
      judge: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "NO ACTION",
      },
      status: { type: Sequelize.STRING(20), defaultValue: "scheduled" },
    });

    // 10. RoomTeams
    await queryInterface.createTable("room_teams", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      room_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "rooms", key: "id" },
        onDelete: "CASCADE",
      },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "teams", key: "id" },
        onDelete: "NO ACTION",
      },
      position: { type: Sequelize.STRING(2), allowNull: false },
      rank: { type: Sequelize.SMALLINT, allowNull: true },
    });

    // 11. RoomSpeakers
    await queryInterface.createTable("room_speakers", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      room_team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "room_teams", key: "id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "NO ACTION",
      },
      score: { type: Sequelize.SMALLINT, allowNull: true },
    });
  },

  async down(queryInterface, Sequelize) {
    // drop in strict reverse order
    await queryInterface.dropTable("room_speakers");
    await queryInterface.dropTable("room_teams");
    await queryInterface.dropTable("rooms");
    await queryInterface.dropTable("teams");
    await queryInterface.dropTable("waitlists");
    await queryInterface.dropTable("motions");
    await queryInterface.dropTable("sessions");
    await queryInterface.dropTable("owners");
    await queryInterface.dropTable("holdings");
    await queryInterface.dropTable("admins");
    await queryInterface.dropTable("users");
  },
};
