const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Team = sequelize.define(
    "Team",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: { type: DataTypes.INTEGER, allowNull: false },
      opener: { type: DataTypes.INTEGER, allowNull: false },
      closer: { type: DataTypes.INTEGER, allowNull: false },
    },
    { tableName: "teams" },
  );

  Team.associate = (models) => {
    Team.belongsTo(models.Session, { foreignKey: "session_id" });
    Team.belongsTo(models.User, { as: "OpenerData", foreignKey: "opener" });
    Team.belongsTo(models.User, { as: "CloserData", foreignKey: "closer" });
    Team.hasMany(models.RoomTeam, {
      foreignKey: "team_id",
      onDelete: "NO ACTION",
    });
  };

  // the application-level cascade hook to clean up room_teams safely
  Team.addHook("beforeDestroy", async (team, options) => {
    await sequelize.models.RoomTeam.destroy({
      where: { team_id: team.id },
      transaction: options.transaction,
    });
  });

  return Team;
};
