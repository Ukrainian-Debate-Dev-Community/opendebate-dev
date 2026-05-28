const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const RoomTeam = sequelize.define(
    "RoomTeam",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      room_id: { type: DataTypes.INTEGER, allowNull: false },
      team_id: { type: DataTypes.INTEGER, allowNull: false },
      position: { type: DataTypes.SMALLINT, allowNull: false },
      rank: { type: DataTypes.SMALLINT, allowNull: true },
    },
    {
      tableName: "room_teams",
      indexes: [{ unique: true, fields: ["room_id", "team_id"] }],
    },
  );

  RoomTeam.associate = (models) => {
    RoomTeam.belongsTo(models.Room, { foreignKey: "room_id" });
    RoomTeam.belongsTo(models.Team, { foreignKey: "team_id" });
    RoomTeam.hasMany(models.RoomSpeaker, {
      foreignKey: "room_team_id",
      onDelete: "CASCADE",
    });
  };

  return RoomTeam;
};
