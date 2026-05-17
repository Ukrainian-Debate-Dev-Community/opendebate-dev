const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const EventParticipant = sequelize.define(
    "EventParticipant",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: { type: DataTypes.INTEGER, allowNull: false },
      user_id: { type: DataTypes.INTEGER, allowNull: true }, // Nullable for guests
      display_name: { type: DataTypes.STRING(120), allowNull: false },
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [["speaker", "adjudicator"]] },
      },
      is_waitlist: { type: DataTypes.BOOLEAN, defaultValue: false },
      claim_token_hash: { type: DataTypes.STRING(255), allowNull: true },
      claim_token_used_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: "event_participants" },
  );

  EventParticipant.associate = (models) => {
    EventParticipant.belongsTo(models.Event, { foreignKey: "event_id" });
    EventParticipant.belongsTo(models.User, { foreignKey: "user_id" });
    EventParticipant.hasMany(models.TeamMember, {
      foreignKey: "participant_id",
      onDelete: "CASCADE",
    });
    EventParticipant.hasMany(models.RoomAdjudicator, {
      foreignKey: "participant_id",
      onDelete: "CASCADE",
    });
    EventParticipant.hasMany(models.RoomSpeaker, {
      foreignKey: "participant_id",
      onDelete: "CASCADE",
    });
  };

  return EventParticipant;
};
