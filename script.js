// ======================================================
// TALK TO SMILE
// Random Chat + Custom Username + Text Chat
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
// INITIALIZE FIREBASE
// ======================================================

let app;
let db;

try {

  app = initializeApp(firebaseConfig);

  db = getDatabase(app);

  console.log("Firebase initialized successfully");

} catch (error) {

  console.error(
    "Firebase initialization error:",
    error
  );

  alert(
    "Firebase initialization error:\n" +
    error.message
  );

}


// ======================================================
// VARIABLES
// ======================================================

let myId = null;

let myUsername = null;

let roomId = null;

let isSearching = false;

let messageListenerStarted = false;

let onlineListenerStarted = false;


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


// ======================================================
// STATUS
// ======================================================

function setStatus(text) {

  if (status) {

    status.innerText = text;

  }

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
// FIREBASE ERROR HANDLER
// ======================================================

function showFirebaseError(
  location,
  error
) {

  console.error(
    "================================"
  );

  console.error(
    "FIREBASE ERROR"
  );

  console.error(
    "Location:",
    location
  );

  console.error(
    "Code:",
    error?.code
  );

  console.error(
    "Message:",
    error?.message
  );

  console.error(
    "Full error:",
    error
  );

  console.error(
    "================================"
  );


  const code =
    error?.code ||
    "UNKNOWN_ERROR";

  const message =
    error?.message ||
    "Unknown Firebase error";


  alert(
    "Firebase Error\n\n" +
    "Location: " +
    location +
    "\n\n" +
    "Code: " +
    code +
    "\n\n" +
    "Message: " +
    message
  );

}


// ======================================================
// ONLINE COUNTER
// ======================================================

function startOnlineCounter() {

  if (!db) {

    console.error(
      "Database not initialized"
    );

    return;

  }


  if (!myId) {

    console.error(
      "Cannot start online counter: no user ID"
    );

    return;

  }


  if (onlineListenerStarted) {

    return;

  }


  onlineListenerStarted =
    true;


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


  // --------------------------------------------
  // CONNECTION STATUS
  // --------------------------------------------

  onValue(
    connectedRef,
    async (snapshot) => {

      if (
        snapshot.val() !== true
      ) {

        console.log(
          "Firebase not connected yet"
        );

        return;

      }


      console.log(
        "Firebase connected"
      );


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

        showFirebaseError(
          "onlineUsers",
          error
        );

      }

    }
  );


  // --------------------------------------------
  // ONLINE USER COUNT
  // --------------------------------------------

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

    },
    (error) => {

      showFirebaseError(
        "onlineUsers listener",
        error
      );

    }
  );

}


// ======================================================
// START CHAT
// ======================================================

async function startChat() {

  console.log(
    "START BUTTON CLICKED"
  );


  if (!db) {

    alert(
      "Firebase database is not initialized."
    );

    return;

  }


  if (isSearching) {

    console.log(
      "Already searching"
    );

    return;

  }


  // --------------------------------------------
  // USERNAME
  // --------------------------------------------

  myUsername =
    getUsername();


  // --------------------------------------------
  // USER ID
  // --------------------------------------------

  myId =
    createUserId();


  roomId =
    null;


  isSearching =
    true;


  messageListenerStarted =
    false;


  onlineListenerStarted =
    false;


  setStatus(
    "Status: Waiting for stranger..."
  );


  if (chatBox) {

    chatBox.innerHTML = "";

  }


  console.log(
    "My ID:",
    myId
  );

  console.log(
    "My Username:",
    myUsername
  );


  // --------------------------------------------
  // START ONLINE COUNTER
  // --------------------------------------------

  startOnlineCounter();


  try {

    // ------------------------------------------
    // WAITING REF
    // ------------------------------------------

    const myWaitingRef =
      ref(
        db,
        "waiting/" + myId
      );


    // ------------------------------------------
    // ADD USER TO WAITING
    // IMPORTANT:
    // No null values
    // ------------------------------------------

    await set(
      myWaitingRef,
      {
        id: myId,
        username: myUsername
      }
    );


    console.log(
      "Added to waiting successfully:",
      myId
    );


    // ------------------------------------------
    // REMOVE WHEN DISCONNECTED
    // ------------------------------------------

    try {

      await onDisconnect(
        myWaitingRef
      ).remove();

    } catch (error) {

      console.error(
        "onDisconnect waiting error:",
        error
      );

    }


    // ------------------------------------------
    // LISTEN TO OUR WAITING NODE
    // ------------------------------------------

    onValue(
      myWaitingRef,
      async (snapshot) => {

        const data =
          snapshot.val();


        console.log(
          "Waiting data:",
          data
        );


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
        // CONNECTED
        // ------------------------------------

        roomId =
          data.roomId;


        isSearching =
          false;


        setStatus(
          "Status: Connected with " +
          (
            data.partnerUsername ||
            "Stranger"
          )
        );


        console.log(
          "ROOM CONNECTED:",
          roomId
        );


        // ------------------------------------
        // ROOM STATUS
        // ------------------------------------

        await setRoomStatus();


        // ------------------------------------
        // MESSAGE LISTENER
        // ------------------------------------

        listenMessages();


        // ------------------------------------
        // REMOVE FROM WAITING
        // ------------------------------------

        try {

          await remove(
            myWaitingRef
          );

        } catch (error) {

          console.error(
            "Remove waiting error:",
            error
          );

        }

      },
      (error) => {

        showFirebaseError(
          "waiting listener",
          error
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


    isSearching =
      false;

    myId =
      null;

    roomId =
      null;


    setStatus(
      "Status: Error"
    );


    showFirebaseError(
      "startChat / waiting",
      error
    );

  }

}


// ======================================================
// SET ROOM STATUS
// ======================================================

async function setRoomStatus() {

  if (!db) return;

  if (!roomId) return;


  try {

    await set(
      ref(
        db,
        "rooms/" +
        roomId +
        "/status"
      ),
      "connected"
    );


    console.log(
      "Room status set:",
      roomId
    );


  } catch (error) {

    showFirebaseError(
      "rooms/status",
      error
    );

  }

}


// ======================================================
// FIND RANDOM MATCH
// ======================================================

async function findMatch() {

  if (!db) {

    return;

  }


  console.log(
    "Looking for stranger..."
  );


  const waitingRef =
    ref(
      db,
      "waiting"
    );


  try {

    await runTransaction(
      waitingRef,
      (currentData) => {

        // ------------------------------------
        // NO USERS
        // ------------------------------------

        if (!currentData) {

          return currentData;

        }


        // ------------------------------------
        // GET USERS
        // ------------------------------------

        const users =
          Object.values(
            currentData
          );


        // ------------------------------------
        // FIND AVAILABLE USERS
        // ------------------------------------

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


        // ------------------------------------
        // NO STRANGER
        // ------------------------------------

        if (
          availableUsers.length === 0
        ) {

          console.log(
            "No stranger found."
          );

          return currentData;

        }


        // ------------------------------------
        // RANDOM STRANGER
        // ------------------------------------

        const stranger =
          availableUsers[
            Math.floor(
              Math.random() *
              availableUsers.length
            )
          ];


        // ------------------------------------
        // SAFETY CHECK
        // ------------------------------------

        if (
          !currentData[myId] ||
          !currentData[stranger.id]
        ) {

          return currentData;

        }


        // ------------------------------------
        // CREATE ROOM
        // ------------------------------------

        const newRoomId =
          "room_" +
          Date.now() +
          "_" +
          Math.random()
            .toString(36)
            .substring(2, 8);


        // ------------------------------------
        // MY DATA
        // ------------------------------------

        currentData[myId].roomId =
          newRoomId;

        currentData[myId].partnerUsername =
          stranger.username ||
          "Stranger";


        // ------------------------------------
        // STRANGER DATA
        // ------------------------------------

        currentData[stranger.id].roomId =
          newRoomId;

        currentData[stranger.id].partnerUsername =
          myUsername ||
          "Stranger";


        console.log(
          "MATCH CREATED:",
          newRoomId
        );


        return currentData;

      }
    );


    console.log(
      "Match transaction completed"
    );


  } catch (error) {

    showFirebaseError(
      "waiting transaction",
      error
    );

  }

}


// ======================================================
// SEND MESSAGE
// ======================================================

async function sendMessage() {

  if (!db) {

    return;

  }


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
      "Pehle Start Chat karo aur stranger se connect ho."
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

    showFirebaseError(
      "messages",
      error
    );

  }

}


// ======================================================
// RECEIVE MESSAGES
// ======================================================

function listenMessages() {

  if (!db) {

    return;

  }


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


  console.log(
    "Listening to messages:",
    currentRoom
  );


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

    },
    (error) => {

      showFirebaseError(
        "messages listener",
        error
      );

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


  console.log(
    "Disconnecting:",
    oldId,
    oldRoom
  );


  // --------------------------------------------
  // REMOVE WAITING USER
  // --------------------------------------------

  if (oldId && db) {

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
        "Waiting remove error:",
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
        "Online remove error:",
        error
      );

    }

  }


  // --------------------------------------------
  // DISCONNECT ROOM
  // --------------------------------------------

  if (
    oldRoom &&
    db
  ) {

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
        "Room disconnect error:",
        error
      );

    }

  }


  // --------------------------------------------
  // RESET VARIABLES
  // --------------------------------------------

  myId =
    null;

  roomId =
    null;

  isSearching =
    false;

  myUsername =
    null;

  messageListenerStarted =
    false;

  onlineListenerStarted =
    false;


  // --------------------------------------------
  // CLEAR CHAT
  // --------------------------------------------

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

  console.log(
    "NEXT STRANGER CLICKED"
  );


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
// =============================================
