const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Motion = sequelize.define(
    "Motion",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      session_id: { type: DataTypes.INTEGER, allowNull: false },
      motion_text: { type: DataTypes.STRING("MAX"), allowNull: false },
      infoslide: { type: DataTypes.STRING("MAX"), allowNull: true },
      is_released: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { tableName: "motions" },
  );

  Motion.associate = (models) => {
    Motion.belongsTo(models.Session, { foreignKey: "session_id" });
  };

  return Motion;
};
