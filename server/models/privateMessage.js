import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export const PrivateMessage = sequelize.define("PrivateMessage", {
  fromUser: { type: DataTypes.STRING, allowNull: false },
  toUser: { type: DataTypes.STRING, allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  time: { type: DataTypes.STRING, allowNull: false },
});
