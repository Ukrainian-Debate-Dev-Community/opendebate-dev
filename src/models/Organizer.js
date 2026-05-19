const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Organizer = sequelize.define(
    "Organizer",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      event_id: { type: DataTypes.INTEGER, allowNull: false },
      granted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    { tableName: "organizers" },
  );

  Organizer.associate = (models) => {
    Organizer.belongsTo(models.User, { foreignKey: "user_id" });
    Organizer.belongsTo(models.Event, { foreignKey: "event_id" });
  };

  return Organizer;
};
