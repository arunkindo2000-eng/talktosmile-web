JavaScript

import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

// ======================================
// TALKTOSMILE - ADVANCED CLIENT SCRIPT
// ======================================

const SERVER_URL = "https://talktosmile-server.onrender.com";

const $ = (id) => document.getElementById(id);

const usernameInput = $("usernameInput");
const onlineCount = $("onlineCount");
const statusText = $("status");

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

// ======================================
// STATE
// ======================================

let socket = null;
let peerConnection = null;

let localStream = null;
let remoteStream = null;

let isMatched = false;
let isSearching = false;
let isMuted = false;
let voiceStarted = false;

let currentRoomId = null;
let currentPartner = null;

let pendingCandidates = [];

// STUN servers.
// TURN server can be added later for better mobile connectivity.
const ICE_SERVERS = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    }
  ]
};

// ======================================
// UI HELPERS
// ======================================

function setStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
}

function setButtons(searching, matched) {
  if (startBtn) startBtn.disabled = searching || matched;
  if (nextBtn) nextBtn.disabled = !matched;
  if (disconnectBtn) disconnectBtn.disabled = !searching && !matched;
}

function addMessage(message, type = "system") {
  if (!chatBox) return;

  const item = document.createElement("div");
  item.className = `chat-message ${type}`;

  // textContent prevents HTML/script injection.
  item.textContent = message;

  chatBox.appendChild(item);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function clearChat() {
  if (chatBox) chatBox.innerHTML = "";
}

function getUsername() {
  const name = usernameInput?.value?.trim();

  if (!name) return "Guest";

  return name.slice(0, 24);
}

// ======================================
// SOCKET CONNECTION
// ======================================

function connectSocket() {
  if (socket?.connected) return;

  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    registerSocketEvents();
  }

  if (!socket.connected) {
    setStatus("Connecting to server...");
    socket.connect();
  }
}

// ======================================
// SOCKET EVENTS
// ======================================

function registerSocketEvents() {

  socket.on("connect", () => {
    setStatus("Connected. Ready to chat.");
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
    setStatus("Server connection failed. Retrying...");
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket disconnected:", reason);

    isMatched = false;
    isSearching = false;

    closeVoiceConnection();
    setButtons(false, false);

    setStatus("Disconnected from server.");
  });

  socket.on("waiting", () => {
    isSearching = true;
    isMatched = false;

    setButtons(true, false);
    setStatus("Finding someone for you...");

    addMessage("Waiting for a stranger...", "system");
  });

  socket.on("matched", async (data = {}) => {
    isSearching = false;
    isMatched = true;

    currentRoomId = data.roomId || null;
    currentPartner = data.username || "Stranger";

    setButtons(false, true);

    setStatus("Connected with a stranger!");
    addMessage("You are now connected. Say hello!", "system");

    // Only one user creates the WebRTC offer.
    if (data.initiator && voiceStarted) {
      await createOffer();
    }
  });

  socket.on("partner-disconnected", () => {
    isMatched = false;
    isSearching = false;

    closeVoiceConnection();
    setButtons(false, false);

    setStatus("Stranger disconnected.");
    addMessage("The stranger has disconnected.", "system");
  });

  socket.on("message", (data) => {
    let text = "";
    let sender = "Stranger";

    if (typeof data === "string") {
      text = data;
    } else if (data && typeof data === "object") {
      text = data.text || "";
      sender = data.username || "Stranger";
    }

    if (!text) return;

    addMessage(`${sender}: ${text}`, "received");
  });

  // WebRTC signaling
  socket.on("offer", async (data) => {
    try {
      const offer = data?.offer || data;

      if (!offer) return;

      await ensurePeerConnection();
      await ensureLocalAudio();

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      await processPendingCandidates();

      const answer = await peerConnection.createAnswer();

      await peerConnection.setLocalDescription(answer);

      socket.emit("answer", {
        roomId: currentRoomId,
        answer: peerConnection.localDescription
      });

      voiceStarted = true;
      setStatus("Voice connecting...");
    } catch (error) {
      console.error("Offer handling failed:", error);
      setStatus("Voice connection failed.");
    }
  });

  socket.on("answer", async (data) => {
    try {
      const answer = data?.answer || data;

      if (!answer || !peerConnection) return;

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );

      await processPendingCandidates();

      setStatus("Voice connected!");
    } catch (error) {
      console.error("Answer handling failed:", error);
    }
  });

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
      console.error("ICE candidate error:", error);
    }
  });

  socket.on("voice-end", () => {
    closeVoiceConnection();
    setStatus("Voice call ended.");
  });
}

// ======================================
// START CHAT
// ======================================

function startChat() {
  if (!socket) connectSocket();

  if (!socket?.connected) {
    setStatus("Connecting... Please try again.");
    return;
  }

  if (isSearching || isMatched) return;

  clearChat();

  closeVoiceConnection();

  isSearching = true;
  isMatched = false;

  setButtons(true, false);
  setStatus("Finding a stranger...");

  // Backend expects username as the event argument.
  socket.emit("start-chat", getUsername());
}

// ======================================
// NEXT STRANGER
// ======================================

function nextStranger() {
  if (!socket?.connected || !isMatched) return;

  closeVoiceConnection();

  isMatched = false;
  isSearching = true;

  currentRoomId = null;
  currentPartner = null;

  clearChat();

  setButtons(true, false);
  setStatus("Finding next stranger...");

  socket.emit("next-stranger");
}

// ======================================
// DISCONNECT CHAT
// ======================================

function disconnectChat() {
  if (socket?.connected) {
    socket.emit("stop-chat");
  }

  closeVoiceConnection();

  isMatched = false;
  isSearching = false;

  currentRoomId = null;
  currentPartner = null;

  setButtons(false, false);
  setStatus("Chat disconnected.");

  addMessage("You left the chat.", "system");
}

// ======================================
// TEXT CHAT
// ======================================

function sendMessage() {
  const text = msgInput?.value?.trim();

  if (!text || !socket?.connected || !isMatched) {
    return;
  }

  // Backend forwards message(text).
  socket.emit("message", text);

  addMessage(`You: ${text}`, "sent");

  msgInput.value = "";
  msgInput.focus();
}

if (sendBtn) {
  sendBtn.addEventListener("click", sendMessage);
}

if (msgInput) {
  msgInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

// ======================================
// WEBRTC CONNECTION
// ======================================

async function ensurePeerConnection() {
  if (peerConnection) return peerConnection;

  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  remoteStream = new MediaStream();

  if (remoteAudio) {
    remoteAudio.srcObject = remoteStream;
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
  }

  peerConnection.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((track) => {
      if (!remoteStream.getTracks().some(t => t.id === track.id)) {
        remoteStream.addTrack(track);
      }
    });

    remoteAudio?.play().catch((error) => {
      console.warn("Audio playback needs user interaction:", error);
    });

    setStatus("Voice connected!");
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket?.connected && isMatched) {
      socket.emit("ice-candidate", {
        roomId: currentRoomId,
        candidate: event.candidate
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection?.connectionState;

    console.log("Voice state:", state);

    if (state === "connected") {
      setStatus("Voice connected!");
    }

    if (state === "failed") {
      setStatus("Voice failed. TURN server may be required.");
    }

    if (state === "disconnected") {
      setStatus("Voice reconnecting...");
    }

    if (state === "closed") {
      setStatus("Voice call ended.");
    }
  };

  return peerConnection;
}

// ======================================
// MICROPHONE
// ======================================

async function ensureLocalAudio() {
  if (localStream) return localStream;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone is not supported.");
  }

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });

  await ensurePeerConnection();

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  return localStream;
}

// ======================================
// START VOICE
// ======================================

async function startVoice() {
  if (!socket?.connected || !isMatched) {
    setStatus("Connect with a stranger first.");
    return;
  }

  try {
    voiceStarted = true;

    setStatus("Requesting microphone permission...");

    await ensureLocalAudio();

    if (voiceBtn) voiceBtn.disabled = true;
    if (muteBtn) muteBtn.disabled = false;
    if (endVoiceBtn) endVoiceBtn.disabled = false;

    setStatus("Microphone ready. Connecting voice...");

    // Only the initiator sends the offer.
    // The other user creates an answer after receiving it.
    // Initiator flag is remembered from matched event.
    // See matched handler below.
    if (isInitiator) {
      await createOffer();
    }
  } catch (error) {
    console.error("Microphone error:", error);

    voiceStarted = false;

    setStatus(
      error.name === "NotAllowedError"
        ? "Please allow microphone permission."
        : "Could not start voice chat."
    );
  }
}

// ======================================
// CREATE OFFER
// ======================================

let isInitiator = false;

// Keep the initiator status from the match.
const originalRegisterSocketEvents = registerSocketEvents;

// ======================================
// OFFER CREATION
// ======================================

async function createOffer() {
  if (!isMatched || !socket?.connected) return;

  try {
    await ensureLocalAudio();
    await ensurePeerConnection();

    if (peerConnection.signalingState !== "stable") return;

    const offer = await peerConnection.createOffer();

    await peerConnection.setLocalDescription(offer);

    socket.emit("offer", {
      roomId: currentRoomId,
      offer: peerConnection.localDescription
    });

    setStatus("Calling stranger...");
  } catch (error) {
    console.error("Create offer error:", error);
    setStatus("Could not start voice call.");
  }
}

// ======================================
// MUTE / UNMUTE
// ======================================

function toggleMute() {
  if (!localStream) return;

  isMuted = !isMuted;

  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted;
  });

  if (muteBtn) {
    muteBtn.textContent = isMuted ? "Unmute" : "Mute";
  }

  setStatus(isMuted ? "Microphone muted." : "Microphone on.");
}

// ======================================
// END VOICE
// ======================================

function endVoice() {
  closeVoiceConnection();

  if (socket?.connected && isMatched) {
    socket.emit("voice-end");
  }

  setStatus("Voice call ended.");
}

// ======================================
// CLEANUP
// ======================================

function closeVoiceConnection() {
  voiceStarted = false;
  isMuted = false;

  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;

    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  if (remoteStream) {
    remoteStream.getTracks().forEach((track) => track.stop());
    remoteStream = null;
  }

  if (remoteAudio) {
    remoteAudio.srcObject = null;
  }

  pendingCandidates = [];

  if (voiceBtn) voiceBtn.disabled = !isMatched;
  if (muteBtn) muteBtn.disabled = true;
  if (endVoiceBtn) endVoiceBtn.disabled = true;
}

// ======================================
// PENDING ICE CANDIDATES
// ======================================

async function processPendingCandidates() {
  if (!peerConnection?.remoteDescription) return;

  const candidates = [...pendingCandidates];
  pendingCandidates = [];

  for (const candidate of candidates) {
    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (error) {
      console.error("Pending ICE error:", error);
    }
  }
}

// ======================================
// MATCH STATE
// ======================================

// Track who should create the initial offer.
function updateInitiator(data) {
  isInitiator = Boolean(data?.initiator);
}

// ======================================
// BUTTON EVENTS
// ======================================

startBtn?.addEventListener("click", startChat);
nextBtn?.addEventListener("click", nextStranger);
disconnectBtn?.addEventListener("click", disconnectChat);

voiceBtn?.addEventListener("click", startVoice);
muteBtn?.addEventListener("click", toggleMute);
endVoiceBtn?.addEventListener("click", endVoice);

// ======================================
// PATCH MATCH HANDLER FOR INITIATOR
// ======================================

// The matched event's initiator value is required for WebRTC.
function attachInitiatorTracking() {
  if (!socket) return;

  socket.on("matched", (data = {}) => {
    updateInitiator(data);
  });
}

// ======================================
// INITIALIZE
// ======================================

connectSocket();

if (muteBtn) muteBtn.disabled = true;
if (endVoiceBtn) endVoiceBtn.disabled = true;

if (nextBtn) nextBtn.disabled = true;
if (disconnectBtn) disconnectBtn.disabled = true;

setStatus("Welcome to TalkToSmile!");
