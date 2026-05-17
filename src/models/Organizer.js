const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "Organizer",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      event_id: { type: DataTypes.INTEGER, allowNull: false },
      granted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    { tableName: "organizers" },
  );
};
