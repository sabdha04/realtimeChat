import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";
import { User } from "./user.js";

export const Message = sequelize.define("Message", {
  content: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  time: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

// Relasi
User.hasMany(Message);
Message.belongsTo(User);
