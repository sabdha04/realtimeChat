import { Sequelize } from "sequelize";

export const sequelize = new Sequelize("chatdb", "root", "root", {
  host: "localhost",
  dialect: "mysql", // bisa diganti: 'postgres'
  logging: false,
});

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected");
  } catch (err) {
    console.error("❌ Database error:", err);
  }
};
