// ======================================================
// TALK TO SMILE
// COMPLETE SCRIPT.JS
// Custom Username + Random Chat + Voice Chat
// ======================================================


// ======================================================
// FIREBASE IMPORTS
// ======================================================

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

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
// GLOBAL VARIABLES
// ======================================================

let myId = null;

let myUsername = null;

let roomId = null;

let listening = false;


// ======================================================
// VOICE VARIABLES
// ======================================================

let localStream = null;

let peerConnection = null;

let voiceRoomId = null;

let voiceStarted = false;

let isMuted = false;

let pendingIceCandidates = [];


// ======================================================
// LISTENER REFERENCES
// ======================================================

let roomStatusListener = null;

let messageListener = null;

let waitingListener = null;

let onlineUsersListener = null;


// ======================================================
// HTML ELEMENTS
// ======================================================

const usernameInput =
  document.getElementById("usernameInput");

const statusElement =
  document.getElementById("status");

const onlineCount =
  document.getElementById("onlineCount");

const chatBox =
  document.getElementById("chatBox");

const msgInput =
  document.getElementById("msgInput");

const remoteAudio =
  document.getElementById("remoteAudio");

const startBtn =
  document.getElementById("startBtn");

const disconnectBtn =
  document.getElementById("disconnectBtn");

const sendBtn =
  document.getElementById("sendBtn");

const voiceBtn =
  document.getElementById("voiceBtn");

const muteBtn =
  document.getElementById("muteBtn");

const endVoiceBtn =
  document.getElementById("endVoiceBtn");


// ======================================================
// STATUS
// ======================================================

function setStatus(text) {

  if (statusElement) {

    statusElement.innerText = text;

  }

}


// ======================================================
// GENERATE USER ID
// ======================================================

function generateUserId() {

  return (
    "user_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .substring(2, 9)
  );

}


// ======================================================
// GENERATE DEFAULT USERNAME
// ======================================================

function generateDefaultUsername() {

  return (
    "Stranger" +
    Math.floor(
      Math.random() * 10000
    )
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
      generateDefaultUsername();

  }


  // Maximum 20 characters

  username =
    username.substring(0, 20);


  if (usernameInput) {

    usernameInput.value =
      username;

  }


  return username;

}


// ======================================================
// ONLINE USER COUNTER
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

            id:
              myId,

            username:
              myUsername ||
              "Stranger",

            online:
              true,

            lastSeen:
              Date.now()

          }
        );


        onDisconnect(
          myOnlineRef
        ).remove();

      } catch (error) {

        console.error(
          "ONLINE USER ERROR:",
          error
        );

      }

    }
  );


  onlineUsersListener =
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
// ADD USER TO WAITING
// ======================================================

async function addToWaiting() {

  if (!myId) {

    return;

  }


  const waitingRef =
    ref(
      db,
      "waiting/" + myId
    );


  await set(
    waitingRef,
    {

      id:
        myId,

      username:
        myUsername,

      roomId:
        null,

      partnerUsername:
        null

    }
  );


  onDisconnect(
    waitingRef
  ).remove();


  return waitingRef;

}


// ======================================================
// START CHAT
// ======================================================

async function startChat() {

  if (listening) {

    return;

  }


  // --------------------------------------------
  // GET CUSTOM USERNAME
  // --------------------------------------------

  myUsername =
    getUsername();


  // --------------------------------------------
  // CREATE USER ID
  // --------------------------------------------

  myId =
    generateUserId();


  roomId =
    null;


  listening =
    true;


  setStatus(
    "Status: Waiting..."
  );


  if (chatBox) {

    chatBox.innerHTML =
      "";

  }


  // --------------------------------------------
  // ONLINE COUNTER
  // --------------------------------------------

  startOnlineCounter();


  try {

    // ------------------------------------------
    // ADD TO WAITING
    // ------------------------------------------

    const waitingRef =
      await addToWaiting();


    // ------------------------------------------
    // LISTEN TO OWN WAITING ENTRY
    // ------------------------------------------

    waitingListener =
      onValue(
        waitingRef,
        (snapshot) => {

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


          // ------------------------------------
          // ROOM CONNECTED
          // ------------------------------------

          roomId =
            data.roomId;


          set(
            ref(
              db,
              "rooms/" +
              roomId +
              "/status"
            ),
            "connected"
          );


          setStatus(
            "Status: Connected with " +
            (
              data.partnerUsername ||
              "Stranger"
            )
          );


          // ------------------------------------
          // START CHAT LISTENERS
          // ------------------------------------

          listenMessages();

          listenRoomStatus();


          // ------------------------------------
          // REMOVE WAITING ENTRY
          // ------------------------------------

          remove(
            waitingRef
          );

        }
      );


    // ------------------------------------------
    // FIND STRANGER
    // ------------------------------------------

    await findMatch();


  } catch (error) {

    console.error(
      "START CHAT ERROR:",
      error
    );


    resetUser();


    setStatus(
      "Status: Connection error"
    );


    alert(
      "Firebase connection error. Check your Firebase Database Rules."
    );

  }

}


// ======================================================
// FIND RANDOM STRANGER
// ======================================================

async function findMatch() {

  const waitingRef =
    ref(
      db,
      "waiting"
    );


  await runTransaction(
    waitingRef,
    (currentData) => {

      // No users

      if (!currentData) {

        return currentData;

      }


      // ----------------------------------------
      // GET USERS
      // ----------------------------------------

      const users =
        Object.values(
          currentData
        );


      // ----------------------------------------
      // FIND AVAILABLE USERS
      // ----------------------------------------

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


      // Nobody available

      if (
        availableUsers.length === 0
      ) {

        return currentData;

      }


      // ----------------------------------------
      // RANDOM USER
      // ----------------------------------------

      const stranger =
        availableUsers[
          Math.floor(
            Math.random() *
            availableUsers.length
          )
        ];


      // Make sure both exist

      if (
        !currentData[myId] ||
        !currentData[stranger.id]
      ) {

        return currentData;

      }


      // ----------------------------------------
      // CREATE ROOM
      // ----------------------------------------

      const newRoomId =
        "room_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .substring(2, 9);


      // ----------------------------------------
      // USER 1
      // ----------------------------------------

      currentData[myId].roomId =
        newRoomId;


      currentData[myId]
        .partnerUsername =
        stranger.username ||
        "Stranger";


      // ----------------------------------------
      // USER 2
      // ----------------------------------------

      currentData[stranger.id].roomId =
        newRoomId;


      currentData[stranger.id]
        .partnerUsername =
        myUsername ||
        "Stranger";


      return currentData;

    }
  );

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


  if (!roomId || !myId) {

    alert(
      "Pehle kisi stranger se connect ho!"
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

        text:
          message,

        sender:
          myId,

        username:
          myUsername,

        timestamp:
          Date.now()

      }
    );


    msgInput.value =
      "";


    msgInput.focus();

  } catch (error) {

    console.error(
      "SEND MESSAGE ERROR:",
      error
    );

  }

}


// ======================================================
// LISTEN MESSAGES
// ======================================================

function listenMessages() {

  if (!roomId) {

    return;

  }


  const currentRoomId =
    roomId;


  messageListener =
    onValue(
      ref(
        db,
        "messages/" +
        currentRoomId
      ),
      (snapshot) => {

        // Ignore old room

        if (
          roomId !==
          currentRoomId
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


        const messageList =
          Object.values(
            messages
          );


        // Sort by timestamp

        messageList.sort(
          (a, b) =>
            (a.timestamp || 0) -
            (b.timestamp || 0)
        );


        messageList.forEach(
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
// LISTEN ROOM STATUS
// ======================================================

function listenRoomStatus() {

  if (!roomId) {

    return;

  }


  const currentRoomId =
    roomId;


  const roomRef =
    ref(
      db,
      "rooms/" +
      currentRoomId
    );


  roomStatusListener =
    onValue(
      roomRef,
      (snapshot) => {

        const room =
          snapshot.val();


        if (
          !room ||
          roomId !== currentRoomId
        ) {

          return;

        }


        if (
          room.status ===
          "disconnected"
        ) {

          // ----------------------------------
          // STOP VOICE
          // ----------------------------------

          endVoice();


          // ----------------------------------
          // RESET ROOM
          // ----------------------------------

          roomId =
            null;


          listening =
            false;


          setStatus(
            "Status: Stranger disconnected"
          );


          if (chatBox) {

            chatBox.innerHTML =
              "";

          }

        }

      }
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


  // --------------------------------------------
  // STOP VOICE
  // --------------------------------------------

  endVoice();


  // --------------------------------------------
  // REMOVE WAITING
  // --------------------------------------------

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


    // ------------------------------------------
    // REMOVE ONLINE USER
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

  }


  // --------------------------------------------
  // DISCONNECT ROOM
  // --------------------------------------------

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
        "ROOM DISCONNECT ERROR:",
        error
      );

    }

  }


  // --------------------------------------------
  // RESET
  // --------------------------------------------

  myId =
    null;


  roomId =
    null;


  listening =
    false;


  if (chatBox) {

    chatBox.innerHTML =
      "";

  }


  setStatus(
    "Status: Stranger disconnected"
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
    700
  );

}


// ======================================================
// RESET USER
// ======================================================

function resetUser() {

  myId =
    null;

  roomId =
    null;

  listening =
    false;

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
    }

  ]

};


// ======================================================
// START VOICE CHAT
// ======================================================

async function startVoice() {

  // --------------------------------------------
  // CHECK ROOM
  // --------------------------------------------

  if (!roomId) {

    alert(
      "Pehle kisi stranger se connect ho!"
    );

    return;

  }


  // --------------------------------------------
  // ALREADY RUNNING
  // --------------------------------------------

  if (peerConnection) {

    return;

  }


  // --------------------------------------------
  // CHECK MICROPHONE
  // --------------------------------------------

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {

    alert(
      "Is browser mein microphone supported nahi hai."
    );

    return;

  }


  try {

    const currentRoomId =
      roomId;


    voiceRoomId =
      currentRoomId;


    voiceStarted =
      true;


    pendingIceCandidates =
      [];


    // ------------------------------------------
    // MICROPHONE
    // ------------------------------------------

    localStream =
      await navigator
        .mediaDevices
        .getUserMedia(
          {
            audio: true
          }
        );


    // ------------------------------------------
    // PEER CONNECTION
    // ------------------------------------------

    peerConnection =
      new RTCPeerConnection(
        rtcConfig
      );


    // ------------------------------------------
    // ADD MICROPHONE TRACK
    // ------------------------------------------

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


    // ------------------------------------------
    // RECEIVE STRANGER AUDIO
    // ------------------------------------------

    peerConnection.ontrack =
      (event) => {

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


        remoteAudio
          .play()
          .catch(
            () => {}
          );

      };


    // ------------------------------------------
    // ICE CANDIDATE
  
