const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Motion = sequelize.define(
    "Motion",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: { type: DataTypes.INTEGER, allowNull: false },
      motion_text: { type: DataTypes.TEXT, allowNull: false },
      infoslide: { type: DataTypes.TEXT, allowNull: true },
      is_released: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { tableName: "motions" },
  );

  Motion.associate = (models) => {
    Motion.belongsTo(models.Event, { foreignKey: "event_id" });
    Motion.hasMany(models.Room, {
      foreignKey: "motion_id",
      onDelete: "SET NULL",
    });
  };

  return Motion;
};
