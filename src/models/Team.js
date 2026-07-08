const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Team = sequelize.define(
    "Team",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      is_temporary: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_eliminated: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { tableName: "teams", timestamps: false },
  );

  Team.associate = (models) => {
    Team.belongsTo(models.Event, { foreignKey: "event_id" });
    Team.hasMany(models.TeamMember, {
      foreignKey: "team_id",
      onDelete: "CASCADE",
    });

    // a single team can now appear in multiple room_teams
    Team.hasMany(models.RoomTeam, {
      foreignKey: "team_id",
      onDelete: "CASCADE",
    });
  };

  return Team;
};
