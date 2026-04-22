const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Holding = sequelize.define(
    "Holding",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      type: {
        type: DataTypes.STRING(20),
        defaultValue: "academic",
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
    { tableName: "holdings" },
  );

  Holding.associate = (models) => {
    Holding.belongsToMany(models.User, {
      through: models.Owner,
      as: "Owners",
      foreignKey: "holding_id",
      otherKey: "user_id",
    });
    Holding.hasMany(models.Session, {
      foreignKey: "holding_id",
      onDelete: "NO ACTION",
    }); // don't delete club events
  };

  return Holding;
};
