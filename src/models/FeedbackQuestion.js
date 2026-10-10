const { DataTypes } = require("sequelize");

// one question of an event's feedback form
module.exports = (sequelize) => {
  const FeedbackQuestion = sequelize.define(
    "FeedbackQuestion",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: { type: DataTypes.INTEGER, allowNull: false },
      key: { type: DataTypes.STRING(50), allowNull: false },
      label: { type: DataTypes.STRING(255), allowNull: false },
      // integer | text | boolean | choice
      type: { type: DataTypes.STRING(10), allowNull: false },
      min_value: { type: DataTypes.SMALLINT, allowNull: true },
      max_value: { type: DataTypes.SMALLINT, allowNull: true },
      choices: { type: DataTypes.JSONB, allowNull: true },
      required: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // integer answers that average into the feedback's score
      counts_in_score: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      position: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: "feedback_questions",
      paranoid: true,
      deletedAt: "archived_at",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          unique: true,
          fields: ["event_id", "key"],
          name: "unique_feedback_question_key_per_event",
          where: { archived_at: null },
        },
      ],
    },
  );

  FeedbackQuestion.associate = (models) => {
    FeedbackQuestion.belongsTo(models.Event, { foreignKey: "event_id" });
    FeedbackQuestion.hasMany(models.FeedbackAnswer, {
      foreignKey: "question_id",
      onDelete: "CASCADE",
    });
  };

  return FeedbackQuestion;
};
