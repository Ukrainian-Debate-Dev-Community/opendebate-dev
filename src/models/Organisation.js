const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Organisation = sequelize.define(
    "Organisation",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      type: {
        type: DataTypes.STRING(20),
        defaultValue: "personal",
        validate: { isIn: [["academic", "personal"]] },
      },
      status: {
        type: DataTypes.STRING(20),
        defaultValue: "active",
        validate: { isIn: [["active", "inactive"]] },
      },
      online: { type: DataTypes.BOOLEAN, defaultValue: false },
      link: { type: DataTypes.STRING(255), allowNull: true },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "organisations",
      paranoid: true,
      deletedAt: "archived_at",
      timestamps: true,
      createdAt: false,
      updatedAt: false,
    },
  );

  Organisation.associate = (models) => {
    Organisation.belongsToMany(models.User, {
      through: models.Owner,
      as: "Owners",
      foreignKey: "organisation_id",
      otherKey: "user_id",
    });
    Organisation.hasMany(models.Event, {
      foreignKey: "organisation_id",
      onDelete: "RESTRICT",
    });
  };

  return Organisation;
};
