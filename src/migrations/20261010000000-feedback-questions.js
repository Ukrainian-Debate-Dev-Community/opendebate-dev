"use strict";

// An event defines the questions its feedback form asks; a feedback
// carries one answer per question. With questions that count in the
// score, the feedback's score is computed from the answers, so the
// stored score may be empty.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("feedback_questions", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "events", key: "id" },
        onDelete: "CASCADE",
      },
      key: { type: Sequelize.STRING(50), allowNull: false },
      label: { type: Sequelize.STRING(255), allowNull: false },
      type: { type: Sequelize.STRING(10), allowNull: false },
      min_value: { type: Sequelize.SMALLINT, allowNull: true },
      max_value: { type: Sequelize.SMALLINT, allowNull: true },
      choices: { type: Sequelize.JSONB, allowNull: true },
      required: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      counts_in_score: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      position: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      archived_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addIndex("feedback_questions", ["event_id", "key"], {
      unique: true,
      name: "unique_feedback_question_key_per_event",
      where: { archived_at: null },
    });

    await queryInterface.createTable("feedback_answers", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      feedback_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "feedbacks", key: "id" },
        onDelete: "CASCADE",
      },
      question_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "feedback_questions", key: "id" },
        onDelete: "CASCADE",
      },
      integer_value: { type: Sequelize.SMALLINT, allowNull: true },
      text_value: { type: Sequelize.TEXT, allowNull: true },
      boolean_value: { type: Sequelize.BOOLEAN, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex(
      "feedback_answers",
      ["feedback_id", "question_id"],
      {
        unique: true,
        name: "unique_feedback_answer_per_question",
      },
    );

    await queryInterface.changeColumn("feedbacks", "score", {
      type: Sequelize.SMALLINT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("feedback_answers");
    await queryInterface.dropTable("feedback_questions");
    await queryInterface.sequelize.query(
      "DELETE FROM feedbacks WHERE score IS NULL",
    );
    await queryInterface.changeColumn("feedbacks", "score", {
      type: Sequelize.SMALLINT,
      allowNull: false,
    });
  },
};
