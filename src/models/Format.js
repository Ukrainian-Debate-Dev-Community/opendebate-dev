const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Format = sequelize.define(
    "Format",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(64), allowNull: false },
      code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
      teams_per_room: { type: DataTypes.SMALLINT, allowNull: false },
      speakers_per_team: { type: DataTypes.SMALLINT, allowNull: false },
      has_reply: { type: DataTypes.BOOLEAN, defaultValue: false },
      score_min: { type: DataTypes.SMALLINT, allowNull: false },
      score_max: { type: DataTypes.SMALLINT, allowNull: false },
    },
    { tableName: "formats" },
  );

  Format.associate = (models) => {
    Format.hasMany(models.Room, {
      foreignKey: "format_id",
      onDelete: "RESTRICT",
    });
  };

  return Format;
};
