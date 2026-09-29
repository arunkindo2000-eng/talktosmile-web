// ======================================================
// TALK TO SMILE - BASIC WORKING SCRIPT
// Custom Username + Random Chat + Text Chat
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
  apiKey: "AIzaSyCv6ISry_cbpR89phb1D68wkM4V_DHQPQY",
  authDomain: "talktosmile-16bca.firebaseapp.com",
  databaseURL: "https://talktosmile-16bca-default-rtdb.firebaseio.com",
  projectId: "talktosmile-16bca",
  storageBucket: "talktosmile-16bca.appspot.com",
  messagingSenderId: "550139117184",
  appId: "1:550139117184:web:c354dce8e28c8e2144f065"
};


// ======================================================
// FIREBASE
// ======================================================

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);


// ======================================================
// VARIABLES
// ======================================================

let myId = null;
let myUsername = null;
let roomId = null;
let isSearching = false;


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
// USER ID
// ======================================================

function createUserId() {

  return "user_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .substring(2, 8);

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
// ONLINE COUNTER
// ======================================================

function startOnlineCounter() {

  if (!myId) return;


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

      if (snapshot.val() !== true) {
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

        console.error(
          "Online error:",
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

  console.log("START BUTTON CLICKED");


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


  setStatus(
    "Status: Waiting for stranger..."
  );


  if (chatBox) {
    chatBox.innerHTML = "";
  }


  // --------------------------------------------
  // ONLINE
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
    // ADD TO WAITING
    // ------------------------------------------

    await set(
      myWaitingRef,
      {
        id: myId,
        username: myUsername,
        roomId: null,
        partnerUsername: null
      }
    );


    console.log(
      "Added to waiting:",
      myId
    );


    // ------------------------------------------
    // REMOVE WHEN CONNECTION CLOSES
    // ------------------------------------------

    onDisconnect(
      myWaitingRef
    ).remove();


    // ------------------------------------------
    // LISTEN TO OUR USER
    // ------------------------------------------

    onValue(
      myWaitingRef,
      (snapshot) => {

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


        setStatus(
          "Status: Connected with " +
          (
            data.partnerUsername ||
            "Stranger"
          )
        );


        isSearching =
          false;


        // ------------------------------------
        // ROOM STATUS
        // ------------------------------------

        awaitSetRoomStatus();


        // ------------------------------------
        // MESSAGE LISTENER
        // ------------------------------------

        listenMessages();


        // ------------------------------------
        // REMOVE WAITING
        // ------------------------------------

        remove(
          myWaitingRef
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


    alert(
      "Firebase error: " +
      error.message
    );

  }

}


// ======================================================
// SET ROOM STATUS
// ======================================================

async function awaitSetRoomStatus() {

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

  } catch (error) {

    console.error(
      "Room status error:",
      error
    );

  }

}


// ======================================================
// FIND RANDOM MATCH
// ======================================================

async function findMatch() {

  console.log(
    "Looking for stranger..."
  );


  const waitingRef =
    ref(
      db,
      "waiting"
    );


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

        console.log(
          "No stranger found."
        );

        return currentData;

      }


      // ----------------------------------------
      // RANDOM STRANGER
      // ----------------------------------------

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


      // ----------------------------------------
      // CREATE ROOM
      // ----------------------------------------

      const newRoomId =
        "room_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .substring(2, 8);


      // ----------------------------------------
      // ME
      // ----------------------------------------

      currentData[myId].roomId =
        newRoomId;

      currentData[myId]
        .partnerUsername =
        stranger.username ||
        "Stranger";


      // ----------------------------------------
      // STRANGER
      // ----------------------------------------

      currentData[stranger.id].roomId =
        newRoomId;

      currentData[stranger.id]
        .partnerUsername =
        myUsername ||
        "Stranger";


      console.log(
        "MATCH CREATED:",
        newRoomId
      );


      return currentData;

    }
  );

}


// ======================================================
// SEND MESSAGE
// ======================================================

async function sendMessage() {

  if (!msgInput) return;


  const message =
    msgInput.value.trim();


  if (!message) return;


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
        "messages/" + roomId
      ),
      {
        text: message,
        sender: myId,
        username: myUsername,
        timestamp: Date.now()
      }
    );


    msgInput.value = "";

    msgInput.focus();

  } catch (error) {

    console.error(
      "Message error:",
      error
    );

  }

}


// ======================================================
// RECEIVE MESSAGES
// ======================================================

function listenMessages() {

  if (!roomId) return;


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


      if (!chatBox) return;


      chatBox.innerHTML = "";


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
// DISCONNECT
// ======================================================

async function disconnectChat() {

  const oldId =
    myId;

  const oldRoom =
    roomId;


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

      console.error(error);

    }


    try {

      await remove(
        ref(
          db,
          "onlineUsers/" +
          oldId
        )
      );

    } catch (error) {

      console.error(error);

    }

  }


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

      console.error(error);

    }

  }


  myId =
    null;

  roomId =
    null;

  isSearching =
    false;


  if (chatBox) {
    chatBox.innerHTML = "";
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
  "Talk To Smile script loaded successfully."
);

setStatus(
  "Status: Ready"
);
