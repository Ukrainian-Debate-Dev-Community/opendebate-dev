const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Score = sequelize.define(
    "Score",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      room_speaker_id: { type: DataTypes.INTEGER, allowNull: false },
      room_adjudicator_id: { type: DataTypes.INTEGER, allowNull: false },
      value: { type: DataTypes.SMALLINT, allowNull: false },
    },
    { tableName: "scores" },
  );

  Score.associate = (models) => {
    Score.belongsTo(models.RoomSpeaker, { foreignKey: "room_speaker_id" });
    Score.belongsTo(models.RoomAdjudicator, {
      foreignKey: "room_adjudicator_id",
    });
  };

  return Score;
};
