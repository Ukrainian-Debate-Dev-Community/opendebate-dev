const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Room = sequelize.define(
    "Room",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      round_id: { type: DataTypes.INTEGER, allowNull: false },
      format_id: { type: DataTypes.INTEGER, allowNull: false },
      motion_id: { type: DataTypes.INTEGER, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        defaultValue: "pending",
        validate: {
          isIn: [["pending", "live", "judging", "completed", "void"]],
        },
      },
    },
    { tableName: "rooms" },
  );

  Room.associate = (models) => {
    Room.belongsTo(models.Round, { foreignKey: "round_id" });
    Room.belongsTo(models.Format, { foreignKey: "format_id" });
    Room.belongsTo(models.Motion, { foreignKey: "motion_id" });
    Room.hasMany(models.RoomTeam, {
      foreignKey: "room_id",
      onDelete: "CASCADE",
    });
    Room.hasMany(models.RoomAdjudicator, {
      foreignKey: "room_id",
      onDelete: "CASCADE",
    });
  };

  return Room;
};
