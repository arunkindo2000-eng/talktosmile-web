import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

// ======================================
// TALKTOSMILE - CLIENT V1
// ======================================

const SERVER_URL = "https://talktosmile-server.onrender.com";

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

const chatBox = $("chatBox");
const msgInput = $("msgInput");
const sendBtn = $("sendBtn");
const remoteAudio = $("remoteAudio");

let socket;
let isMatched = false;
let isSearching = false;
let isInitiator = false;
let isMuted = false;
let voiceRequested = false;

let roomId = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let pendingCandidates = [];

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

// ======================================
// UI
// ======================================

function status(message) {
  if (statusEl) statusEl.textContent = message;
}

function updateButtons() {
  if (startBtn) startBtn.disabled = isSearching || isMatched;
  if (nextBtn) nextBtn.disabled = !isMatched;
  if (disconnectBtn) disconnectBtn.disabled = !isSearching && !isMatched;
  if (voiceBtn) voiceBtn.disabled = !isMatched || voiceRequested;
  if (muteBtn) muteBtn.disabled = !localStream;
  if (endVoiceBtn) endVoiceBtn.disabled = !voiceRequested && !localStream;
}

function addMessage(message, type = "system") {
  if (!chatBox) return;

  const div = document.createElement("div");
  div.className = `chat-message ${type}`;
  div.textContent = message;

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function clearMessages() {
  if (chatBox) chatBox.innerHTML = "";
}

function username() {
  return usernameInput?.value?.trim().slice(0, 24) || "Guest";
}

// ======================================
// SOCKET CONNECTION
// ======================================

socket = io(SERVER_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  timeout: 20000
});

socket.on("connect", () => {
  console.log("Connected:", socket.id);
  status("Server connected. Ready to chat.");
  updateButtons();
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error.message);
  status("Server connection error. Retrying...");
});

socket.on("disconnect", () => {
  console.log("Server disconnected");

  isMatched = false;
  isSearching = false;
  roomId = null;

  closeVoice();
  updateButtons();

  status("Server disconnected. Reconnecting...");
});

socket.on("online-count", (count) => {
  if (onlineCount) onlineCount.textContent = count;
});

// ======================================
// START CHAT
// ======================================

function startChat() {
  if (!socket.connected) {
    status("Connecting to server. Please wait...");
    socket.connect();
    return;
  }

  if (isSearching || isMatched) return;

  clearMessages();
  closeVoice();

  isSearching = true;
  isMatched = false;

  status("Finding a stranger...");
  updateButtons();

  socket.emit("start-chat", username());
}

socket.on("waiting", () => {
  isSearching = true;
  isMatched = false;

  status("Waiting for a stranger...");
  addMessage("Searching for someone to chat with...", "system");
  updateButtons();
});

// ======================================
// MATCHED
// ======================================

socket.on("matched", (data = {}) => {
  isSearching = false;
  isMatched = true;

  roomId = data.roomId || null;
  isInitiator = Boolean(data.initiator);

  status("Connected with " + (data.username || "Stranger"));
  addMessage("You are connected! Say hello.", "system");

  updateButtons();
});

// ======================================
// NEXT STRANGER
// ======================================

function nextStranger() {
  if (!socket.connected || !isMatched) return;

  closeVoice();

  isMatched = false;
  isSearching = true;
  roomId = null;

  status("Finding next stranger...");
  clearMessages();
  updateButtons();

  socket.emit("next-stranger");
}

// ======================================
// DISCONNECT
// ======================================

function disconnectChat() {
  if (socket.connected) {
    socket.emit("stop-chat");
  }

  closeVoice();

  isMatched = false;
  isSearching = false;
  roomId = null;

  status("You disconnected.");
  addMessage("You left the chat.", "system");

  updateButtons();
}

socket.on("chat-stopped", () => {
  isMatched = false;
  isSearching = false;
  updateButtons();
});

socket.on("partner-disconnected", () => {
  closeVoice();

  isMatched = false;
  isSearching = false;
  roomId = null;

  status("Stranger disconnected.");
  addMessage("Your stranger has disconnected.", "system");

  updateButtons();
});

// ======================================
// TEXT CHAT
// ======================================

function sendMessage() {
  const message = msgInput?.value?.trim();

  if (!message || !isMatched || !socket.connected) return;

  socket.emit("message", message);

  addMessage("You: " + message, "sent");

  msgInput.value = "";
  msgInput.focus();
}

socket.on("message", (data) => {
  const text = typeof data === "string" ? data : data?.text;
  const sender = typeof data === "object"
    ? (data.username || "Stranger")
    : "Stranger";

  if (text) addMessage(sender + ": " + text, "received");
});

// ======================================
// WEBRTC
// ======================================

async function getMicrophone() {
  if (localStream) return localStream;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone is unavailable. Use HTTPS.");
  }

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });

  return localStream;
}

async function createPeer() {
  if (peerConnection) return peerConnection;

  peerConnection = new RTCPeerConnection(ICE_CONFIG);

  remoteStream = new MediaStream();

  if (remoteAudio) {
    remoteAudio.srcObject = remoteStream;
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
  }

  const stream = await getMicrophone();

  stream.getTracks().forEach(track => {
    peerConnection.addTrack(track, stream);
  });

  peerConnection.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach(track => {
      if (!remoteStream.getTracks().some(t => t.id === track.id)) {
        remoteStream.addTrack(track);
      }
    });

    remoteAudio?.play().catch(console.warn);
    status("Voice connected!");
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && isMatched && socket.connected) {
      socket.emit("ice-candidate", {
        roomId,
        candidate: event.candidate
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection?.connectionState;

    if (state === "connected") status("Voice connected!");
    if (state === "failed") status("Voice failed. TURN server may be needed.");
    if (state === "disconnected") status("Voice reconnecting...");
  };

  return peerConnection;
}

// ======================================
// VOICE START
// ======================================

async function startVoice() {
  if (!isMatched) {
    status("Connect with a stranger first.");
    return;
  }

  try {
    voiceRequested = true;
    status("Requesting microphone permission...");
    updateButtons();

    await createPeer();

    if (isInitiator) {
      await createOffer();
    } else {
      status("Microphone ready. Waiting for voice connection...");
    }
  } catch (error) {
    console.error("Voice start error:", error);

    closeVoice();
    status(error.name === "NotAllowedError"
      ? "Please allow microphone permission."
      : "Could not start voice.");
  }

  updateButtons();
}

// ======================================
// OFFER
// ======================================

async function createOffer() {
  if (!isMatched || !socket.connected) return;

  const pc = await createPeer();

  if (pc.signalingState !== "stable") return;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("offer", {
    roomId,
    offer: pc.localDescription
  });

  status("Calling stranger...");
}

socket.on("offer", async (data) => {
  try {
    if (!isMatched) return;

    const offer = data?.offer || data;

    await createPeer();

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    await flushCandidates();

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("answer", {
      roomId,
      answer: peerConnection.localDescription
    });

    voiceRequested = true;
    updateButtons();

    status("Connecting voice...");
  } catch (error) {
    console.error("Offer error:", error);
    status("Voice connection error.");
  }
});

// ======================================
// ANSWER
// ======================================

socket.on("answer", async (data) => {
  try {
    const answer = data?.answer || data;

    if (!peerConnection || !answer) return;

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );

    await flushCandidates();

    status("Voice connecting...");
  } catch (error) {
    console.error("Answer error:", error);
  }
});

// ======================================
// ICE CANDIDATES
// ======================================

socket.on("ice-candidate", async (data) => {
  try {
    const candidate = data?.candidate || data;
    if (!candidate) return;

    if (!peerConnection || !peerConnection.remoteDescription) {
      pendingCandidates.push(candidate);
      return;
    }

    await peerConnection.addIceCandidate(
      new RTCIceCandidate(candidate)
    );
  } catch (error) {
    console.error("ICE error:", error);
  }
});

async function flushCandidates() {
  if (!peerConnection?.remoteDescription) return;

  const candidates = [...pendingCandidates];
  pendingCandidates = [];

  for (const candidate of candidates) {
    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error("Queued ICE error:", error);
    }
  }
}

// ======================================
// MUTE
// ======================================

function toggleMute() {
  if (!localStream) return;

  isMuted = !isMuted;

  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });

  if (muteBtn) {
    muteBtn.textContent = isMuted ? "Unmute" : "Mute";
  }

  status(isMuted ? "Microphone muted." : "Microphone on.");
}

// ======================================
// END VOICE
// ======================================

function endVoice() {
  if (socket.connected && isMatched) {
    socket.emit("voice-end");
  }

  closeVoice();
  status("Voice call ended.");
}

socket.on("voice-end", () => {
  closeVoice();
  status("Stranger ended the voice call.");
});

// ======================================
// CLEANUP
// ======================================

function closeVoice() {
  voiceRequested = false;
  isMuted = false;

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
    remoteStream = null;
  }

  if (remoteAudio) remoteAudio.srcObject = null;

  pendingCandidates = [];

  if (muteBtn) muteBtn.textContent = "Mute";

  updateButtons();
}

// ======================================
// BUTTON CLICK EVENTS
// ======================================

startBtn?.addEventListener("click", startChat);
nextBtn?.addEventListener("click", nextStranger);
disconnectBtn?.addEventListener("click", disconnectChat);

sendBtn?.addEventListener("click", sendMessage);
voiceBtn?.addEventListener("click", startVoice);
muteBtn?.addEventListener("click", toggleMute);
endVoiceBtn?.addEventListener("click", endVoice);

msgInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

// ======================================
// INITIALIZE
// ======================================

updateButtons();
status("Connecting to TalkToSmile server...");
console.log("TalkToSmile client initialized.");
