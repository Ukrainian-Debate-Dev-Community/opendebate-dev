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
    {
      tableName: "teams",
      paranoid: true,
      deletedAt: "archived_at",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        {
          unique: true,
          fields: ["event_id", "name"],
          name: "unique_team_name_per_event",
          where: { archived_at: null },
        },
      ],
    },
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

    Team.hasMany(models.Conflict, {
      foreignKey: "target_team_id",
      onDelete: "CASCADE",
    });
  };

  return Team;
};
