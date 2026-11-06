import { io } from "https://cdn.jsdelivr.net/npm/socket.io-client@4.7.5/dist/socket.io.esm.min.js";

// ======================================
// CONFIG  (change SERVER_URL!)
// ======================================

// Your backend URL (Render / Railway etc). Must be https://
const SERVER_URL = "https://talktosmile-server.onrender.com";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
  // Add a TURN server so voice works on mobile data / strict networks:
  // { urls: "turn:YOUR_TURN_HOST:3478", username: "USER", credential: "PASS" }
];

// ======================================
// FIREBASE (optional - chat works even if this fails)
// ======================================

// Paste your config from Firebase Console > Project settings > Your apps.
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

const FIREBASE_VERSION = "10.12.2";
let analytics = null;
let logEventFn = null;

async function initFirebase() {
  if (FIREBASE_CONFIG.apiKey.startsWith("YOUR_")) return;

  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;

    const [appMod, authMod, analyticsMod] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-auth.js"),
      import(base + "firebase-analytics.js")
    ]);

    const app = appMod.initializeApp(FIREBASE_CONFIG);

    await authMod.signInAnonymously(authMod.getAuth(app)).catch(() => {});

    if (await analyticsMod.isSupported()) {
      analytics = analyticsMod.getAnalytics(app);
      logEventFn = analyticsMod.logEvent;
    }
  } catch (error) {
    console.warn("Firebase unavailable:", error);
  }
}

function track(name, params = {}) {
  try {
    if (analytics && logEventFn) logEventFn(analytics, name, params);
  } catch (error) {
    /* ignore analytics errors */
  }
}

// ======================================
// ELEMENTS
// ======================================

const $ = (id) => document.getElementById(id);

const usernameInput = $("usernameInput");
const onlineCount = $("onlineCount");
const statusEl = $("status");
const startBtn = $("startBtn");
const nextBtn = $("nextBtn");
const disconnectBtn = $("disconnectBtn");
const voiceBtn = $("voiceBtn");
const muteBtn = $("muteBtn");
const endVoiceBtn = $("endVoiceBtn");
const remoteAudio = $("remoteAudio");
const chatBox = $("chatBox");
const msgInput = $("msgInput");
const sendBtn = $("sendBtn");

// ======================================
// STATE
// ======================================

let state = "idle"; // idle | waiting | chatting
let roomId = null;
let partnerName = "Stranger";

let pc = null;
let localStream = null;
let pendingCandidates = [];
let muted = false;

// ======================================
// SOCKET
// ======================================

const SERVER_URL_MISSING = SERVER_URL.includes("YOUR-SERVER-URL");

const socket = io(SERVER_URL, {
  transports: ["websocket", "polling"],
  reconnectionDelayMax: 5000,
  autoConnect: !SERVER_URL_MISSING
});

// ======================================
// UI HELPERS
// ======================================

function setStatus(text) {
  statusEl.textContent = "Status: " + text;
}

function clearPlaceholder() {
  const placeholder = chatBox.querySelector(".chat-placeholder");
  if (placeholder) placeholder.remove();
}

function addMessage(kind, name, text) {
  clearPlaceholder();

  const row = document.createElement("div");
  row.style.cssText = "margin:0 0 10px;line-height:1.5;font-size:15px;";

  if (kind === "system") {
    row.style.cssText += "text-align:center;color:#64748b;font-size:13px;";
    row.textContent = text;
  } else {
    const who = document.createElement("strong");
    who.style.color = kind === "me" ? "#22d3ee" : "#a78bfa";
    who.textContent = name + ": ";

    const body = document.createElement("span");
    body.style.color = "#e2e8f0";
    body.textContent = text; // textContent prevents HTML injection

    row.append(who, body);
  }

  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function resetChatBox(message) {
  chatBox.textContent = "";
  if (message) addMessage("system", "", message);
}

function updateButtons() {
  const connected = socket.connected;
  const voiceActive = !!pc;

  startBtn.disabled = !connected || state !== "idle";
  nextBtn.disabled = !connected || state === "idle";
  disconnectBtn.disabled = !connected || state === "idle";

  voiceBtn.disabled = state !== "chatting" || voiceActive;
  muteBtn.disabled = !voiceActive;
  endVoiceBtn.disabled = !voiceActive;

  msgInput.disabled = state !== "chatting";
  sendBtn.disabled = state !== "chatting";
}

function setState(next) {
  state = next;
  updateButtons();
}

// ======================================
// VOICE (WebRTC)
// ======================================

function closeVoice() {
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    pc = null;
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  pendingCandidates = [];
  muted = false;
  muteBtn.textContent = "🔊 Mute";
  remoteAudio.srcObject = null;

  updateButtons();
}

async function createPeer() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  stream.getTracks().forEach((track) => peer.addTrack(track, stream));

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { roomId, candidate: event.candidate });
    }
  };

  peer.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play().catch(() => {});
  };

  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "connected") {
      addMessage("system", "", "🎙 Voice connected");
    }

    if (peer.connectionState === "failed") {
      addMessage("system", "", "Voice connection failed. Try again.");
      closeVoice();
    }
  };

  localStream = stream;
  pc = peer;
  updateButtons();

  return peer;
}

async function flushCandidates() {
  const queued = pendingCandidates;
  pendingCandidates = [];

  for (const candidate of queued) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      console.warn("ICE error:", error);
    }
  }
}

async function startVoice() {
  if (state !== "chatting" || pc) return;

  try {
    const peer = await createPeer();
    const offer = await peer.createOffer();

    await peer.setLocalDescription(offer);

    socket.emit("offer", { roomId, sdp: offer });
    track("voice_start");

    addMessage("system", "", "Calling stranger...");
  } catch (error) {
    console.error(error);
    addMessage("system", "", "Could not access microphone. Please allow mic permission.");
    closeVoice();
  }
}

function endVoice() {
  if (pc) socket.emit("voice-end");
  closeVoice();
  addMessage("system", "", "Voice ended");
}

function toggleMute() {
  if (!localStream) return;

  muted = !muted;

  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !muted;
  });

  muteBtn.textContent = muted ? "🔇 Unmute" : "🔊 Mute";
}

// ======================================
// CHAT ACTIONS
// ======================================

function startChat() {
  if (!socket.connected) {
    setStatus("Server not connected yet...");
    return;
  }

  const username = usernameInput.value.trim();

  if (!username) {
    setStatus("Please enter a nickname first");
    usernameInput.focus();
    return;
  }

  resetChatBox("Looking for someone to talk to...");
  socket.emit("start-chat", { username });
  track("chat_start");
  setState("waiting");
  setStatus("Searching for a stranger...");
}

function nextStranger() {
  closeVoice();
  roomId = null;

  resetChatBox("Looking for someone new...");
  socket.emit("next-stranger");
  setState("waiting");
  setStatus("Searching for a stranger...");
}

function disconnectChat() {
  closeVoice();
  roomId = null;

  socket.emit("stop-chat");
  setState("idle");
  setStatus("Disconnected");
  addMessage("system", "", "You disconnected.");
}

function sendMessage() {
  const text = msgInput.value.trim();

  if (!text || state !== "chatting") return;

  socket.emit("message", { text });
  addMessage("me", "You", text);

  msgInput.value = "";
  msgInput.focus();
}

// ======================================
// SOCKET EVENTS
// ======================================

socket.on("connect", () => {
  onlineCount.textContent = "…";
  setStatus("Connected ✅");
  updateButtons();
});

socket.on("connect_error", (error) => {
  console.warn("Socket connect error:", error && error.message);
  onlineCount.textContent = "–";
  setStatus("Server unreachable, retrying... (can take up to a minute)");
  updateButtons();
});

socket.on("disconnect", () => {
  onlineCount.textContent = "–";
  closeVoice();
  roomId = null;
  setState("idle");
  setStatus("Connection lost, reconnecting...");
});

socket.on("online-count", (count) => {
  onlineCount.textContent = count;
});

socket.on("waiting", () => {
  setState("waiting");
  setStatus("Waiting for a stranger to join...");
});

socket.on("matched", (data) => {
  roomId = data.roomId;
  partnerName = data.username || "Stranger";

  resetChatBox(`You are now connected with ${partnerName}. Say hi! 👋`);
  setState("chatting");
  setStatus(`Chatting with ${partnerName}`);
  track("chat_matched");
  msgInput.focus();
});

socket.on("message", (data) => {
  addMessage("stranger", data.username || partnerName, data.text);
});

socket.on("partner-disconnected", () => {
  closeVoice();
  roomId = null;

  setState("idle");
  setStatus("Stranger left the chat");
  addMessage("system", "", "Stranger disconnected. Press Start Chat to find someone new.");
});

socket.on("chat-stopped", () => {
  setState("idle");
});

socket.on("voice-end", () => {
  if (pc) {
    closeVoice();
    addMessage("system", "", "Stranger ended the voice call");
  }
});

// ---- WebRTC signaling ----

socket.on("offer", async (data) => {
  if (state !== "chatting" || pc) return;

  try {
    const peer = await createPeer();

    await peer.setRemoteDescription(data.sdp);
    await flushCandidates();

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    socket.emit("answer", { roomId, sdp: answer });

    addMessage("system", "", "Stranger started a voice call");
  } catch (error) {
    console.error(error);
    addMessage("system", "", "Could not join voice. Please allow mic permission.");
    closeVoice();
  }
});

socket.on("answer", async (data) => {
  if (!pc) return;

  try {
    await pc.setRemoteDescription(data.sdp);
    await flushCandidates();
  } catch (error) {
    console.error(error);
  }
});

socket.on("ice-candidate", async (data) => {
  if (!data || !data.candidate) return;

  if (!pc || !pc.remoteDescription) {
    pendingCandidates.push(data.candidate);
    return;
  }

  try {
    await pc.addIceCandidate(data.candidate);
  } catch (error) {
    console.warn("ICE error:", error);
  }
});

// ======================================
// BUTTON EVENTS
// ======================================

startBtn.addEventListener("click", startChat);
nextBtn.addEventListener("click", nextStranger);
disconnectBtn.addEventListener("click", disconnectChat);
voiceBtn.addEventListener("click", startVoice);
muteBtn.addEventListener("click", toggleMute);
endVoiceBtn.addEventListener("click", endVoice);
sendBtn.addEventListener("click", sendMessage);

msgInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendMessage();
  }
});

usernameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") startChat();
});

// ======================================
// INIT
// ======================================

onlineCount.textContent = "–";

if (SERVER_URL_MISSING) {
  setStatus("⚠ Server URL not set in script.js");
  console.error("Set SERVER_URL at the top of script.js to your backend URL.");
} else {
  setStatus("Connecting to server...");
}

updateButtons();
initFirebase();
