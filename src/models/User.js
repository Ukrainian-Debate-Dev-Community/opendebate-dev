const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(64), allowNull: false },
      password: { type: DataTypes.STRING(255), allowNull: false },
      is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "users",
      indexes: [
        { unique: true, fields: ["username"] },
        {
          name: "idx_active_users",
          fields: ["id", "username"],
          where: { is_deleted: false },
        },
      ],
    },
  );

  User.associate = (models) => {
    // cascade role deletion (admin, owner, waitlist)
    User.hasOne(models.Admin, { foreignKey: "user_id", onDelete: "CASCADE" });
    User.belongsToMany(models.Organisation, {
      through: models.Owner,
      as: "OwnedOrganisations",
      foreignKey: "user_id",
      otherKey: "organisation_id",
      onDelete: "CASCADE",
    });
    User.belongsToMany(models.Event, {
      through: models.Organizer,
      as: "OrganizedEvents",
      foreignKey: "user_id",
      otherKey: "event_id",
      onDelete: "CASCADE",
    });
    User.hasMany(models.EventParticipant, {
      foreignKey: "user_id",
      onDelete: "SET NULL", // will become "guest"
    });
  };

  return User;
};
