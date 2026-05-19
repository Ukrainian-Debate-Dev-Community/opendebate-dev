const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const RoomSpeaker = sequelize.define(
    "RoomSpeaker",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      room_team_id: { type: DataTypes.INTEGER, allowNull: false },
      participant_id: { type: DataTypes.INTEGER, allowNull: false },
      speech_position: { type: DataTypes.SMALLINT, allowNull: false },
      rank: { type: DataTypes.SMALLINT, allowNull: true }, // team-position
    },
    { tableName: "room_speakers" },
  );

  RoomSpeaker.associate = (models) => {
    RoomSpeaker.belongsTo(models.RoomTeam, { foreignKey: "room_team_id" });
    RoomSpeaker.belongsTo(models.EventParticipant, {
      foreignKey: "participant_id",
    });
    RoomSpeaker.hasMany(models.Score, {
      foreignKey: "room_speaker_id",
      onDelete: "CASCADE",
    });
  };

  return RoomSpeaker;
};
