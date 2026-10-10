const { DataTypes } = require("sequelize");

// a feedback's answer to one question of its event's form; the value
// sits in the column matching the question's type
module.exports = (sequelize) => {
  const FeedbackAnswer = sequelize.define(
    "FeedbackAnswer",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      feedback_id: { type: DataTypes.INTEGER, allowNull: false },
      question_id: { type: DataTypes.INTEGER, allowNull: false },
      integer_value: { type: DataTypes.SMALLINT, allowNull: true },
      text_value: { type: DataTypes.TEXT, allowNull: true },
      boolean_value: { type: DataTypes.BOOLEAN, allowNull: true },
    },
    {
      tableName: "feedback_answers",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          unique: true,
          fields: ["feedback_id", "question_id"],
          name: "unique_feedback_answer_per_question",
        },
      ],
    },
  );

  FeedbackAnswer.associate = (models) => {
    FeedbackAnswer.belongsTo(models.Feedback, { foreignKey: "feedback_id" });
    FeedbackAnswer.belongsTo(models.FeedbackQuestion, {
      foreignKey: "question_id",
    });
  };

  return FeedbackAnswer;
};
