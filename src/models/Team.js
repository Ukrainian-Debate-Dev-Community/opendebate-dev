const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Team = sequelize.define(
    "Team",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: { type: DataTypes.INTEGER, allowNull: true },
      round_id: { type: DataTypes.INTEGER, allowNull: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
    },
    {
      tableName: "teams",
      validate: {
        scopeCheck() {
          if (!this.event_id && !this.round_id) {
            throw new Error(
              "A team must be scoped to either an event or a round.",
            );
          }
        },
      },
    },
  );

  Team.associate = (models) => {
    Team.belongsTo(models.Event, { foreignKey: "event_id" });
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
