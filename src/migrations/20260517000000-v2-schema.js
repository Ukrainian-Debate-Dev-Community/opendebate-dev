"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // v1 Legacy
    const v1Tables = [
      "room_speakers",
      "room_teams",
      "rooms",
      "teams",
      "waitlists",
      "motions",
      "sessions",
      "owners",
      "holdings",
      "admins",
      "users",
    ];
    for (const table of v1Tables) {
      await queryInterface.dropTable(table, { cascade: true });
    }

    // v2 Core
    // Users
    await queryInterface.createTable("users", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      password: { type: Sequelize.STRING(255), allowNull: false },
      is_deleted: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("users", ["id", "username"], {
      name: "idx_active_users",
      where: { is_deleted: false },
    });

    // Admins
    await queryInterface.createTable("admins", {
      user_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      granted_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // Organisations
    await queryInterface.createTable("organisations", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(120), allowNull: false },
      type: { type: Sequelize.STRING(20), defaultValue: "personal" },
      status: { type: Sequelize.STRING(20), defaultValue: "active" },
      online: { type: Sequelize.BOOLEAN, defaultValue: false },
      link: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      is_deleted: { type: Sequelize.BOOLEAN, defaultValue: false },
    });

    // Owners
    await queryInterface.createTable("owners", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      organisation_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "organisations", key: "id" },
        onDelete: "CASCADE",
      },
      granted_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // Formats
    await queryInterface.createTable("formats", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(64), allowNull: false },
      code: { type: Sequelize.STRING(10), allowNull: false, unique: true },
      teams_per_room: { type: Sequelize.SMALLINT, allowNull: false },
      speakers_per_team: { type: Sequelize.SMALLINT, allowNull: false },
      has_reply: { type: Sequelize.BOOLEAN, defaultValue: false },
      score_min: { type: Sequelize.SMALLINT, allowNull: false },
      score_max: { type: Sequelize.SMALLINT, allowNull: false },
    });

    // Events
    await queryInterface.createTable("events", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      organisation_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "organisations", key: "id" },
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING(120), allowNull: false },
      start_date: { type: Sequelize.DATE, allowNull: true },
      end_date: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.STRING(20), defaultValue: "draft" },
      is_ranked: { type: Sequelize.BOOLEAN, defaultValue: true },
      is_deleted: { type: Sequelize.BOOLEAN, defaultValue: false },
    });

    // Organizers
    await queryInterface.createTable("organizers", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      event_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "events", key: "id" },
        onDelete: "CASCADE",
      },
      granted_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
    });

    // Event Participants
    await queryInterface.createTable("event_participants", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "events", key: "id" },
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onDelete: "SET NULL",
      },
      display_name: { type: Sequelize.STRING(120), allowNull: false },
      role: { type: Sequelize.STRING(20), allowNull: false }, // speaker or adjudicator
      is_waitlist: { type: Sequelize.BOOLEAN, defaultValue: false },
      claim_token_hash: { type: Sequelize.STRING(255), allowNull: true },
      claim_token_used_at: { type: Sequelize.DATE, allowNull: true },
    });

    // Rounds
    await queryInterface.createTable("rounds", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "events", key: "id" },
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING(64), allowNull: false },
      sequence: { type: Sequelize.SMALLINT, allowNull: false },
      status: { type: Sequelize.STRING(20), defaultValue: "draft" },
    });

    // Motions
    await queryInterface.createTable("motions", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "events", key: "id" },
        onDelete: "CASCADE",
      },
      motion_text: { type: Sequelize.TEXT, allowNull: false },
      infoslide: { type: Sequelize.TEXT, allowNull: true },
      is_released: { type: Sequelize.BOOLEAN, defaultValue: false },
    });

    // Teams
    await queryInterface.createTable("teams", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      round_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "rounds", key: "id" },
        onDelete: "CASCADE",
      },
      name: { type: Sequelize.STRING(120), allowNull: false },
    });

    // Team Members
    await queryInterface.createTable("team_members", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "teams", key: "id" },
        onDelete: "CASCADE",
      },
      participant_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "event_participants", key: "id" },
        onDelete: "CASCADE",
      },
      speaker_order: { type: Sequelize.SMALLINT, allowNull: false },
    });

    // Rooms
    await queryInterface.createTable("rooms", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      round_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "rounds", key: "id" },
        onDelete: "CASCADE",
      },
      format_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "formats", key: "id" },
        onDelete: "RESTRICT",
      },
      motion_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "motions", key: "id" },
        onDelete: "SET NULL",
      },
      status: { type: Sequelize.STRING(20), defaultValue: "pending" },
    });

    // Room Teams
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
        onDelete: "CASCADE",
      },
      position: { type: Sequelize.SMALLINT, allowNull: false },
      rank: { type: Sequelize.SMALLINT, allowNull: true },
    });

    await queryInterface.addConstraint("room_teams", {
      fields: ["room_id", "team_id"],
      type: "unique",
      name: "unique_room_team_constraint",
    });

    // Room Adjudicators
    await queryInterface.createTable("room_adjudicators", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      room_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "rooms", key: "id" },
        onDelete: "CASCADE",
      },
      participant_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "event_participants", key: "id" },
        onDelete: "CASCADE",
      },
      role: { type: Sequelize.STRING(20), allowNull: false }, // chair, panelist, trainee
    });

    // Room Speakers
    await queryInterface.createTable("room_speakers", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      room_team_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "room_teams", key: "id" },
        onDelete: "CASCADE",
      },
      participant_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "event_participants", key: "id" },
        onDelete: "CASCADE",
      },
      speech_position: { type: Sequelize.SMALLINT, allowNull: false },
      rank: { type: Sequelize.SMALLINT, allowNull: true },
    });

    // Scores
    await queryInterface.createTable("scores", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      room_speaker_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "room_speakers", key: "id" },
        onDelete: "CASCADE",
      },
      room_adjudicator_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "room_adjudicators", key: "id" },
        onDelete: "CASCADE",
      },
      value: { type: Sequelize.SMALLINT, allowNull: false },
    });
  },

  async down(queryInterface, Sequelize) {
    // drop all tables
    const v2Tables = [
      "scores",
      "room_speakers",
      "room_adjudicators",
      "room_teams",
      "rooms",
      "team_members",
      "teams",
      "motions",
      "rounds",
      "event_participants",
      "organizers",
      "events",
      "formats",
      "owners",
      "organisations",
      "admins",
      "users",
    ];
    for (const table of v2Tables) {
      await queryInterface.dropTable(table, { cascade: true });
    }
  },
};
