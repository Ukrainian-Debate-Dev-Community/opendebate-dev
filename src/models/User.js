const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(64), allowNull: false },
      password: { type: DataTypes.STRING(255), allowNull: false },
      is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "users",
      indexes: [
        { unique: true, fields: ["username"] },
        {
          name: "idx_active_users",
          fields: ["id", "username"],
          where: { is_deleted: false },
        },
      ],
    },
  );

  User.associate = (models) => {
    // cascade role deletion (admin, owner, waitlist)
    User.hasOne(models.Admin, { foreignKey: "user_id", onDelete: "CASCADE" });
    User.belongsToMany(models.Holding, {
      through: models.Owner,
      as: "OwnedHoldings",
      foreignKey: "user_id",
      otherKey: "holding_id",
      onDelete: "CASCADE",
    });
    User.belongsToMany(models.Session, {
      through: models.Waitlist,
      as: "WaitlistedSessions",
      foreignKey: "user_id",
      otherKey: "session_id",
      onDelete: "CASCADE",
    });

    // forbid hard-deletion if the user is tied to historical game data (judge, team-player/speaker)
    User.hasMany(models.Room, { foreignKey: "judge", onDelete: "NO ACTION" });
    User.hasMany(models.Team, {
      as: "OpenedTeams",
      foreignKey: "opener",
      onDelete: "NO ACTION",
    });
    User.hasMany(models.Team, {
      as: "ClosedTeams",
      foreignKey: "closer",
      onDelete: "NO ACTION",
    });
    User.hasMany(models.RoomSpeaker, {
      foreignKey: "user_id",
      onDelete: "NO ACTION",
    });
  };

  return User;
};
