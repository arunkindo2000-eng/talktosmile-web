import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  onValue,
  push,
  remove,
  runTransaction,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";


const firebaseConfig = {
  apiKey: "AIzaSyCv6ISry_cbpR89phb1D68wkM4V_DHQPQY",
  authDomain: "talktosmile-16bca.firebaseapp.com",
  databaseURL: "https://talktosmile-16bca-default-rtdb.firebaseio.com",
  projectId: "talktosmile-16bca",
  storageBucket: "talktosmile-16bca.appspot.com",
  messagingSenderId: "550139117184",
  appId: "1:550139117184:web:c354dce8e28c8e2144f065"
};


const app = initializeApp(firebaseConfig);
const db = getDatabase(app);


let myId = null;
let myUsername = null;
let roomId = null;
let listening = false;


// START CHAT
async function startChat() {

  if (listening) return;

  const usernameInput = document.getElementById("usernameInput");
  const username = usernameInput.value.trim();

  if (!username) {
    alert("Please enter your username");
    usernameInput.focus();
    return;
  }

  myUsername = username.substring(0, 20);

  myId = "user_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

  listening = true;

  document.getElementById("status").innerText = "Status: Waiting...";


  const myWaitingRef = ref(db, "waiting/" + myId);


  // Add myself to waiting list
  await set(myWaitingRef, {
    id: myId,
    username: myUsername,
    roomId: null,
    partnerUsername: null
  });


  // Remove me automatically if connection closes
  onDisconnect(myWaitingRef).remove();


  // Try to find another waiting user
  await findMatch();


  // Listen to my own waiting entry
  onValue(myWaitingRef, (snapshot) => {

    const data = snapshot.val();

    if (!data || !data.roomId || roomId) return;

    roomId = data.roomId;
    set(ref(db, "rooms/" + roomId), {
  status: "connected"
});
    document.getElementById("status").innerText =
      "Status: Connected with " +
      (data.partnerUsername || "Stranger");


    listenMessages();
    listenRoomStatus();

    // Remove from waiting after connection
    remove(myWaitingRef);
  });
}


// FIND RANDOM MATCH
async function findMatch() {

  const waitingRef = ref(db, "waiting");

  await runTransaction(waitingRef, (currentData) => {

    if (!currentData) {
      return currentData;
    }


    const users = Object.values(currentData);

    const otherUsers = users.filter((user) => {

      return (
        user.id !== myId &&
        !user.roomId
      );

    });


    if (otherUsers.length === 0) {
      return currentData;
    }


    // Random stranger
    const otherUser =
      otherUsers[Math.floor(Math.random() * otherUsers.length)];


    const newRoomId =
      "room_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substring(2, 7);


    // Match both users
    currentData[myId].roomId = newRoomId;
    currentData[myId].partnerUsername = otherUser.username;

    currentData[otherUser.id].roomId = newRoomId;
    currentData[otherUser.id].partnerUsername = myUsername;


    return currentData;

  });
}


// SEND MESSAGE
function sendMessage() {

  const msgInput =
    document.getElementById("msgInput");

  const msg =
    msgInput.value.trim();


  if (!msg || !roomId || !myId) return;


  push(ref(db, "messages/" + roomId), {

    text: msg,
    sender: myId,
    username: myUsername

  });


  msgInput.value = "";
}


// LISTEN MESSAGES
function listenMessages() {

  onValue(
    ref(db, "messages/" + roomId),
    (snapshot) => {

      const box =
        document.getElementById("chatBox");

      box.innerHTML = "";


      const msgs =
        snapshot.val();


      if (!msgs) return;


      Object.values(msgs).forEach((m) => {

        const div =
          document.createElement("div");


        div.innerText =
          (m.sender === myId
            ? "You"
            : m.username) +
          ": " +
          m.text;


        box.appendChild(div);

      });


      box.scrollTop =
        box.scrollHeight;

    }
  );
}


// DISCONNECT
function disconnectChat() {

  if (myId) {
    remove(ref(db, "waiting/" + myId));
  }


  if (roomId) {

    remove(
      ref(db, "messages/" + roomId)
    );

    set(
  ref(db, "rooms/" + roomId + "/status"),
  "disconnected"
);

  }


  myId = null;
  myUsername = null;
  roomId = null;
  listening = false;


  document.getElementById("status").innerText =
    "Status: Stranger disconnected";


  document.getElementById("chatBox").innerHTML =
    "";

}

// LISTEN FOR STRANGER DISCONNECT
function listenRoomStatus() {
  const roomRef = ref(db, "rooms/" + roomId);

  onValue(roomRef, (snapshot) => {
    const room = snapshot.val();

if (room && room.status === "disconnected" && roomId) {
      roomId = null;
      listening = false;
  endVoice();

      document.getElementById("status").innerText =
        "Status: Stranger disconnected";

      document.getElementById("chatBox").innerHTML = "";
    }
  });
}
// BUTTON EVENTS
document.getElementById("startBtn").onclick =
  startChat;

document.getElementById("sendBtn").onclick =
  sendMessage;

document.getElementById("disconnectBtn").onclick =
  disconnectChat;
// VOICE CHAT
let localStream = null;
let peerConnection = null;

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

async function startVoice() {
  if (!roomId) {
    alert("Pehle kisi stranger se connect ho!");
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    document.getElementById("status").innerText =
      "Voice starting...";
      
  } catch (error) {
    alert("Microphone permission allow karo.");
    console.error(error);
  }
}

function muteVoice() {
  if (!localStream) return;

  localStream.getAudioTracks().forEach(track => {
    track.enabled = !track.enabled;
  });
}

function endVoice() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  document.getElementById("status").innerText =
    "Status: Connected with " + (myUsername || "Stranger");
}

// VOICE BUTTONS
document.getElementById("voiceBtn").onclick = startVoice;
document.getElementById("muteBtn").onclick = muteVoice;
document.getElementById("endVoiceBtn").onclick = endVoice;
// ENTER TO SEND MESSAGE
document.getElementById("msgInput").addEventListener("keydown", function(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    sendMessage();
  }
});
