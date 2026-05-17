const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Team = sequelize.define(
    "Team",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      round_id: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
    },
    { tableName: "teams" },
  );

  Team.associate = (models) => {
    Team.belongsTo(models.Round, { foreignKey: "round_id" });
    Team.hasMany(models.TeamMember, {
      foreignKey: "team_id",
      onDelete: "CASCADE",
    });
    Team.hasOne(models.RoomTeam, {
      foreignKey: "team_id",
      onDelete: "CASCADE",
    });
  };

  return Team;
};
