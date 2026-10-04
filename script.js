// ======================================================
// TALK TO SMILE
// Random Chat + Username + Text Chat
// Partner Disconnect Detection
// WebRTC Voice Call
// Firebase Realtime Database
// ======================================================


// ======================================================
// FIREBASE IMPORTS
// ======================================================

import { initializeApp } from
"https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  onValue,
  push,
  remove,
  runTransaction,
  onDisconnect,
  onChildAdded
} from
"https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";


// ======================================================
// FIREBASE CONFIG
// ======================================================

const firebaseConfig = {

  apiKey:
    "AIzaSyCv6ISry_cbpR89phb1D68wkM4V_DHQPQY",

  authDomain:
    "talktosmile-16bca.firebaseapp.com",

  databaseURL:
    "https://talktosmile-16bca-default-rtdb.firebaseio.com",

  projectId:
    "talktosmile-16bca",

  storageBucket:
    "talktosmile-16bca.appspot.com",

  messagingSenderId:
    "550139117184",

  appId:
    "1:550139117184:web:c354dce8e28c8e2144f065"

};


// ======================================================
// FIREBASE INITIALIZE
// ======================================================

const app = initializeApp(firebaseConfig);

const db = getDatabase(app);


// ======================================================
// VARIABLES
// ======================================================

let myId = null;
let myUsername = null;

let roomId = null;
let partnerId = null;
let partnerUsername = null;

let isSearching = false;

let messageListenerStarted = false;
let onlineListenerStarted = false;
let roomPresenceStarted = false;

let partnerWasOnline = false;
let disconnectHandled = false;


// ======================================================
// WEBRTC VARIABLES
// ======================================================

let peerConnection = null;
let localStream = null;

let isMuted = false;
let voiceCallActive = false;
let callListenersStarted = false;

let remoteAudio = null;


// ======================================================
// WEBRTC CONFIG
// ======================================================

const rtcConfig = {

  iceServers: [

    {
      urls:
        "stun:stun.l.google.com:19302"
    },

    {
      urls:
        "stun:stun1.l.google.com:19302"
    }

  ]

};


// ======================================================
// HTML ELEMENTS
// ======================================================

const usernameInput =
  document.getElementById("usernameInput");

const startBtn =
  document.getElementById("startBtn");

const disconnectBtn =
  document.getElementById("disconnectBtn");

const sendBtn =
  document.getElementById("sendBtn");

const msgInput =
  document.getElementById("msgInput");

const chatBox =
  document.getElementById("chatBox");

const status =
  document.getElementById("status");

const onlineCount =
  document.getElementById("onlineCount");


// VOICE BUTTONS

const startVoiceBtn =
  document.getElementById("startVoiceBtn");

const muteBtn =
  document.getElementById("muteBtn");

const endVoiceBtn =
  document.getElementById("endVoiceBtn");


// ======================================================
// REMOTE AUDIO ELEMENT
// ======================================================

function createRemoteAudio() {

  if (remoteAudio) {
    return;
  }

  remoteAudio =
    document.getElementById("remoteAudio");

  if (!remoteAudio) {

    remoteAudio =
      document.createElement("audio");

    remoteAudio.id =
      "remoteAudio";

    remoteAudio.autoplay =
      true;

    remoteAudio.playsInline =
      true;

    remoteAudio.style.display =
      "none";

    document.body.appendChild(
      remoteAudio
    );

  }

}


// ======================================================
// STATUS
// ======================================================

function setStatus(text) {

  if (status) {
    status.innerText = text;
  }

}


// ======================================================
// USER ID
// ======================================================

function createUserId() {

  return (
    "user_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .substring(2, 10)
  );

}


// ======================================================
// USERNAME
// ======================================================

function getUsername() {

  let username = "";

  if (usernameInput) {

    username =
      usernameInput.value.trim();

  }


  if (!username) {

    username =
      "Stranger" +
      Math.floor(
        Math.random() * 10000
      );

  }


  username =
    username.substring(0, 20);


  if (usernameInput) {

    usernameInput.value =
      username;

  }


  return username;

}


// ======================================================
// ERROR HANDLER
// ======================================================

function firebaseError(
  location,
  error
) {

  console.error(
    "Firebase error:",
    location,
    error
  );

}


// ======================================================
// ONLINE COUNTER
// ======================================================

function startOnlineCounter() {

  if (!myId) return;

  if (onlineListenerStarted) {
    return;
  }

  onlineListenerStarted =
    true;


  const myOnlineRef =
    ref(
      db,
      "onlineUsers/" +
      myId
    );


  const connectedRef =
    ref(
      db,
      ".info/connected"
    );


  onValue(
    connectedRef,
    async (snapshot) => {

      if (
        snapshot.val() !== true
      ) {

        return;

      }


      try {

        await set(
          myOnlineRef,
          {
            id: myId,
            username: myUsername,
            online: true,
            lastSeen: Date.now()
          }
        );


        await onDisconnect(
          myOnlineRef
        ).remove();

      } catch (error) {

        firebaseError(
          "online counter",
          error
        );

      }

    }
  );


  onValue(
    ref(
      db,
      "onlineUsers"
    ),
    (snapshot) => {

      const users =
        snapshot.val();

      const count =
        users
          ? Object.keys(users).length
          : 0;


      if (onlineCount) {

        onlineCount.innerText =
          count;

      }

    }
  );

}


// ======================================================
// START CHAT
// ======================================================

async function startChat() {

  if (!db) {
    return;
  }


  if (isSearching) {
    return;
  }


  myUsername =
    getUsername();


  myId =
    createUserId();


  roomId =
    null;

  partnerId =
    null;

  partnerUsername =
    null;


  isSearching =
    true;

  disconnectHandled =
    false;

  partnerWasOnline =
    false;

  messageListenerStarted =
    false;

  onlineListenerStarted =
    false;

  roomPresenceStarted =
    false;

  callListenersStarted =
    false;


  stopVoiceCall(false);


  if (chatBox) {

    chatBox.innerHTML =
      "";

  }


  setStatus(
    "Status: Waiting for stranger..."
  );


  startOnlineCounter();


  try {

    const myWaitingRef =
      ref(
        db,
        "waiting/" +
        myId
      );


    // ------------------------------------------
    // ADD TO WAITING
    // ------------------------------------------

    await set(
      myWaitingRef,
      {
        id: myId,
        username: myUsername,
        roomId: null,
        partnerId: null,
        partnerUsername: null
      }
    );


    // ------------------------------------------
    // AUTO REMOVE
    // ------------------------------------------

    await onDisconnect(
      myWaitingRef
    ).remove();


    // ------------------------------------------
    // LISTEN FOR MATCH
    // ------------------------------------------

    onValue(
      myWaitingRef,
      async (snapshot) => {

        const data =
          snapshot.val();


        if (!data) {
          return;
        }


        if (!data.roomId) {
          return;
        }


        if (roomId) {
          return;
        }


        // --------------------------------------
        // MATCH FOUND
        // --------------------------------------

        roomId =
          data.roomId;


        partnerId =
          data.partnerId || null;


        partnerUsername =
          data.partnerUsername ||
          "Stranger";


        isSearching =
          false;


        setStatus(
          "Status: Connected with " +
          partnerUsername
        );


        console.log(
          "CONNECTED:",
          roomId,
          partnerId
        );


        // --------------------------------------
        // ROOM PRESENCE
        // --------------------------------------

        await setupRoomPresence();


        // --------------------------------------
        // MESSAGES
        // --------------------------------------

        listenMessages();


        // --------------------------------------
        // VOICE SIGNALING
        // --------------------------------------

        setupVoiceSignaling();


        // --------------------------------------
        // REMOVE WAITING
        // --------------------------------------

        try {

          await remove(
            myWaitingRef
          );

        } catch (error) {

          console.error(
            "Waiting remove error:",
            error
          );

        }

      }
    );


    // ------------------------------------------
    // FIND RANDOM USER
    // ------------------------------------------

    await findMatch();


  } catch (error) {

    console.error(
      "Start chat error:",
      error
    );


    isSearching =
      false;


    setStatus(
      "Status: Firebase Error"
    );


    alert(
      "Firebase error: " +
      error.message
    );

  }

}


// ======================================================
// FIND RANDOM MATCH
// ======================================================

async function findMatch() {

  const waitingRef =
    ref(
      db,
      "waiting"
    );


  try {

    await runTransaction(
      waitingRef,
      (currentData) => {

        if (!currentData) {
          return currentData;
        }


        const users =
          Object.values(
            currentData
          );


        const availableUsers =
          users.filter(
            (user) => {

              return (
                user &&
                user.id &&
                user.id !== myId &&
                !user.roomId
              );

            }
          );


        if (
          availableUsers.length === 0
        ) {

          return currentData;

        }


        const stranger =
          availableUsers[
            Math.floor(
              Math.random() *
              availableUsers.length
            )
          ];


        if (
          !currentData[myId] ||
          !currentData[stranger.id]
        ) {

          return currentData;

        }


        const newRoomId =
          "room_" +
          Date.now() +
          "_" +
          Math.random()
            .toString(36)
            .substring(2, 8);


        // ME

        currentData[myId].roomId =
          newRoomId;

        currentData[myId].partnerId =
          stranger.id;

        currentData[myId]
          .partnerUsername =
          stranger.username ||
          "Stranger";


        // STRANGER

        currentData[stranger.id].roomId =
          newRoomId;

        currentData[stranger.id].partnerId =
          myId;

        currentData[stranger.id]
          .partnerUsername =
          myUsername ||
          "Stranger";


        return currentData;

      }
    );

  } catch (error) {

    firebaseError(
      "findMatch",
      error
    );

  }

}


// ======================================================
// ROOM PRESENCE
// THIS DETECTS PARTNER DISCONNECT
// ======================================================

async function setupRoomPresence() {

  if (!roomId || !myId) {
    return;
  }


  if (roomPresenceStarted) {
    return;
  }


  roomPresenceStarted =
    true;


  const myPresenceRef =
    ref(
      db,
      "rooms/" +
      roomId +
      "/users/" +
      myId
    );


  try {

    await set(
      myPresenceRef,
      {
        id: myId,
        username: myUsername,
        online: true,
        joinedAt: Date.now()
      }
    );


    // ------------------------------------------
    // REMOVE AUTOMATICALLY WHEN DISCONNECTED
    // ------------------------------------------

    await onDisconnect(
      myPresenceRef
    ).remove();


  } catch (error) {

    console.error(
      "Presence setup error:",
      error
    );

  }


  // --------------------------------------------
  // LISTEN TO ROOM USERS
  // --------------------------------------------

  onValue(
    ref(
      db,
      "rooms/" +
      roomId +
      "/users"
    ),
    (snapshot) => {

      const users =
        snapshot.val() || {};


      // Partner is currently online
      if (
        partnerId &&
        users[partnerId]
      ) {

        partnerWasOnline =
          true;

        return;

      }


      // ----------------------------------------
      // PARTNER DISCONNECTED
      // ----------------------------------------

      if (
        partnerWasOnline &&
        partnerId &&
        !users[partnerId] &&
        !disconnectHandled
      ) {

        disconnectHandled =
          true;


        console.log(
          "PARTNER DISCONNECTED"
        );


        handlePartnerDisconnected();

      }

    }
  );

}


// ======================================================
// PARTNER DISCONNECTED
// ======================================================

async function handlePartnerDisconnected() {

  stopVoiceCall(false);


  setStatus(
    "Status: Stranger disconnected"
  );


  if (chatBox) {

    const div =
      document.createElement(
        "div"
      );


    div.innerText =
      "⚠️ Stranger disconnected.";


    div.style.color =
      "#ff5252";

    div.style.fontWeight =
      "bold";


    chatBox.appendChild(
      div
    );

  }


  alert(
    "⚠️ Stranger disconnected."
  );


  roomId =
    null;

  partnerId =
    null;

  partnerUsername =
    null;

  isSearching =
    false;

}


// ======================================================
// SEND MESSAGE
// ======================================================

async function sendMessage() {

  if (!msgInput) {
    return;
  }


  const message =
    msgInput.value.trim();


  if (!message) {
    return;
  }


  if (!roomId) {

    alert(
      "Pehle stranger se connect ho."
    );

    return;

  }


  try {

    await push(
      ref(
        db,
        "messages/" +
        roomId
      ),
      {
        text: message,
        sender: myId,
        username: myUsername,
        timestamp: Date.now()
      }
    );


    msgInput.value =
      "";

    msgInput.focus();

  } catch (error) {

    firebaseError(
      "sendMessage",
      error
    );

  }

}


// ======================================================
// RECEIVE MESSAGES
// ======================================================

function listenMessages() {

  if (!roomId) {
    return;
  }


  if (messageListenerStarted) {
    return;
  }


  messageListenerStarted =
    true;


  const currentRoom =
    roomId;


  onValue(
    ref(
      db,
      "messages/" +
      currentRoom
    ),
    (snapshot) => {

      if (
        roomId !== currentRoom
      ) {

        return;

      }


      if (!chatBox) {
        return;
      }


      chatBox.innerHTML =
        "";


      const messages =
        snapshot.val();


      if (!messages) {
        return;
      }


      const list =
        Object.values(
          messages
        );


      list.sort(
        (a, b) =>
          (a.timestamp || 0) -
          (b.timestamp || 0)
      );


      list.forEach(
        (message) => {

          const div =
            document.createElement(
              "div"
            );


          const name =
            message.sender === myId
              ? "You"
              : (
                  message.username ||
                  "Stranger"
                );


          div.innerText =
            name +
            ": " +
            (
              message.text ||
              ""
            );


          chatBox.appendChild(
            div
          );

        }
      );


      chatBox.scrollTop =
        chatBox.scrollHeight;

    }
  );

}


// ======================================================
// WEBRTC
// VOICE SIGNALING
// ======================================================

function setupVoiceSignaling() {

  if (
    !roomId ||
    !myId ||
    !partnerId
  ) {

    console.log(
      "Voice signaling waiting for partner ID"
    );

    return;

  }


  if (callListenersStarted) {
    return;
  }


  callListenersStarted =
    true;


  createRemoteAudio();


  const callRef =
    ref(
      db,
      "calls/" +
      roomId
    );


  // --------------------------------------------
  // OFFER LISTENER
  // --------------------------------------------

  onValue(
    ref(
      db,
      "calls/" +
      roomId +
      "/offer"
    ),
    async (snapshot) => {

      const offer =
        snapshot.val();


      if (!offer) {
        return;
      }


      try {

        if (!peerConnection) {

          await preparePeerConnection();

        }


        if (
          !peerConnection
            .currentRemoteDescription
        ) {

          await peerConnection
            .setRemoteDescription(
              new RTCSessionDescription(
                offer
              )
            );


          const answer =
            await peerConnection
              .createAnswer();


          await peerConnection
            .setLocalDescription(
              answer
            );


          await set(
            ref(
              db,
              "calls/" +
              roomId +
              "/answer"
            ),
            {
              type:
                answer.type,

              sdp:
                answer.sdp
            }
          );


          voiceCallActive =
            true;


          setStatus(
            "📞 Voice connected with " +
            partnerUsername
          );

        }

      } catch (error) {

        console.error(
          "Offer error:",
          error
        );

      }

    }
  );


  // --------------------------------------------
  // ANSWER LISTENER
  // --------------------------------------------

  onValue(
    ref(
      db,
      "calls/" +
      roomId +
      "/answer"
    ),
    async (snapshot) => {

      const answer =
        snapshot.val();


      if (!answer) {
        return;
      }


      if (!peerConnection) {
        return;
      }


      try {

        if (
          !peerConnection
            .currentRemoteDescription
        ) {

          await peerConnection
            .setRemoteDescription(
              new RTCSessionDescription(
                answer
              )
            );

        }

      } catch (error) {

        console.error(
          "Answer error:",
          error
        );

      }

    }
  );


  // --------------------------------------------
  // REMOTE ICE CANDIDATES
  // --------------------------------------------

  onChildAdded(
    ref(
      db,
      "calls/" +
      roomId +
      "/candidates/" +
      partnerId
    ),
    async (snapshot) => {

      const candidate =
        snapshot.val();


      if (!candidate) {
        return;
      }


      if (!peerConnection) {

        await preparePeerConnection();

      }


      try {

        await peerConnection
          .addIceCandidate(
            new RTCIceCandidate(
              candidate
            )
          );

      } catch (error) {

        console.error(
          "ICE candidate error:",
          error
        );

      }

    }
  );


  // --------------------------------------------
  // CALL STATUS
  // --------------------------------------------

  onValue(
    ref(
      db,
      "calls/" +
      roomId +
      "/status"
    ),
    (snapshot) => {

      const callStatus =
        snapshot.val();


      if (
        callStatus ===
        "ended"
      ) {

        stopVoiceCall(
          false
        );

        setStatus(
          "Status: Voice call ended"
        );

      }

    }
  );


  console.log(
    "Voice signaling ready:",
    callRef.toString()
  );

}


// ======================================================
// PREPARE WEBRTC
// ======================================================

async function preparePeerConnection() {

  if (peerConnection) {
    return peerConnection;
  }


  createRemoteAudio();


  peerConnection =
    new RTCPeerConnection(
      rtcConfig
    );


  // --------------------------------------------
  // REMOTE AUDIO
  // --------------------------------------------

  peerConnection.ontrack =
    (event) => {

      if (
        remoteAudio &&
        event.streams &&
        event.streams[0]
      ) {

        remoteAudio.srcObject =
          event.streams[0];


        remoteAudio
          .play()
          .catch(
            (error) => {

              console.log(
                "Audio play waiting:",
                error
              );

            }
          );

      }

    };


  // --------------------------------------------
  // ICE CANDIDATE
  // --------------------------------------------

  peerConnection.onicecandidate =
    async (event) => {

      if (
        !event.candidate ||
        !roomId ||
        !myId
      ) {

        return;

      }


      try {

        await push(
          ref(
            db,
            "calls/" +
            roomId +
            "/candidates/" +
            myId
          ),
          event.candidate.toJSON()
        );

      } catch (error) {

        console.error(
          "Send ICE error:",
          error
        );

      }

    };


  // --------------------------------------------
  // CONNECTION STATE
  // --------------------------------------------

  peerConnection.onconnectionstatechange =
    () => {

      console.log(
        "Voice connection:",
        peerConnection.connectionState
      );


      if (
        peerConnection.connectionState ===
        "connected"
      ) {

        voiceCallActive =
          true;


        setStatus(
          "📞 Voice call connected"
        );

      }


      if (
        peerConnection.connectionState ===
        "disconnected" ||
        peerConnection.connectionState ===
        "failed"
      ) {

        setStatus(
          "📞 Voice connection lost"
        );

      }

    };


  // --------------------------------------------
  // ADD LOCAL AUDIO
  // --------------------------------------------

  if (!localStream) {

    localStream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: false
        });

  }


  localStream
    .getTracks()
    .forEach(
      (track) => {

        peerConnection.addTrack(
          track,
          localStream
        );

      }
    );


  return peerConnection;

}


// ======================================================
// START VOICE CALL
// ======================================================

async function startVoiceCall() {

  if (!roomId) {

    alert(
      "Pehle stranger se connect ho."
    );

    return;

  }


  if (!partnerId) {

    alert(
      "Partner information missing."
    );

    return;

  }


  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {

    alert(
      "Microphone/WebRTC browser mein available nahi hai."
    );

    return;

  }


  try {

    createRemoteAudio();


    // ------------------------------------------
    // MICROPHONE
    // ------------------------------------------

    if (!localStream) {

      localStream =
        await navigator.mediaDevices
          .getUserMedia({
            audio: true,
            video: false
          });

    }


    // ------------------------------------------
    // PEER CONNECTION
    // ------------------------------------------

    await preparePeerConnection();


    // ------------------------------------------
    // RESET OLD CALL SIGNALING
    // ------------------------------------------

    await remove(
      ref(
        db,
        "calls/" +
        roomId +
        "/offer"
      )
    );


    await remove(
      ref(
        db,
        "calls/" +
        roomId +
        "/answer"
      )
    );


    await remove(
      ref(
        db,
        "calls/" +
        roomId +
        "/candidates/" +
        myId
      )
    );


    await remove(
      ref(
        db,
        "calls/" +
        roomId +
        "/candidates/" +
        partnerId
      )
    );


    await set(
      ref(
        db,
        "calls/" +
        roomId +
        "/status"
      ),
      "calling"
    );


    // ------------------------------------------
    // DETERMINISTIC CALLER
    // ------------------------------------------

    const iAmCaller =
      String(myId) <
      String(partnerId);


    if (iAmCaller) {

      // ----------------------------------------
      // CREATE OFFER
      // ----------------------------------------

      const offer =
        await peerConnection
          .createOffer();


      await peerConnection
        .setLocalDescription(
          offer
        );


      await set(
        ref(
          db,
          "calls/" +
          roomId +
          "/offer"
        ),
        {
          type:
            offer.type,

          sdp:
            offer.sdp
        }
      );


      setStatus(
        "📞 Calling " +
        partnerUsername +
        "..."
      );

    } else {

      setStatus(
        "📞 Waiting for voice connection..."
      );

    }

  } catch (error) {

    console.error(
      "VOICE CALL ERROR:",
      error
    );


    if (
      error.name ===
      "NotAllowedError"
    ) {

      alert(
        "Microphone permission denied.\n\n" +
        "Browser settings mein microphone permission Allow karo."
      );

    } else {

      alert(
        "Voice call error:\n" +
        error.message
      );

    }

  }

}


// ======================================================
// MUTE / UNMUTE
// ======================================================

function toggleMute() {

  if (!localStream) {

    alert(
      "Pehle Start Voice dabao."
    );

    return;

  }


  const audioTracks =
    localStream.getAudioTracks();


  if (
    audioTracks.length === 0
  ) {

    return;

  }


  isMuted =
    !isMuted;


  audioTracks.forEach(
    (track) => {

      track.enabled =
        !isMuted;

    }
  );


  if (muteBtn) {

    muteBtn.innerText =
      isMuted
        ? "🔊 Unmute"
        : "🔇 Mute";

  }


  setStatus(
    isMuted
      ? "🔇 Microphone muted"
      : "🎙️ Microphone on"
  );

}


// ======================================================
// END VOICE CALL
// ======================================================

async function endVoiceCall() {

  if (!roomId) {

    stopVoiceCall(
      false
    );

    return;

  }


  try {

    await set(
      ref(
        db,
        "calls/" +
        roomId +
        "/status"
      ),
      "ended"
    );

  } catch (error) {

    console.error(
      "End call signaling error:",
      error
    );

  }


  stopVoiceCall(
    false
  );


  setStatus(
    "Status: Voice call ended"
  );

}


// ======================================================
// STOP VOICE CALL
// ======================================================

function stopVoiceCall(
  notifyFirebase = false
) {

  // --------------------------------------------
  // STOP MICROPHONE
  // --------------------------------------------

  if (localStream) {

    localStream
      .getTracks()
      .forEach(
        (track) => {

          track.stop();

        }
      );

    localStream =
      null;

  }


  // --------------------------------------------
  // CLOSE PEER
  // --------------------------------------------

  if (peerConnection) {

    try {

      peerConnection.close();

    } catch (error) {

      console.error(error);

    }

    peerConnection =
      null;

  }


  // --------------------------------------------
  // STOP REMOTE AUDIO
  // --------------------------------------------

  if (remoteAudio) {

    remoteAudio.srcObject =
      null;

  }


  voiceCallActive =
    false;

  isMuted =
    false;


  if (muteBtn) {

    muteBtn.innerText =
      "🔇 Mute";

  }


  // --------------------------------------------
  // OPTIONAL FIREBASE STATUS
  // --------------------------------------------

  if (
    notifyFirebase &&
    roomId
  ) {

    set(
      ref(
        db,
        "calls/" +
        roomId +
        "/status"
      ),
      "ended"
    );

  }

}


// ======================================================
// DISCONNECT CHAT
// ======================================================

async function disconnectChat() {

  const oldId =
    myId;

  const oldRoom =
    roomId;


  // --------------------------------------------
  // END VOICE
  // --------------------------------------------

  if (
    oldRoom &&
    db
  ) {

    try {

      await set(
        ref(
          db,
          "calls/" +
          oldRoom +
          "/status"
        ),
        "ended"
      );

    } catch (error) {

      console.error(
        error
      );

    }

  }


  stopVoiceCall(
    false
  );


  // --------------------------------------------
  // REMOVE WAITING
  // --------------------------------------------

  if (
    oldId &&
    db
  ) {

    try {

      await remove(
        ref(
          db,
          "waiting/" +
          oldId
        )
      );

    } catch (error) {

      console.error(
        error
      );

    }


    // ------------------------------------------
    // REMOVE ONLINE
    // ------------------------------------------

    try {

      await remove(
        ref(
          db,
          "onlineUsers/" +
          oldId
        )
      );

    } catch (error) {

      console.error(
        error
      );

    }


    // ------------------------------------------
    // REMOVE ROOM PRESENCE
    // ------------------------------------------

    if (oldRoom) {

      try {

        await remove(
          ref(
            db,
            "rooms/" +
            oldRoom +
            "/users/" +
            oldId
          )
        );

      } catch (error) {

        console.error(
          error
        );

      }

    }

  }


  // --------------------------------------------
  // RESET
  // --------------------------------------------

  myId =
    null;

  roomId =
    null;

  partnerId =
    null;

  partnerUsername =
    null;

  myUsername =
    null;

  isSearching =
    false;

  messageListenerStarted =
    false;

  onlineListenerStarted =
    false;

  roomPresenceStarted =
    false;

  callListenersStarted =
    false;

  partnerWasOnline =
    false;

  disconnectHandled =
    false;


  if (chatBox) {

    chatBox.innerHTML =
      "";

  }


  setStatus(
    "Status: Disconnected"
  );

}


// ======================================================
// NEXT STRANGER
// ======================================================

async function nextStranger() {

  await disconnectChat();


  setStatus(
    "Status: Finding stranger..."
  );


  setTimeout(
    () => {

      startChat();

    },
    500
  );

}


// ======================================================
// BUTTON EVENTS
// ======================================================

if (startBtn) {

  startBtn.addEventListener(
    "click",
    startChat
  );

}


if (disconnectBtn) {

  disconnectBtn.addEventListener(
    "click",
    nextStranger
  );

}


if (sendBtn) {

  sendBtn.addEventListener(
    "click",
    sendMessage
  );

}


// ======================================================
// VOICE BUTTONS
// ======================================================

if (startVoiceBtn) {

  startVoiceBtn.addEventListener(
    "click",
    startVoiceCall
  );

}


if (muteBtn) {

  muteBtn.addEventListener(
    "click",
    toggleMute
  );

}


if (endVoiceBtn) {

  endVoiceBtn.addEventListener(
    "click",
    endVoiceCall
  );

}


// ======================================================
// ENTER TO SEND
// ======================================================

if (msgInput) {

  msgInput.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        sendMessage();

      }

    }
  );

}


// ======================================================
// INITIAL
// ======================================================

createRemoteAudio();


setStatus(
  "Status: Ready"
);


console.log(
  "================================"
);

console.log(
  "TALK TO SMILE LOADED"
);

console.log(
  "Random Chat: ON"
);

console.log(
  "Text Chat: ON"
);

console.log(
  "Disconnect Detection: ON"
);

console.log(
  "WebRTC Voice Call: ON"
);

console.log(
  "================================"
);
