const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "Owner",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      organisation_id: { type: DataTypes.INTEGER, allowNull: false },
      granted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    { tableName: "owners" },
  );
};
