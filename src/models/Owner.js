const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Owner = sequelize.define(
    "Owner",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      organisation_id: { type: DataTypes.INTEGER, allowNull: false },
      granted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    { tableName: "owners" },
  );

  Owner.associate = (models) => {
    Owner.belongsTo(models.User, { foreignKey: "user_id" });
    Owner.belongsTo(models.Organisation, { foreignKey: "organisation_id" });
  };

  return Owner;
};
