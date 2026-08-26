const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Conflict = sequelize.define(
    "Conflict",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: { type: DataTypes.INTEGER, allowNull: false },
      issuer_participant_id: { type: DataTypes.INTEGER, allowNull: false },
      target_participant_id: { type: DataTypes.INTEGER, allowNull: true },
      target_team_id: { type: DataTypes.INTEGER, allowNull: true },
      comment: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: "conflicts", timestamps: false },
  );

  Conflict.associate = (models) => {
    Conflict.belongsTo(models.Event, { foreignKey: "event_id" });
    Conflict.belongsTo(models.EventParticipant, {
      as: "Issuer",
      foreignKey: "issuer_participant_id",
    });
    Conflict.belongsTo(models.EventParticipant, {
      as: "TargetParticipant",
      foreignKey: "target_participant_id",
    });
    Conflict.belongsTo(models.Team, {
      as: "TargetTeam",
      foreignKey: "target_team_id",
    });
  };

  return Conflict;
};
