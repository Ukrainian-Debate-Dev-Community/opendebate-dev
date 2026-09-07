const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Feedback = sequelize.define(
    "Feedback",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      room_id: { type: DataTypes.INTEGER, allowNull: false },
      adjudicator_id: { type: DataTypes.INTEGER, allowNull: false },
      issuer_participant_id: { type: DataTypes.INTEGER, allowNull: true },
      issuer_team_id: { type: DataTypes.INTEGER, allowNull: true },
      score: { type: DataTypes.SMALLINT, allowNull: false },
      comment: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "feedbacks",
      paranoid: true,
      deletedAt: "archived_at",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      validate: {
        exclusiveIssuer() {
          if (
            (this.issuer_participant_id === null &&
              this.issuer_team_id === null) ||
            (this.issuer_participant_id !== null &&
              this.issuer_team_id !== null)
          ) {
            throw new Error(
              "Feedback must be issued by exactly one entity: either an individual participant or a team.",
            );
          }
        },
      },
    },
  );

  Feedback.associate = (models) => {
    Feedback.belongsTo(models.Room, { foreignKey: "room_id" });
    Feedback.belongsTo(models.EventParticipant, {
      as: "Adjudicator",
      foreignKey: "adjudicator_id",
    });
    Feedback.belongsTo(models.EventParticipant, {
      as: "IssuerParticipant",
      foreignKey: "issuer_participant_id",
    });
    Feedback.belongsTo(models.Team, {
      as: "IssuerTeam",
      foreignKey: "issuer_team_id",
    });
  };

  return Feedback;
};
