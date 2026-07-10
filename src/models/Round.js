const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Round = sequelize.define(
    "Round",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(64), allowNull: false },
      sequence: { type: DataTypes.SMALLINT, allowNull: false },
      status: {
        type: DataTypes.STRING(20),
        defaultValue: "draft",
        validate: {
          isIn: [["draft", "scheduled", "in_progress", "completed"]],
        },
      },
    },
    {
      tableName: "rounds",
      indexes: [
        {
          unique: true,
          fields: ["event_id", "sequence"],
          name: "unique_sequence_per_event",
        },
      ],
    },
  );

  Round.associate = (models) => {
    Round.belongsTo(models.Event, { foreignKey: "event_id" });
    Round.hasMany(models.Room, { foreignKey: "round_id", onDelete: "CASCADE" });
  };

  return Round;
};
