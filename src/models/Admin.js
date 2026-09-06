const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Admin = sequelize.define(
    "Admin",
    {
      user_id: { type: DataTypes.INTEGER, primaryKey: true },
      granted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "admins",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  );

  Admin.associate = (models) => {
    Admin.belongsTo(models.User, { foreignKey: "user_id" });
  };

  return Admin;
};
