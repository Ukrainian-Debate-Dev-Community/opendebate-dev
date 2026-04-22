const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Session = sequelize.define(
    "Session",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      holding_id: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: true }, // added for name like "Round 1" or "Evening Session"
      date: { type: DataTypes.DATE, allowNull: false },
      status: {
        type: DataTypes.STRING(20),
        defaultValue: "scheduled",
        validate: { isIn: [["scheduled", "archived"]] },
      },
    },
    { tableName: "sessions" },
  );

  Session.associate = (models) => {
    Session.belongsTo(models.Holding, { foreignKey: "holding_id" });
    // event deletion (not archive status) - wipe the data
    Session.belongsToMany(models.User, {
      through: models.Waitlist,
      as: "WaitlistedUsers",
      foreignKey: "session_id",
      otherKey: "user_id",
      onDelete: "CASCADE",
    });
    Session.hasMany(models.Room, {
      foreignKey: "session_id",
      onDelete: "CASCADE",
    });
    Session.hasMany(models.Team, {
      foreignKey: "session_id",
      onDelete: "CASCADE",
    });
    Session.hasOne(models.Motion, {
      foreignKey: "session_id",
      onDelete: "CASCADE",
    });
  };

  return Session;
};
