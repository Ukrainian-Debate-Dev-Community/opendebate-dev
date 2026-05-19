const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Event = sequelize.define(
    "Event",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      organisation_id: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      start_date: { type: DataTypes.DATE, allowNull: true },
      end_date: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        defaultValue: "scheduled",
        validate: {
          isIn: [["scheduled", "in_progress", "completed"]],
        },
      },
      is_ranked: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { tableName: "events" },
  );

  Event.associate = (models) => {
    Event.belongsTo(models.Organisation, { foreignKey: "organisation_id" });
    Event.hasMany(models.Round, {
      foreignKey: "event_id",
      onDelete: "CASCADE",
    });
    Event.hasMany(models.EventParticipant, {
      foreignKey: "event_id",
      onDelete: "CASCADE",
    });
    Event.hasMany(models.Motion, {
      foreignKey: "event_id",
      onDelete: "CASCADE",
    });
    Event.belongsToMany(models.User, {
      through: models.Organizer,
      as: "Organizers",
      foreignKey: "event_id",
      otherKey: "user_id",
    });
  };

  return Event;
};
