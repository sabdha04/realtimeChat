// server/server.js
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { connectDB, sequelize } from "./db.js";
import { User } from "./models/user.js";
import { Message } from "./models/message.js";
import { PrivateMessage } from "./models/privateMessage.js";
import { Op } from "sequelize";

const JWT_SECRET = "ganti_dengan_rahasia_panjang_dan_random";
const SALT_ROUNDS = 10;

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Helper token
function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "1d" });
}

/* ---------- AUTH ---------- */
app.post("/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "username & password required" });

    const exists = await User.findOne({ where: { username } });
    if (exists) return res.status(409).json({ error: "username sudah dipakai" });

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ username, password: hashed });
    const token = createToken(user);
    res.json({ token, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = createToken(user);
    res.json({ token, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server error" });
  }
});

/* ---------- API ---------- */
app.get("/messages", async (req, res) => {
  const messages = await Message.findAll({
    include: User,
    order: [["createdAt", "ASC"]],
    limit: 200,
  });
  res.json(messages);
});

app.get("/private-messages/:user1/:user2", async (req, res) => {
  const { user1, user2 } = req.params;
  const messages = await PrivateMessage.findAll({
    where: {
      [Op.or]: [
        { fromUser: user1, toUser: user2 },
        { fromUser: user2, toUser: user1 },
      ],
    },
    order: [["createdAt", "ASC"]],
  });
  res.json(messages);
});

const clients = new Map(); // Map<ws, username>

app.get("/online-users", (req, res) => {
  res.json(Array.from(clients.values()));
});

/* ---------- WEBSOCKET ---------- */
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const [ws] of clients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      // --- Join ---
      if (data.type === "join") {
        const { token } = data;
        if (!token) return ws.send(JSON.stringify({ type: "error", message: "token required" }));

        try {
          const payload = jwt.verify(token, JWT_SECRET);
          clients.set(ws, payload.username);

          let user = await User.findOne({ where: { username: payload.username } });
          if (!user) user = await User.create({ username: payload.username, password: "external" });

          // broadcast({ type: "notification", message: `🟢 ${payload.username} bergabung.` });
          broadcast({ type: "onlineUsers", users: Array.from(clients.values()) });
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: "invalid token" }));
        }
        return;
      }

      const username = clients.get(ws);
      if (!username) return ws.send(JSON.stringify({ type: "error", message: "not authenticated" }));

      // --- Global Chat ---
      if (data.type === "chat") {
        const time = data.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const user = await User.findOne({ where: { username } });
        const msg = await Message.create({ content: data.content, time, UserId: user.id });

        broadcast({ type: "chat", username, message: msg.content, time });
        return;
      }

      // --- Private Chat ---
      if (data.type === "private") {
        const toUser = data.to;
        const recipientWs = Array.from(clients.entries()).find(([w, u]) => u === toUser)?.[0];

        const msgData = {
          type: "private",
          from: username,
          content: data.content,
          time: data.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        // Simpan pesan ke database
        await PrivateMessage.create({
          fromUser: username,
          toUser,
          content: msgData.content,
          time: msgData.time,
        });

        // Kirim ke penerima (jika online)
        if (recipientWs && recipientWs.readyState === ws.OPEN) {
          recipientWs.send(JSON.stringify(msgData));
        }

        // Kirim balik ke pengirim
        ws.send(JSON.stringify(msgData));
        return;
      }

    } catch (err) {
      console.error("ws message error:", err);
      ws.send(JSON.stringify({ type: "error", message: "server error" }));
    }
  });

  ws.on("close", () => {
    const username = clients.get(ws);
    if (username) {
      clients.delete(ws);
      // broadcast({ type: "notification", message: `🔴 ${username} keluar.` });
      broadcast({ type: "onlineUsers", users: Array.from(clients.values()) });
    }
  });
});

/* ---------- START ---------- */
await connectDB();
await sequelize.sync({ alter: true });

const PORT = 8080;
server.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
