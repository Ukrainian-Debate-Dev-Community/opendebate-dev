const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const TeamMember = sequelize.define(
    "TeamMember",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      team_id: { type: DataTypes.INTEGER, allowNull: false },
      participant_id: { type: DataTypes.INTEGER, allowNull: false },
      speaker_order: { type: DataTypes.SMALLINT, allowNull: false },
    },
    { tableName: "team_members" },
  );

  TeamMember.associate = (models) => {
    TeamMember.belongsTo(models.Team, { foreignKey: "team_id" });
    TeamMember.belongsTo(models.EventParticipant, {
      foreignKey: "participant_id",
    });
  };

  return TeamMember;
};
