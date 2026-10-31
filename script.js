
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://talktosmile.online")
  .split(",")
  .map(origin => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

const waitingUsers = new Map();
const activeRooms = new Map();

app.get("/", (req, res) => {
  res.json({
    name: "TalkToSmile Server",
    status: "running",
    message: "Socket.IO server is ready"
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

function updateOnlineCount() {
  io.emit("online-count", io.engine.clientsCount);
}

function removeFromWaiting(socket) {
  waitingUsers.delete(socket.id);
}

function endChat(socket, notifyPartner = true) {
  removeFromWaiting(socket);

  const session = activeRooms.get(socket.id);
  if (!session) return;

  const { roomId, partnerId } = session;
  const partner = io.sockets.sockets.get(partnerId);

  activeRooms.delete(socket.id);

  if (partner) {
    activeRooms.delete(partnerId);

    if (notifyPartner) {
      partner.emit("partner-disconnected");
    }
  }

  socket.leave(roomId);
  if (partner) partner.leave(roomId);

  socket.emit("chat-ended");
}

function findMatch(socket) {
  if (!socket.connected) return;

  removeFromWaiting(socket);

  const username = socket.data.username || "Stranger";

  let partner = null;

  for (const [id] of waitingUsers) {
    if (id === socket.id) continue;

    const candidate = io.sockets.sockets.get(id);

    if (candidate && candidate.connected && !activeRooms.has(id)) {
      partner = candidate;
      break;
    }

    waitingUsers.delete(id);
  }

  if (!partner) {
    waitingUsers.set(socket.id, username);
    socket.emit("waiting");
    return;
  }

  const partnerUsername = waitingUsers.get(partner.id) || "Stranger";
  waitingUsers.delete(partner.id);

  const roomId = "room_" + Date.now() + "_" +
    Math.random().toString(36).slice(2, 9);

  activeRooms.set(socket.id, {
    roomId,
    partnerId: partner.id
  });

  activeRooms.set(partner.id, {
    roomId,
    partnerId: socket.id
  });

  socket.join(roomId);
  partner.join(roomId);

  socket.emit("matched", {
    roomId,
    partnerId: partner.id,
    username: partnerUsername,
    initiator: true
  });

  partner.emit("matched", {
    roomId,
    partnerId: socket.id,
    username,
    initiator: false
  });
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  updateOnlineCount();

  socket.on("start-chat", (data = {}) => {
    endChat(socket, true);

    const username = String(data.username || "Stranger")
      .trim()
      .slice(0, 20) || "Stranger";

    socket.data.username = username;
    findMatch(socket);
  });

  socket.on("next-stranger", () => {
    endChat(socket, true);
    findMatch(socket);
  });

  socket.on("stop-chat", () => {
    endChat(socket, true);
  });

  socket.on("message", (text) => {
    const session = activeRooms.get(socket.id);
    if (!session || typeof text !== "string") return;

    const cleanText = text.trim().slice(0, 500);
    if (!cleanText) return;

    const partner = io.sockets.sockets.get(session.partnerId);
    if (!partner) return;

    partner.emit("message", {
      text: cleanText,
      senderId: socket.id,
      username: socket.data.username || "Stranger",
      timestamp: Date.now()
    });
  });

  // WebRTC signaling
  ["offer", "answer", "ice-candidate"].forEach(eventName => {
    socket.on(eventName, (data = {}) => {
      const session = activeRooms.get(socket.id);
      if (!session) return;

      const partner = io.sockets.sockets.get(session.partnerId);
      if (!partner) return;

      partner.emit(eventName, {
        ...data,
        from: socket.id
      });
    });
  });

  socket.on("voice-end", (data = {}) => {
    const session = activeRooms.get(socket.id);
    if (!session) return;

    const partner = io.sockets.sockets.get(session.partnerId);

    if (partner) {
      partner.emit("voice-end", {
        callId: data.callId
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    endChat(socket, true);
    updateOnlineCount();
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("TalkToSmile server running on port", PORT);
});
