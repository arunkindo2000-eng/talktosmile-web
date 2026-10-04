// ======================================================
// TALK TO SMILE
// RANDOM CHAT + TEXT CHAT + WEBRTC VOICE CALL
// FIREBASE REALTIME DATABASE SIGNALING
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
  onDisconnect
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
// FIREBASE INIT
// ======================================================

const app =
  initializeApp(firebaseConfig);

const db =
  getDatabase(app);


// ======================================================
// VARIABLES
// ======================================================

let myId = null;
let myUsername = null;

let roomId = null;

let partnerId = null;
let partnerUsername = null;

let isSearching = false;


// ======================================================
// LISTENERS
// ======================================================

let waitingUnsubscribe = null;
let messageUnsubscribe = null;
let roomUnsubscribe = null;
let onlineUnsubscribe = null;


// ======================================================
// WEBRTC VARIABLES
// ======================================================

let peerConnection = null;
let localStream = null;

let isVoiceActive = false;
let isMuted = false;

let callListenersStarted = false;

let candidateKeys = new Set();


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

const voiceBtn =
  document.getElementById("voiceBtn");

const muteBtn =
  document.getElementById("muteBtn");

const endVoiceBtn =
  document.getElementById("endVoiceBtn");

const remoteAudio =
  document.getElementById("remoteAudio");


// ======================================================
// STATUS
// ======================================================

function setStatus(text) {

  if (status) {
    status.innerText = text;
  }

  console.log(text);

}


// ======================================================
// CREATE USER ID
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
// GET USERNAME
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
// ERROR
// ======================================================

function showError(location, error) {

  console.error(
    "ERROR:",
    location,
    error
  );

}


// ======================================================
// ONLINE COUNTER
// ======================================================

function startOnlineCounter() {

  if (!myId) {
    return;
  }

  const myOnlineRef =
    ref(
      db,
      "onlineUsers/" + myId
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

        onDisconnect(
          myOnlineRef
        ).remove();

      } catch (error) {

        showError(
          "Online counter",
          error
        );

      }

    }
  );


  if (onlineUnsubscribe) {
    onlineUnsubscribe();
  }


  onlineUnsubscribe =
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

  console.log(
    "START CHAT"
  );


  if (isSearching) {
    return;
  }


  if (roomId) {

    setStatus(
      "Status: Already connected"
    );

    return;

  }


  myUsername =
    getUsername();


  myId =
    createUserId();


  roomId = null;
  partnerId = null;
  partnerUsername = null;

  isSearching = true;


  setStatus(
    "Status: Waiting for stranger..."
  );


  if (chatBox) {
    chatBox.innerHTML = "";
  }


  startOnlineCounter();


  try {

    const myWaitingRef =
      ref(
        db,
        "waiting/" + myId
      );


    await set(
      myWaitingRef,
      {
        id: myId,
        username: myUsername,
        roomId: "",
        partnerId: "",
        partnerUsername: ""
      }
    );


    onDisconnect(
      myWaitingRef
    ).remove();


    waitingUnsubscribe =
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
            "ROOM:",
            roomId
          );


          console.log(
            "PARTNER:",
            partnerId
          );


          listenRoomStatus();

          listenMessages();

          setupWebRTCSignaling();


          try {

            await remove(
              myWaitingRef
            );

          } catch (error) {

            showError(
              "Remove waiting",
              error
            );

          }

        },
        (error) => {

          showError(
            "Waiting listener",
            error
          );

        }
      );


    await findMatch();


  } catch (error) {

    showError(
      "Start Chat",
      error
    );


    isSearching =
      false;

    myId =
      null;

    roomId =
      null;


    setStatus(
      "Status: Error"
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
            .substring(2, 10);


        currentData[myId].roomId =
          newRoomId;

        currentData[myId].partnerId =
          stranger.id;

        currentData[myId].partnerUsername =
          stranger.username ||
          "Stranger";


        currentData[stranger.id].roomId =
          newRoomId;

        currentData[stranger.id].partnerId =
          myId;

        currentData[stranger.id].partnerUsername =
          myUsername ||
          "Stranger";


        return currentData;

      }
    );


  } catch (error) {

    showError(
      "Find Match",
      error
    );

  }

}


// ======================================================
// ROOM STATUS
// ======================================================

function listenRoomStatus() {

  if (!roomId) {
    return;
  }


  const currentRoom =
    roomId;


  const roomStatusRef =
    ref(
      db,
      "rooms/" +
      currentRoom +
      "/status"
    );


  set(
    roomStatusRef,
    "connected"
  ).catch(
    (error) => {

      showError(
        "Room connected",
        error
      );

    }
  );


  onDisconnect(
    roomStatusRef
  ).set(
    "disconnected"
  );


  if (roomUnsubscribe) {
    roomUnsubscribe();
  }


  roomUnsubscribe =
    onValue(
      roomStatusRef,
      (snapshot) => {

        const value =
          snapshot.val();


        if (
          roomId !== currentRoom
        ) {
          return;
        }


        if (
          value === "disconnected"
        ) {

          handlePartnerDisconnected();

        }

      }
    );

}


// ======================================================
// PARTNER DISCONNECTED
// ======================================================

function handlePartnerDisconnected() {

  if (!roomId) {
    return;
  }


  if (!partnerId) {
    return;
  }


  console.log(
    "PARTNER DISCONNECTED"
  );


  stopVoice(false);


  if (chatBox) {

    const div =
      document.createElement(
        "div"
      );


    div.innerText =
      "⚠️ " +
      (
        partnerUsername ||
        "Stranger"
      ) +
      " disconnected.";


    div.style.background =
      "#7f1d1d";


    chatBox.appendChild(
      div
    );


    chatBox.scrollTop =
      chatBox.scrollHeight;

  }


  setStatus(
    "Status: Stranger disconnected"
  );


  partnerId = null;
  partnerUsername = null;

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

    showError(
      "Send message",
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


  const currentRoom =
    roomId;


  if (messageUnsubscribe) {
    messageUnsubscribe();
  }


  messageUnsubscribe =
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
    },

    {
      urls:
        "stun:stun2.l.google.com:19302"
    }

  ]

};


// ======================================================
// CREATE PEER CONNECTION
// ======================================================

function createPeerConnection() {

  if (peerConnection) {
    return peerConnection;
  }


  peerConnection =
    new RTCPeerConnection(
      rtcConfig
    );


  peerConnection.ontrack =
    async (event) => {

      console.log(
        "REMOTE AUDIO RECEIVED"
      );


      if (!remoteAudio) {
        return;
      }


      if (
        event.streams &&
        event.streams[0]
      ) {

        remoteAudio.srcObject =
          event.streams[0];

      }


      try {

        await remoteAudio.play();

      } catch (error) {

        console.log(
          "Audio play waiting:",
          error
        );

      }

    };


  peerConnection.onicecandidate =
    async (event) => {

      if (!event.candidate) {
        return;
      }


      if (!roomId || !myId) {
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

        showError(
          "ICE candidate",
          error
        );

      }

    };


  peerConnection.onconnectionstatechange =
    () => {

      if (!peerConnection) {
        return;
      }


      const state =
        peerConnection.connectionState;


      console.log(
        "WebRTC:",
        state
      );


      if (
        state === "connected"
      ) {

        isVoiceActive =
          true;


        setStatus(
          "Status: Voice connected with " +
          (
            partnerUsername ||
            "Stranger"
          )
        );


        if (voiceBtn) {

          voiceBtn.innerText =
            "🎙️ Voice Connected";

        }

      }


      if (
        state === "failed"
      ) {

        isVoiceActive =
          false;


        setStatus(
          "Status: Voice connection failed"
        );

      }


      if (
        state === "disconnected"
      ) {

        console.log(
          "Voice disconnected"
        );

      }

    };


  peerConnection.oniceconnectionstatechange =
    () => {

      if (!peerConnection) {
        return;
      }


      console.log(
        "ICE:",
        peerConnection.iceConnectionState
      );

    };


  return peerConnection;

}


// ======================================================
// WEBRTC SIGNALING
// ======================================================

function setupWebRTCSignaling() {

  if (
    !roomId ||
    !myId ||
    !partnerId
  ) {

    console.log(
      "WebRTC signaling waiting..."
    );

    return;

  }


  if (callListenersStarted) {
    return;
  }


  callListenersStarted =
    true;


  console.log(
    "WEBRTC SIGNALING STARTED"
  );


  // ==================================================
  // OFFER LISTENER
  // ==================================================

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


      if (
        myId < partnerId
      ) {

        return;

      }


      try {

        const pc =
          createPeerConnection();


        if (
          pc.currentRemoteDescription
        ) {

          return;

        }


        await pc.setRemoteDescription(
          new RTCSessionDescription(
            offer
          )
        );


        if (localStream) {

          const senders =
            pc.getSenders();


          localStream
            .getTracks()
            .forEach(
              (track) => {

                const exists =
                  senders.some(
                    (sender) =>
                      sender.track === track
                  );


                if (!exists) {

                  pc.addTrack(
                    track,
                    localStream
                  );

                }

              }
            );

        }


        const answer =
          await pc.createAnswer();


        await pc.setLocalDescription(
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


        console.log(
          "ANSWER SENT"
        );


      } catch (error) {

        showError(
          "Offer / Answer",
          error
        );

      }

    }
  );


  // ==================================================
  // ANSWER LISTENER
  // ==================================================

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


      if (
        myId > partnerId
      ) {

        return;

      }


      if (!peerConnection) {
        return;
      }


      if (
        peerConnection.currentRemoteDescription
      ) {

        return;

      }


      try {

        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(
            answer
          )
        );


        console.log(
          "ANSWER RECEIVED"
        );


      } catch (error) {

        showError(
          "Set answer",
          error
        );

      }

    }
  );


  // ==================================================
  // ICE CANDIDATES
  // ==================================================
  // PARTNER ICE CANDIDATES
  // ==================================================

  onValue(
    ref(
      db,
      "calls/" +
      roomId +
      "/candidates/" +
      partnerId
    ),
    async (snapshot) => {

      const candidates =
        snapshot.val();

      if (!candidates) {
        return;
      }

      if (!peerConnection) {
        return;
      }

      for (const key in candidates) {

        if (candidateKeys.has(key)) {
          continue;
        }

        candidateKeys.add(key);

        try {

          await peerConnection.addIceCandidate(
            new RTCIceCandidate(
              candidates[key]
            )
          );

          console.log(
            "ICE candidate added"
          );

        } catch (error) {

          console.error(
            "ICE candidate error:",
            error
          );

        }

      }

    }
  );

}


// ======================================================
// START VOICE
// ======================================================

async function startVoice() {

  console.log(
    "START VOICE CLICKED"
  );


  if (!roomId) {

    alert(
      "Pehle Start Chat karke stranger se connect ho."
    );

    return;

  }


  if (!partnerId) {

    alert(
      "Partner ID nahi mili. Next Stranger karke dobara connect karo."
    );

    return;

  }


  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {

    alert(
      "Microphone supported nahi hai."
    );

    return;

  }


  try {

    setStatus(
      "Status: Microphone permission..."
    );


    // ==================================================
    // MICROPHONE
    // ==================================================

    localStream =
      await navigator.mediaDevices.getUserMedia(
        {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        }
      );


    console.log(
      "MICROPHONE ACCESS GRANTED"
    );


    // ==================================================
    // CREATE PEER CONNECTION
    // ==================================================

    const pc =
      createPeerConnection();


    // ==================================================
    // ADD MICROPHONE TRACK
    // ==================================================

    const existingSenders =
      pc.getSenders();


    localStream
      .getTracks()
      .forEach(
        (track) => {

          const alreadyAdded =
            existingSenders.some(
              (sender) =>
                sender.track === track
            );


          if (!alreadyAdded) {

            pc.addTrack(
              track,
              localStream
            );

          }

        }
      );


    // ==================================================
    // RESET OLD CALL SIGNALING
    // ==================================================

    candidateKeys.clear();


    await remove(
      ref(
        db,
        "calls/" +
        roomId
      )
    );


    // ==================================================
    // START SIGNALING
    // ==================================================

    callListenersStarted = false;

    setupWebRTCSignaling();


    // ==================================================
    // OFFERER
    // ==================================================

    if (
      myId < partnerId
    ) {

      console.log(
        "I AM OFFERER"
      );


      const offer =
        await pc.createOffer({
          offerToReceiveAudio: true
        });


      await pc.setLocalDescription(
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
            offer.sdp,

          caller:
            myId,

          callerUsername:
            myUsername,

          timestamp:
            Date.now()
        }
      );


      console.log(
        "VOICE OFFER SENT"
      );

    } else {

      console.log(
        "I AM ANSWERER"
      );

      setStatus(
        "Status: Waiting for voice connection..."
      );

    }


    isVoiceActive =
      true;

    isMuted =
      false;


    if (voiceBtn) {

      voiceBtn.innerText =
        "🎙️ Voice Calling...";

    }


    if (muteBtn) {

      muteBtn.innerText =
        "🔇 Mute";

    }


    if (endVoiceBtn) {

      endVoiceBtn.disabled =
        false;

    }


    setStatus(
      "Status: Starting voice call..."
    );


  } catch (error) {

    console.error(
      "START VOICE ERROR:",
      error
    );


    isVoiceActive =
      false;


    if (
      error.name ===
      "NotAllowedError"
    ) {

      alert(
        "Microphone permission denied.\n\n" +
        "Browser settings me Microphone permission Allow karo."
      );

    }

    else if (
      error.name ===
      "NotFoundError"
    ) {

      alert(
        "Microphone nahi mila."
      );

    }

    else {

      alert(
        "Voice call error:\n\n" +
        error.message
      );

    }


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

  }

}


// ======================================================
// MUTE / UNMUTE
// ======================================================

function toggleMute() {

  if (!localStream) {

    alert(
      "Pehle Start Voice karo."
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


  console.log(
    isMuted
      ? "MIC MUTED"
      : "MIC UNMUTED"
  );

}


// ======================================================
// END VOICE
// ======================================================

async function stopVoice(
  updateStatus = true
) {

  console.log(
    "STOP VOICE"
  );


  // ==================================================
  // STOP MICROPHONE
  // ==================================================

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


  // ==================================================
  // CLOSE PEER CONNECTION
  // ==================================================

  if (peerConnection) {

    try {

      peerConnection.close();

    } catch (error) {

      console.error(
        error
      );

    }

    peerConnection =
      null;

  }


  // ==================================================
  // STOP REMOTE AUDIO
  // ==================================================

  if (remoteAudio) {

    remoteAudio.pause();

    remoteAudio.srcObject =
      null;

  }


  // ==================================================
  // DELETE CALL DATA
  // ==================================================

  if (roomId) {

    try {

      await remove(
        ref(
          db,
          "calls/" +
          roomId
        )
      );

    } catch (error) {

      console.error(
        "Call cleanup error:",
        error
      );

    }

  }


  // ==================================================
  // RESET VOICE VARIABLES
  // ==================================================

  isVoiceActive =
    false;

  isMuted =
    false;

  callListenersStarted =
    false;

  candidateKeys.clear();


  // ==================================================
  // RESET BUTTONS
  // ==================================================

  if (voiceBtn) {

    voiceBtn.innerText =
      "🎙️ Start Voice";

  }


  if (muteBtn) {

    muteBtn.innerText =
      "🔇 Mute";

  }


  if (endVoiceBtn) {

    endVoiceBtn.disabled =
      false;

  }


  // ==================================================
  // STATUS
  // ==================================================

  if (updateStatus) {

    setStatus(
      "Status: Voice call ended"
    );

  }

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
// DISCONNECT CHAT
// ======================================================

async function disconnectChat() {

  const oldId =
    myId;

  const oldRoom =
    roomId;


  // ==================================================
  // STOP VOICE
  // ==================================================

  await stopVoice(false);


  // ==================================================
  // REMOVE WAITING
  // ==================================================

  if (oldId) {

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


    // ==================================================
    // REMOVE ONLINE
    // ==================================================

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

  }


  // ==================================================
  // MARK ROOM DISCONNECTED
  // ==================================================

  if (oldRoom) {

    try {

      await set(
        ref(
          db,
          "rooms/" +
          oldRoom +
          "/status"
        ),
        "disconnected"
      );

    } catch (error) {

      console.error(
        error
      );

    }

  }


  // ==================================================
  // RESET VARIABLES
  // ==================================================

  myId =
    null;

  myUsername =
    null;

  roomId =
    null;

  partnerId =
    null;

  partnerUsername =
    null;

  isSearching =
    false;


  callListenersStarted =
    false;

  candidateKeys.clear();


  // ==================================================
  // REMOVE LISTENERS
  // ==================================================

  if (messageUnsubscribe) {

    messageUnsubscribe();

    messageUnsubscribe =
      null;

  }


  if (roomUnsubscribe) {

    roomUnsubscribe();

    roomUnsubscribe =
      null;

  }


  if (waitingUnsubscribe) {

    waitingUnsubscribe();

    waitingUnsubscribe =
      null;

  }


  if (onlineUnsubscribe) {

    onlineUnsubscribe();

    onlineUnsubscribe =
      null;

  }


  // ==================================================
  // CLEAR CHAT
  // ==================================================

  if (chatBox) {

    chatBox.innerHTML =
      "";

  }


  setStatus(
    "Status: Disconnected"
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


if (voiceBtn) {

  voiceBtn.addEventListener(
    "click",
    startVoice
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
    () => {

      stopVoice(true);

    }
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
// INITIAL STATUS
// ======================================================

console.log(
  "===================================="
);

console.log(
  "TALK TO SMILE"
);

console.log(
  "Random Chat + Text + Voice"
);

console.log(
  "Firebase + WebRTC"
);

console.log(
  "===================================="
);


setStatus(
  "Status: Ready"
);
