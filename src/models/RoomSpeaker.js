const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const RoomSpeaker = sequelize.define(
    "RoomSpeaker",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      room_team_id: { type: DataTypes.INTEGER, allowNull: false },
      participant_id: { type: DataTypes.INTEGER, allowNull: false },
      rank: { type: DataTypes.SMALLINT, allowNull: true }, // team-position
      // an iron-person's second speech: counts for the team, never for
      // the speaker standings
      is_iron: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: "room_speakers",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
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
