// ======================================================
// TALK TO SMILE - Random Chat + Text Chat + WebRTC Voice
// Firebase Realtime Database signaling (FIXED / BEST VERSION)
// Use as: <script type="module" src="talktosmile.js"></script>
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getDatabase, ref, set, push, remove, onValue, onChildAdded,
  runTransaction, onDisconnect, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ---------------- CONFIG ----------------
const firebaseConfig = {
  apiKey: "AIzaSyCv6ISry_cbpR89phb1D68wkM4V_DHQPQY",
  authDomain: "talktosmile-16bca.firebaseapp.com",
  databaseURL: "https://talktosmile-16bca-default-rtdb.firebaseio.com",
  projectId: "talktosmile-16bca",
  storageBucket: "talktosmile-16bca.appspot.com",
  messagingSenderId: "550139117184",
  appId: "1:550139117184:web:c354dce8e28c8e2144f065"
};

// Mobile data / strict NAT ke liye TURN zaroori hai. Apna server yahan daalo:
// { urls: "turn:YOUR_TURN_HOST:3478", username: "USER", credential: "PASS" }
const TURN_SERVERS = [];

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    ...TURN_SERVERS
  ]
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// ---------------- STATE ----------------
let myId = null, myUsername = "";
let roomId = null, partnerId = null, partnerUsername = null;
let isSearching = false, partnerSeen = false, partnerGone = false;
let session = 0;               // badalta hai jab bhi chat reset hoti hai (stale async rokne ke liye)
let transitioning = false;

let waitingUnsub = null, messageUnsub = null, memberUnsub = null;
let offerUnsub = null, onlineUnsub = null, connectedUnsub = null;
let searchTimer = null, seenTimer = null, lastSend = 0;

// voice
let pc = null, localStream = null;
let activeCallId = null, pendingOffer = null;
let isVoiceActive = false, isMuted = false, voiceBusy = false;
let pendingCandidates = [], callUnsubs = [];
let ringTimer = null, disconnectTimer = null;

// ---------------- ELEMENTS ----------------
const $ = (id) => document.getElementById(id);
const usernameInput = $("usernameInput"), startBtn = $("startBtn"),
  disconnectBtn = $("disconnectBtn"), stopBtn = $("stopBtn"),
  sendBtn = $("sendBtn"), msgInput = $("msgInput"), chatBox = $("chatBox"),
  statusEl = $("status"), onlineCount = $("onlineCount"),
  voiceBtn = $("voiceBtn"), muteBtn = $("muteBtn"), endVoiceBtn = $("endVoiceBtn");

const remoteAudio = $("remoteAudio") || document.createElement("audio");
remoteAudio.autoplay = true;
remoteAudio.setAttribute("playsinline", "");
if (!remoteAudio.isConnected) document.body.appendChild(remoteAudio);

// ---------------- HELPERS ----------------
const setText = (el, t) => { if (el) el.innerText = t; };
const setStatus = (t) => { setText(statusEl, t); console.log("[STATUS]", t); };
const showError = (where, err) => console.error("[ERROR]", where, err);
const unsub = (fn) => { try { if (fn) fn(); } catch (e) { console.log(e); } return null; };
const rand = () => Math.random().toString(36).slice(2, 10);

function getUsername() {
  let name = usernameInput ? usernameInput.value.trim() : "";
  if (!name) name = "Stranger" + Math.floor(Math.random() * 10000);
  name = name.slice(0, 20);
  if (usernameInput) usernameInput.value = name;
  return name;
}

function clearChat() { if (chatBox) chatBox.innerHTML = ""; }

function scrollChat() { if (chatBox) chatBox.scrollTop = chatBox.scrollHeight; }

function addSystemMessage(text) {
  if (!chatBox) return;
  const div = document.createElement("div");
  div.textContent = text;
  Object.assign(div.style, { background: "#7f1d1d", padding: "10px", margin: "5px", borderRadius: "8px" });
  chatBox.appendChild(div);
  scrollChat();
}

function addChatMessage(m) {
  if (!chatBox) return;
  const div = document.createElement("div");
  div.style.padding = "6px 8px";
  const name = document.createElement("b");
  name.textContent = (m.sender === myId ? "You" : (m.username || "Stranger")) + ": ";
  div.append(name, document.createTextNode(m.text || ""));
  chatBox.appendChild(div);
  scrollChat();
}

// ---------------- AUTH + ONLINE COUNTER ----------------
async function init() {
  try {
    const cred = await signInAnonymously(auth);
    myId = cred.user.uid;
  } catch (e) {
    showError("Anonymous Auth (Firebase Console > Authentication > Anonymous enable karo)", e);
    myId = "user_" + Date.now() + "_" + rand();
  }
  startOnlineCounter();
  setStatus("Status: Ready - Start dabao");
}
const ready = init();

function startOnlineCounter() {
  const meRef = ref(db, "onlineUsers/" + myId);

  connectedUnsub = onValue(ref(db, ".info/connected"), async (snap) => {
    if (snap.val() !== true) return;
    try {
      await onDisconnect(meRef).remove();
      await set(meRef, { online: true, lastSeen: Date.now() });
    } catch (e) { showError("Online counter", e); }
  });

  onlineUnsub = onValue(
    ref(db, "onlineUsers"),
    (snap) => setText(onlineCount, snap.exists() ? snap.size : 0),
    (e) => showError("Online listener", e)
  );
}

// ---------------- START CHAT / MATCHING ----------------
async function startChat() {
  if (isSearching) return;

  if (roomId && !partnerGone) {
    setStatus("Status: Already connected - Next dabao");
    return;
  }
  if (roomId && partnerGone) await leaveRoom();   // purana room saaf karo

  await ready;
  if (!myId) return;

  const mySession = ++session;
  myUsername = getUsername();
  roomId = partnerId = partnerUsername = null;
  partnerSeen = partnerGone = false;
  isSearching = true;

  clearChat();
  setStatus("Status: Waiting for stranger...");

  const myWaitingRef = ref(db, "waiting/" + myId);

  try {
    await onDisconnect(myWaitingRef).remove();
    await set(myWaitingRef, {
      id: myId, username: myUsername,
      roomId: "", partnerId: "", partnerUsername: "",
      createdAt: Date.now()
    });

    if (mySession !== session) {           // beech mein cancel ho gaya
      remove(myWaitingRef).catch(() => {});
      return;
    }

    // Match hamesha is listener se handle hota hai (single path)
    waitingUnsub = onValue(myWaitingRef, (snap) => {
      const data = snap.val();
      if (!data || !data.roomId || roomId || mySession !== session) return;
      onMatched(data, mySession);
    }, (e) => showError("Waiting listener", e));

    await findMatch(mySession);
    searchTimer = setInterval(() => findMatch(mySession), 4000);   // retry
  } catch (e) {
    showError("Start Chat", e);
    isSearching = false;
    setStatus("Status: Error starting chat");
    remove(myWaitingRef).catch(() => {});
  }
}

async function findMatch(mySession) {
  if (!myId || !isSearching || mySession !== session) return;

  try {
    await runTransaction(ref(db, "waiting"), (data) => {
      if (!data || !data[myId] || data[myId].roomId) return data;

      const others = Object.values(data).filter(
        (u) => u && u.id && u.id !== myId && !u.roomId
      );
      if (!others.length) return data;

      const s = others[Math.floor(Math.random() * others.length)];
      const newRoom = "room_" + Date.now() + "_" + rand();

      data[myId].roomId = newRoom;
      data[myId].partnerId = s.id;
      data[myId].partnerUsername = s.username || "Stranger";

      data[s.id].roomId = newRoom;
      data[s.id].partnerId = myId;
      data[s.id].partnerUsername = myUsername || "Stranger";
      return data;
    });
  } catch (e) { showError("Find Match", e); }
}

async function onMatched(data, mySession) {
  roomId = data.roomId;
  partnerId = data.partnerId || null;
  partnerUsername = data.partnerUsername || "Stranger";
  isSearching = false;
  clearInterval(searchTimer);
  waitingUnsub = unsub(waitingUnsub);

  setStatus("Status: Connected with " + partnerUsername);

  await startRoom(mySession);
  remove(ref(db, "waiting/" + myId)).catch((e) => showError("Remove waiting", e));
}

// ---------------- ROOM ----------------
async function startRoom(mySession) {
  const room = roomId;
  if (!room || !myId || !partnerId) return;

  const memberRef = ref(db, `rooms/${room}/members/${myId}`);
  try {
    await onDisconnect(memberRef).remove();
    await set(memberRef, { id: myId, username: myUsername, joinedAt: Date.now() });
  } catch (e) { showError("Room member", e); }

  if (mySession !== session || roomId !== room) return;

  listenRoomStatus(room);
  listenMessages(room);
  listenCallOffers(room);
}

function listenRoomStatus(room) {
  partnerSeen = false;
  const pRef = ref(db, `rooms/${room}/members/${partnerId}`);

  // Partner kabhi join hi nahi hua to 15s baad disconnected maan lo
  seenTimer = setTimeout(() => {
    if (roomId === room && !partnerSeen) handlePartnerDisconnected();
  }, 15000);

  memberUnsub = onValue(pRef, (snap) => {
    if (roomId !== room) return;
    if (snap.exists()) {
      partnerSeen = true;
      clearTimeout(seenTimer);
      return;
    }
    if (partnerSeen) handlePartnerDisconnected();   // pehle tha, ab nahi => left
  }, (e) => showError("Room status", e));
}

function handlePartnerDisconnected() {
  if (!roomId || partnerGone) return;
  partnerGone = true;
  clearTimeout(seenTimer);
  memberUnsub = unsub(memberUnsub);

  const name = partnerUsername || "Stranger";
  stopVoice(false, false);
  addSystemMessage("⚠️ " + name + " disconnected.");
  setStatus("Status: Stranger disconnected - Next dabao");
}

// ---------------- MESSAGES ----------------
async function sendMessage() {
  if (!msgInput) return;
  const text = msgInput.value.trim().slice(0, 500);
  if (!text) return;

  if (!roomId || partnerGone) {
    alert("Pehle stranger se connect ho.");
    return;
  }

  const now = Date.now();
  if (now - lastSend < 400) return;   // spam limit
  lastSend = now;

  msgInput.value = "";
  msgInput.focus();

  try {
    await push(ref(db, "messages/" + roomId), {
      text, sender: myId, username: myUsername, timestamp: now
    });
  } catch (e) {
    showError("Send message", e);
    msgInput.value = text;
  }
}

function listenMessages(room) {
  messageUnsub = unsub(messageUnsub);
  messageUnsub = onChildAdded(
    query(ref(db, "messages/" + room), limitToLast(100)),
    (snap) => {
      if (roomId !== room) return;
      const m = snap.val();
      if (m) addChatMessage(m);
    },
    (e) => showError("Messages", e)
  );
}

// ======================================================
// VOICE (WebRTC)
// Caller = jo "Start Voice" dabaye. Dusre ko "Accept Call" dikhta hai.
// Signaling: calls/<room>/offer, /answer, /candidates/<callId>/<uid>
// ======================================================

function createPeerConnection(callId) {
  const conn = new RTCPeerConnection(RTC_CONFIG);

  conn.ontrack = (e) => {
    if (e.streams && e.streams[0]) remoteAudio.srcObject = e.streams[0];
    remoteAudio.play().catch((err) => console.log("Audio play waiting:", err));
  };

  conn.onicecandidate = (e) => {
    if (!e.candidate || !roomId || !myId) return;
    push(ref(db, `calls/${roomId}/candidates/${callId}/${myId}`), e.candidate.toJSON())
      .catch((err) => showError("ICE candidate", err));
  };

  conn.onconnectionstatechange = () => {
    if (pc !== conn) return;
    const st = conn.connectionState;
    clearTimeout(disconnectTimer);

    if (st === "connected") {
      isVoiceActive = true;
      clearTimeout(ringTimer);
      setStatus("Status: Voice connected with " + (partnerUsername || "Stranger"));
      setText(voiceBtn, "🎙️ Voice Connected");
    } else if (st === "failed") {
      stopVoice(false).then(() => setStatus("Status: Voice failed - dobara try karo"));
    } else if (st === "disconnected") {
      disconnectTimer = setTimeout(() => {
        if (pc === conn && conn.connectionState === "disconnected") stopVoice(true);
      }, 5000);
    }
  };

  return conn;
}

async function getMic() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
  } catch (e) {
    showError("Microphone", e);
    alert(e && e.name === "NotAllowedError"
      ? "Microphone permission allow karo."
      : "Mic nahi mila ya voice start nahi ho paaya (site HTTPS pe honi chahiye).");
    return null;
  }
}

function releaseMic() {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
}

async function flushCandidates() {
  const list = pendingCandidates;
  pendingCandidates = [];
  for (const c of list) {
    try { if (pc) await pc.addIceCandidate(c); } catch (e) { console.log("ICE error:", e); }
  }
}

function listenRemoteCandidates(room, callId) {
  callUnsubs.push(onChildAdded(
    ref(db, `calls/${room}/candidates/${callId}/${partnerId}`),
    async (snap) => {
      const cand = snap.val();
      if (!cand || !pc) return;
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(cand); } catch (e) { console.log("ICE error:", e); }
      } else {
        pendingCandidates.push(cand);   // remote description aane tak queue
      }
    }
  ));
}

function listenAnswer(room, callId) {
  callUnsubs.push(onValue(ref(db, `calls/${room}/answer`), async (snap) => {
    const a = snap.val();
    if (!a || a.callId !== callId || !pc || pc.remoteDescription) return;
    try {
      await pc.setRemoteDescription({ type: a.type, sdp: a.sdp });
      await flushCandidates();
    } catch (e) { showError("Set answer", e); }
  }));
}

// Room-level: incoming offer / remote end detect
function listenCallOffers(room) {
  offerUnsub = unsub(offerUnsub);
  offerUnsub = onValue(ref(db, `calls/${room}/offer`), (snap) => {
    if (roomId !== room) return;
    const offer = snap.val();

    if (offer) {
      if (offer.from === myId || activeCallId || pendingOffer) return;
      pendingOffer = offer;
      setText(voiceBtn, "📞 Accept Call");
      setStatus("Status: " + (partnerUsername || "Stranger") + " voice call kar raha hai - Accept dabao");
    } else if (activeCallId || pendingOffer) {
      stopVoice(true, false);   // dusre side ne call end kar di
    }
  });
}

async function startVoice() {
  if (!roomId || !partnerId || partnerGone) {
    alert("Pehle stranger se connect ho.");
    return;
  }
  if (pendingOffer) return acceptCall();
  if (activeCallId || voiceBusy) return;

  voiceBusy = true;
  const room = roomId;

  try {
    localStream = await getMic();
    if (!localStream) return;
    if (roomId !== room || partnerGone) { releaseMic(); return; }

    const callId = "call_" + Date.now();
    activeCallId = callId;
    pc = createPeerConnection(callId);
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    listenAnswer(room, callId);
    listenRemoteCandidates(room, callId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await set(ref(db, `calls/${room}/offer`), {
      callId, from: myId, type: offer.type, sdp: offer.sdp
    });

    setText(voiceBtn, "🎙️ Calling...");
    setStatus("Status: Calling...");

    ringTimer = setTimeout(() => {
      if (activeCallId === callId && !isVoiceActive) {
        stopVoice(false).then(() => setStatus("Status: Call ka jawab nahi aaya"));
      }
    }, 30000);
  } catch (e) {
    showError("Start Voice", e);
    await stopVoice(true);
    alert("Voice start nahi ho paaya.");
  } finally {
    voiceBusy = false;
  }
}

async function acceptCall() {
  const offer = pendingOffer;
  if (!offer || voiceBusy) return;

  voiceBusy = true;
  const room = roomId;

  try {
    localStream = await getMic();
    if (!localStream) return;   // pendingOffer bacha hai, user dobara try kar sakta hai
    if (pendingOffer !== offer || roomId !== room) { releaseMic(); return; }

    pendingOffer = null;
    activeCallId = offer.callId;
    pc = createPeerConnection(offer.callId);
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

    listenRemoteCandidates(room, offer.callId);

    await pc.setRemoteDescription({ type: offer.type, sdp: offer.sdp });
    await flushCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await set(ref(db, `calls/${room}/answer`), {
      callId: offer.callId, from: myId, type: answer.type, sdp: answer.sdp
    });

    setText(voiceBtn, "🎙️ Connecting...");
    setStatus("Status: Connecting voice...");
  } catch (e) {
    showError("Accept Call", e);
    await stopVoice(true);
    alert("Call accept nahi ho paayi.");
  } finally {
    voiceBusy = false;
  }
}

function toggleMute() {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
  setText(muteBtn, isMuted ? "🔇 Unmute" : "🔊 Mute");
}

// signal=true => calls/<room> hata do taaki dusre side ko pata chale
async function stopVoice(updateStatus = true, signal = true) {
  const hadCall = !!(activeCallId || pendingOffer || pc || localStream);
  const room = roomId;

  clearTimeout(ringTimer);
  clearTimeout(disconnectTimer);
  callUnsubs.forEach((u) => unsub(u));
  callUnsubs = [];

  isVoiceActive = false;
  isMuted = false;
  activeCallId = null;
  pendingOffer = null;
  pendingCandidates = [];

  releaseMic();

  if (pc) {
    const c = pc;
    pc = null;
    c.ontrack = c.onicecandidate = c.onconnectionstatechange = null;
    try { c.close(); } catch (e) { console.log(e); }
  }

  remoteAudio.srcObject = null;
  setText(voiceBtn, "🎙️ Start Voice");
  setText(muteBtn, "🔊 Mute");

  if (updateStatus && roomId && !partnerGone) {
    setStatus("Status: Connected with " + (partnerUsername || "Stranger"));
  }

  if (signal && room && hadCall) {
    try { await remove(ref(db, "calls/" + room)); }
    catch (e) { console.log("Call cleanup:", e); }
  }
}

// ======================================================
// LEAVE / NEXT / DISCONNECT
// ======================================================

async function leaveRoom() {
  session++;   // pending async kaam cancel
  clearInterval(searchTimer);
  clearTimeout(seenTimer);
  waitingUnsub = unsub(waitingUnsub);
  messageUnsub = unsub(messageUnsub);
  memberUnsub = unsub(memberUnsub);
  offerUnsub = unsub(offerUnsub);

  const room = roomId, me = myId, gone = partnerGone;

  await stopVoice(false, true);

  roomId = partnerId = partnerUsername = null;
  partnerSeen = partnerGone = false;
  isSearching = false;

  if (me) remove(ref(db, "waiting/" + me)).catch(() => {});

  if (room && me) {
    try {
      if (gone) {
        // Dusra pehle hi ja chuka hai => poora room saaf (membership wala node aakhir mein)
        await remove(ref(db, "messages/" + room));
        await remove(ref(db, "calls/" + room));
        await remove(ref(db, "rooms/" + room));
      } else {
        await remove(ref(db, `rooms/${room}/members/${me}`));
      }
    } catch (e) { console.log("Room cleanup:", e); }
  }
}

async function nextStranger() {
  if (transitioning) return;
  transitioning = true;
  try {
    await leaveRoom();
    clearChat();
    setStatus("Status: Finding next stranger...");
    await startChat();
  } finally {
    transitioning = false;
  }
}

async function disconnectChat() {
  if (transitioning) return;
  transitioning = true;
  try {
    await leaveRoom();
    clearChat();
    setStatus("Status: Disconnected");
  } finally {
    transitioning = false;
  }
}

// ======================================================
// EVENTS (har button sirf ek baar bind hota hai)
// ======================================================

if (startBtn) startBtn.addEventListener("click", startChat);
if (disconnectBtn) disconnectBtn.addEventListener("click", nextStranger);
if (stopBtn) stopBtn.addEventListener("click", disconnectChat);   // optional button
if (sendBtn) sendBtn.addEventListener("click", sendMessage);
if (voiceBtn) voiceBtn.addEventListener("click", startVoice);
if (muteBtn) muteBtn.addEventListener("click", toggleMute);
if (endVoiceBtn) endVoiceBtn.addEventListener("click", () => stopVoice(true));

if (msgInput) {
  msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

window.addEventListener("error", (e) => console.error("GLOBAL ERROR:", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("UNHANDLED PROMISE:", e.reason));

console.log("TALK TO SMILE READY - Random Chat + Text + Voice");
