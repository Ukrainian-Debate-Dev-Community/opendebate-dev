const { DataTypes } = require("sequelize");
const { KEYWORD_MAX_LENGTH } = require("../utils/motionKeyword");

module.exports = (sequelize) => {
  const Motion = sequelize.define(
    "Motion",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: { type: DataTypes.INTEGER, allowNull: false },
      motion_text: { type: DataTypes.TEXT, allowNull: false },
      infoslide: { type: DataTypes.TEXT, allowNull: true },
      keyword: {
        type: DataTypes.STRING(120),
        allowNull: true,
        validate: {
          len: {
            args: [0, KEYWORD_MAX_LENGTH],
            msg: `Motion keyword must be at most ${KEYWORD_MAX_LENGTH} characters.`,
          },
        },
      },
      is_released: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    {
      tableName: "motions",
      paranoid: true,
      deletedAt: "archived_at",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
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
