const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const RoomAdjudicator = sequelize.define(
    "RoomAdjudicator",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      room_id: { type: DataTypes.INTEGER, allowNull: false },
      participant_id: { type: DataTypes.INTEGER, allowNull: false },
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [["chair", "panelist", "trainee"]] },
      },
    },
    { tableName: "room_adjudicators" },
  );

  RoomAdjudicator.associate = (models) => {
    RoomAdjudicator.belongsTo(models.Room, { foreignKey: "room_id" });
    RoomAdjudicator.belongsTo(models.EventParticipant, {
      foreignKey: "participant_id",
    });
    RoomAdjudicator.hasMany(models.Score, {
      foreignKey: "room_adjudicator_id",
      onDelete: "CASCADE",
    });
  };

  return RoomAdjudicator;
};
