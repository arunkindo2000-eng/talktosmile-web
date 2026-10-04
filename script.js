// ======================================================
// TALK TO SMILE
// RANDOM CHAT + TEXT CHAT + WEBRTC VOICE CALL
// FIREBASE REALTIME DATABASE SIGNALING
// COMPLETE FIXED VERSION
// ======================================================

import { initializeApp } from
"https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  get,
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

const app = initializeApp(firebaseConfig);

const db = getDatabase(app);


// ======================================================
// USER VARIABLES
// ======================================================

let myId = null;
let myUsername = null;

let roomId = null;

let partnerId = null;
let partnerUsername = null;

let isSearching = false;


// ======================================================
// FIREBASE LISTENERS
// ======================================================

let waitingUnsubscribe = null;
let messageUnsubscribe = null;
let roomUnsubscribe = null;
let onlineUnsubscribe = null;

let roomMemberUnsubscribe = null;

let webRTCUnsubscribes = [];


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

  console.log("[STATUS]", text);

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
    "[ERROR]",
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
// CLEAN WAITING LISTENER
// ======================================================

function stopWaitingListener() {

  if (waitingUnsubscribe) {

    waitingUnsubscribe();

    waitingUnsubscribe =
      null;

  }

}


// ======================================================
// CLEAN MESSAGE LISTENER
// ======================================================

function stopMessageListener() {

  if (messageUnsubscribe) {

    messageUnsubscribe();

    messageUnsubscribe =
      null;

  }

}


// ======================================================
// CLEAN ROOM LISTENER
// ======================================================

function stopRoomListener() {

  if (roomUnsubscribe) {

    roomUnsubscribe();

    roomUnsubscribe =
      null;

  }

}


// ======================================================
// CLEAN ROOM MEMBER LISTENER
// ======================================================

function stopRoomMemberListener() {

  if (roomMemberUnsubscribe) {

    roomMemberUnsubscribe();

    roomMemberUnsubscribe =
      null;

  }

}


// ======================================================
// CLEAN WEBRTC LISTENERS
// ======================================================

function stopWebRTCListeners() {

  webRTCUnsubscribes.forEach(
    (unsubscribe) => {

      try {

        unsubscribe();

      } catch (error) {

        console.log(error);

      }

    }
  );

  webRTCUnsubscribes = [];

  callListenersStarted =
    false;

  candidateKeys.clear();

}


// ======================================================
// START CHAT
// ======================================================

async function startChat() {

  console.log(
    "================================="
  );

  console.log(
    "START CHAT"
  );

  console.log(
    "================================="
  );


  // --------------------------------------------
  // ALREADY SEARCHING
  // --------------------------------------------

  if (isSearching) {

    console.log(
      "Already searching"
    );

    return;

  }


  // --------------------------------------------
  // ALREADY CONNECTED
  // --------------------------------------------

  if (roomId) {

    setStatus(
      "Status: Already connected"
    );

    return;

  }


  // --------------------------------------------
  // CLEAN OLD STATE
  // --------------------------------------------

  stopWaitingListener();

  stopMessageListener();

  stopRoomListener();

  stopRoomMemberListener();

  stopWebRTCListeners();


  // --------------------------------------------
  // CREATE NEW USER
  // --------------------------------------------

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


  // --------------------------------------------
  // UI
  // --------------------------------------------

  setStatus(
    "Status: Waiting for stranger..."
  );


  if (chatBox) {

    chatBox.innerHTML =
      "";

  }


  // --------------------------------------------
  // ONLINE
  // --------------------------------------------

  startOnlineCounter();


  // --------------------------------------------
  // WAITING NODE
  // --------------------------------------------

  const myWaitingRef =
    ref(
      db,
      "waiting/" +
      myId
    );


  try {

    // ------------------------------------------
    // ADD MYSELF TO WAITING
    // ------------------------------------------

    await set(
      myWaitingRef,
      {

        id:
          myId,

        username:
          myUsername,

        roomId:
          "",

        partnerId:
          "",

        partnerUsername:
          "",

        createdAt:
          Date.now()

      }
    );


    console.log(
      "Added to waiting:",
      myId
    );


    // ------------------------------------------
    // AUTO REMOVE ON DISCONNECT
    // ------------------------------------------

    onDisconnect(
      myWaitingRef
    ).remove();


    // ------------------------------------------
    // LISTEN FOR MY MATCH
    // ------------------------------------------

    waitingUnsubscribe =
      onValue(
        myWaitingRef,
        async (snapshot) => {

          const data =
            snapshot.val();


          console.log(
            "MY WAITING DATA:",
            data
          );


          if (!data) {

            return;

          }


          // Still waiting
          if (!data.roomId) {

            return;

          }


          // Already connected
          if (
            roomId === data.roomId
          ) {

            return;

          }


          // ------------------------------------
          // MATCH FOUND
          // ------------------------------------

          console.log(
            "MATCH FOUND FROM LISTENER"
          );


          roomId =
            data.roomId;

          partnerId =
            data.partnerId ||
            null;

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


          // ------------------------------------
          // START ROOM
          // ------------------------------------

          await startRoom();


          // ------------------------------------
          // REMOVE WAITING NODE
          // ------------------------------------

          try {

            await remove(
              myWaitingRef
            );

            console.log(
              "Waiting node removed"
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


    // ------------------------------------------
    // FIND STRANGER
    // ------------------------------------------

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

    partnerId =
      null;


    try {

      await remove(
        myWaitingRef
      );

    } catch (e) {

      console.log(e);

    }


    setStatus(
      "Status: Error starting chat"
    );

  }

}


// ======================================================
// FIND RANDOM MATCH
// ======================================================

async function findMatch() {

  if (!myId) {

    return;

  }


  if (!isSearching) {

    return;

  }


  const waitingRef =
    ref(
      db,
      "waiting"
    );


  console.log(
    "SEARCHING FOR MATCH..."
  );


  try {

    const result =
      await runTransaction(
        waitingRef,
        (currentData) => {

          // ----------------------------------------
          // NO USERS
          // ----------------------------------------

          if (!currentData) {

            return currentData;

          }


          // ----------------------------------------
          // FIND AVAILABLE USERS
          // ----------------------------------------

          const availableUsers =
            Object.values(
              currentData
            )
            .filter(
              (user) => {

                return (

                  user &&

                  user.id &&

                  user.id !== myId &&

                  !user.roomId

                );

              }
            );


          console.log(
            "AVAILABLE USERS:",
            availableUsers
          );


          // ----------------------------------------
          // NO STRANGER
          // ----------------------------------------

          if (
            availableUsers.length === 0
          ) {

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


          // ----------------------------------------
          // VERIFY NODES
          // ----------------------------------------

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
              .substring(2, 10);


          // ----------------------------------------
          // USER A
          // ----------------------------------------

          currentData[myId].roomId =
            newRoomId;

          currentData[myId].partnerId =
            stranger.id;

          currentData[myId].partnerUsername =
            stranger.username ||
            "Stranger";


          // ----------------------------------------
          // USER B
          // ----------------------------------------

          currentData[stranger.id].roomId =
            newRoomId;

          currentData[stranger.id].partnerId =
            myId;

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
      "TRANSACTION COMMITTED:",
      result.committed
    );


    // ----------------------------------------
    // IMPORTANT:
    // TRANSACTION RESULT
    // ----------------------------------------

    if (!result.committed) {

      console.log(
        "No match committed"
      );

      return;

    }


    const finalData =
      result.snapshot.val();


    if (!finalData) {

      return;

    }


    const myData =
      finalData[myId];


    // ----------------------------------------
    // MATCH FOUND IMMEDIATELY
    // ----------------------------------------

    if (
      myData &&
      myData.roomId &&
      !roomId
    ) {

      console.log(
        "MATCH CONFIRMED FROM TRANSACTION"
      );


      roomId =
        myData.roomId;

      partnerId =
        myData.partnerId ||
        null;

      partnerUsername =
        myData.partnerUsername ||
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


      await startRoom();


      // --------------------------------------
      // REMOVE MY WAITING NODE
      // --------------------------------------

      try {

        await remove(
          ref(
            db,
            "waiting/" +
            myId
          )
        );

      } catch (error) {

        showError(
          "Remove matched waiting node",
          error
        );

      }

    }

  } catch (error) {

    showError(
      "Find Match",
      error
    );

  }

}


// ======================================================
// START ROOM
// ======================================================

async function startRoom() {

  if (
    !roomId ||
    !myId ||
    !partnerId
  ) {

    console.log(
      "Room cannot start - missing data"
    );

    return;

  }


  console.log(
    "STARTING ROOM:",
    roomId
  );


  // --------------------------------------------
  // ROOM MEMBER
  // --------------------------------------------

  const memberRef =
    ref(
      db,
      "rooms/" +
      roomId +
      "/members/" +
      myId
    );


  try {

    await set(
      memberRef,
      {
        id:
          myId,

        username:
          myUsername,

        joinedAt:
          Date.now()

      }
    );


    onDisconnect(
      memberRef
    ).remove();

  } catch (error) {

    showError(
      "Room member",
      error
    );

  }


  // --------------------------------------------
  // LISTEN ROOM
  // --------------------------------------------

  listenRoomStatus();


  // --------------------------------------------
  // MESSAGES
  // --------------------------------------------

  listenMessages();


  // --------------------------------------------
  // WEBRTC
  // --------------------------------------------

  setupWebRTCSignaling();

}


// ======================================================
// ROOM STATUS
// ======================================================

function listenRoomStatus() {

  if (
    !roomId ||
    !myId ||
    !partnerId
  ) {

    return;

  }


  const currentRoom =
    roomId;


  const partnerMemberRef =
    ref(
      db,
      "rooms/" +
      currentRoom +
      "/members/" +
      partnerId
    );


  stopRoomMemberListener();


  roomMemberUnsubscribe =
    onValue(
      partnerMemberRef,
      (snapshot) => {

        // --------------------------------------
        // ROOM CHANGED
        // --------------------------------------

        if (
          roomId !== currentRoom
        ) {

          return;

        }


        // --------------------------------------
        // PARTNER EXISTS
        // --------------------------------------

        if (snapshot.exists()) {

          setStatus(
            "Status: Connected with " +
            (
              partnerUsername ||
              "Stranger"
            )
          );

          return;

        }


        // --------------------------------------
        // PARTNER LEFT
        // --------------------------------------

        if (roomId === currentRoom) {

          handlePartnerDisconnected();

        }

      }
    );
// ======================================================
// END OF ROOM STATUS LISTENER
// ======================================================


// ======================================================
// PARTNER DISCONNECTED
// ======================================================

function handlePartnerDisconnected() {

  if (!roomId) {
    return;
  }

  console.log(
    "PARTNER DISCONNECTED"
  );

  const oldPartner =
    partnerUsername || "Stranger";


  // --------------------------------------------
  // STOP VOICE
  // --------------------------------------------

  stopVoice(false);


  // --------------------------------------------
  // SHOW MESSAGE
  // --------------------------------------------

  if (chatBox) {

    const div =
      document.createElement("div");

    div.innerText =
      "⚠️ " +
      oldPartner +
      " disconnected.";

    div.style.background =
      "#7f1d1d";

    div.style.padding =
      "10px";

    div.style.margin =
      "5px";

    div.style.borderRadius =
      "8px";

    chatBox.appendChild(div);

    chatBox.scrollTop =
      chatBox.scrollHeight;

  }


  // --------------------------------------------
  // STATUS
  // --------------------------------------------

  setStatus(
    "Status: Stranger disconnected"
  );


  partnerId =
    null;

  partnerUsername =
    null;

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


  stopMessageListener();


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
          Object.values(messages);


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


            div.style.padding =
              "8px";


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


  // --------------------------------------------
  // REMOTE AUDIO
  // --------------------------------------------

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


  // --------------------------------------------
  // ICE CANDIDATE
  // --------------------------------------------

  peerConnection.onicecandidate =
    async (event) => {

      if (!event.candidate) {
        return;
      }


      if (
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

        showError(
          "ICE candidate",
          error
        );

      }

    };


  // --------------------------------------------
  // CONNECTION STATE
  // --------------------------------------------

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


  // --------------------------------------------
  // ICE STATE
  // --------------------------------------------

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


  const currentRoom =
    roomId;

  const currentPartner =
    partnerId;


  // ==================================================
  // OFFER LISTENER
  // ==================================================

  const offerUnsubscribe =
    onValue(
      ref(
        db,
        "calls/" +
        currentRoom +
        "/offer"
      ),
      async (snapshot) => {

        const offer =
          snapshot.val();


        if (!offer) {
          return;
        }


        // Higher ID receives offer
        if (
          myId < currentPartner
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

            addLocalTracks();

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
              currentRoom +
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


  webRTCUnsubscribes.push(
    offerUnsubscribe
  );


  // ==================================================
  // ANSWER LISTENER
  // ==================================================

  const answerUnsubscribe =
    onValue(
      ref(
        db,
        "calls/" +
        currentRoom +
        "/answer"
      ),
      async (snapshot) => {

        const answer =
          snapshot.val();


        if (!answer) {
          return;
        }


        // Lower ID is caller
        if (
          myId > currentPartner
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


  webRTCUnsubscribes.push(
    answerUnsubscribe
  );


  // ==================================================
  // REMOTE ICE CANDIDATES
  // ==================================================

  const candidateUnsubscribe =
    onValue(
      ref(
        db,
        "calls/" +
        currentRoom +
        "/candidates/" +
        currentPartner
      ),
      async (snapshot) => {

        if (!peerConnection) {
          return;
        }


        const candidates =
          snapshot.val();


        if (!candidates) {
          return;
        }


        for (
          const [key, candidate]
          of Object.entries(candidates)
        ) {

          if (
            candidateKeys.has(key)
          ) {

            continue;

          }


          candidateKeys.add(key);


          try {

            await peerConnection.addIceCandidate(
              new RTCIceCandidate(
                candidate
              )
            );

          } catch (error) {

            console.log(
              "ICE candidate error:",
              error
            );

          }

        }

      }
    );


  webRTCUnsubscribes.push(
    candidateUnsubscribe
  );

}


// ======================================================
// ADD LOCAL TRACKS
// ======================================================

function addLocalTracks() {

  if (
    !peerConnection ||
    !localStream
  ) {

    return;

  }


  const senders =
    peerConnection.getSenders();


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

          peerConnection.addTrack(
            track,
            localStream
          );

        }

      }
    );

}


// ======================================================
// START VOICE
// ======================================================

async function startVoice() {

  if (!roomId) {

    alert(
      "Pehle stranger se connect ho."
    );

    return;

  }


  if (isVoiceActive) {
    return;
  }


  try {

    localStream =
      await navigator.mediaDevices.getUserMedia(
        {
          audio: true,
          video: false
        }
      );


    const pc =
      createPeerConnection();


    addLocalTracks();


    candidateKeys.clear();


    setupWebRTCSignaling();


    // --------------------------------------------
    // CALLER
    // --------------------------------------------

    if (
      myId < partnerId
    ) {

      console.log(
        "I AM CALLER"
      );


      const offer =
        await pc.createOffer();


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
            offer.sdp
        }
      );


      console.log(
        "OFFER SENT"
      );

    } else {

      console.log(
        "I AM CALLEE"
      );

    }


    if (voiceBtn) {

      voiceBtn.innerText =
        "🎙️ Calling...";

    }


    setStatus(
      "Status: Starting voice..."
    );


  } catch (error) {

    showError(
      "Start Voice",
      error
    );


    if (
      error &&
      error.name ===
      "NotAllowedError"
    ) {

      alert(
        "Microphone permission allow karo."
      );

    } else {

      alert(
        "Voice start nahi ho paaya."
      );

    }

  }

}


// ======================================================
// MUTE / UNMUTE
// ======================================================

function toggleMute() {

  if (!localStream) {
    return;
  }


  const audioTracks =
    localStream.getAudioTracks();


  audioTracks.forEach(
    (track) => {

      track.enabled =
        !track.enabled;

    }
  );


  isMuted =
    !audioTracks.some(
      (track) =>
        track.enabled
    );


  if (muteBtn) {

    muteBtn.innerText =
      isMuted
        ? "🔇 Unmute"
        : "🔊 Mute";

  }

}


// ======================================================
// STOP VOICE
// ======================================================

async function stopVoice(
  updateStatus = true
) {

  console.log(
    "STOP VOICE"
  );


  isVoiceActive =
    false;

  isMuted =
    false;


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


  if (peerConnection) {

    try {

      peerConnection.close();

    } catch (error) {

      console.log(error);

    }

    peerConnection =
      null;

  }


  if (remoteAudio) {

    remoteAudio.srcObject =
      null;

  }


  stopWebRTCListeners();


  if (voiceBtn) {

    voiceBtn.innerText =
      "🎙️ Start Voice";

  }


  if (muteBtn) {

    muteBtn.innerText =
      "🔊 Mute";

  }


  if (updateStatus) {

    if (partnerUsername) {

      setStatus(
        "Status: Connected with " +
        partnerUsername
      );

    } else {

      setStatus(
        "Status: Voice ended"
      );

    }

  }


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

      console.log(
        "Call cleanup:",
        error
      );

    }

  }

}


// ======================================================
// NEXT STRANGER
// ======================================================

async function nextStranger() {

  console.log(
    "NEXT STRANGER"
  );


  // --------------------------------------------
  // REMOVE WAITING
  // --------------------------------------------

  if (
    myId &&
    isSearching
  ) {

    try {

      await remove(
        ref(
          db,
          "waiting/" +
          myId
        )
      );

    } catch (error) {

      console.log(error);

    }

  }


  // --------------------------------------------
  // STOP VOICE
  // --------------------------------------------

  await stopVoice(false);


  // --------------------------------------------
  // REMOVE ROOM MEMBER
  // --------------------------------------------

  if (
    roomId &&
    myId
  ) {

    try {

      await remove(
        ref(
          db,
          "rooms/" +
          roomId +
          "/members/" +
          myId
        )
      );

    } catch (error) {

      console.log(error);

    }

  }


  // --------------------------------------------
  // CLEAN LISTENERS
  // --------------------------------------------

  stopWaitingListener();

  stopMessageListener();

  stopRoomListener();

  stopRoomMemberListener();

  stopWebRTCListeners();


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

  isSearching =
    false;


  if (chatBox) {

    chatBox.innerHTML =
      "";

  }


  setStatus(
    "Status: Finding next stranger..."
  );


  // --------------------------------------------
  // NEW SEARCH
  // --------------------------------------------

  await startChat();

}


// ======================================================
// DISCONNECT CHAT
// ======================================================

async function disconnectChat() {

  console.log(
    "DISCONNECT CHAT"
  );


  if (myId) {

    try {

      await remove(
        ref(
          db,
          "waiting/" +
          myId
        )
      );

    } catch (error) {

      console.log(error);

    }

  }


  await stopVoice(false);


  if (
    roomId &&
    myId
  ) {

    try {

      await remove(
        ref(
          db,
          "rooms/" +
          roomId +
          "/members/" +
          myId
        )
      );

    } catch (error) {

      console.log(error);

    }

  }


  stopWaitingListener();

  stopMessageListener();

  stopRoomListener();

  stopRoomMemberListener();

  stopWebRTCListeners();


  myId =
    null;

  roomId =
    null;

  partnerId =
    null;

  partnerUsername =
    null;

  isSearching =
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
// ENTER KEY
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
// PAGE CLOSE / REFRESH
// ======================================================

window.addEventListener(
  "beforeunload",
  () => {

    if (myId) {

      try {

        remove(
          ref(
            db,
            "waiting/" +
            myId
          )
        );

      } catch (error) {

        console.log(error);

      }

    }

  }
);

// ======================================================
// FINAL CLEANUP / INITIALIZATION
// ======================================================

// Make sure old search state is clean
isSearching = false;
roomId = null;
partnerId = null;
partnerUsername = null;


// ======================================================
// START CHAT BUTTON
// ======================================================

if (startBtn) {

  startBtn.addEventListener(
    "click",
    () => {

      startChat();

    }
  );

}


// ======================================================
// SEND MESSAGE BUTTON
// ======================================================

if (sendBtn) {

  sendBtn.addEventListener(
    "click",
    () => {

      sendMessage();

    }
  );

}


// ======================================================
// ENTER KEY = SEND MESSAGE
// ======================================================

if (msgInput) {

  msgInput.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        sendMessage();

      }

    }
  );

}


// ======================================================
// DISCONNECT / NEXT STRANGER
// ======================================================

if (disconnectBtn) {

  disconnectBtn.addEventListener(
    "click",
    async () => {

      await nextStranger();

    }
  );

}


// ======================================================
// VOICE BUTTON
// ======================================================

if (voiceBtn) {

  voiceBtn.addEventListener(
    "click",
    async () => {

      if (!roomId || !partnerId) {

        alert(
          "Pehle stranger se connect ho."
        );

        return;

      }

      if (isVoiceActive) {

        return;

      }

      await startVoice();

    }
  );

}


// ======================================================
// MUTE BUTTON
// ======================================================

if (muteBtn) {

  muteBtn.addEventListener(
    "click",
    () => {

      toggleMute();

    }
  );

}


// ======================================================
// END VOICE BUTTON
// ======================================================

if (endVoiceBtn) {

  endVoiceBtn.addEventListener(
    "click",
    () => {

      stopVoice(true);

    }
  );

}


// ======================================================
// PAGE READY
// ======================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    console.log(
      "===================================="
    );

    console.log(
      "TALK TO SMILE READY"
    );

    console.log(
      "Random Chat + Text + Voice"
    );

    console.log(
      "===================================="
    );

  }
);


// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

window.addEventListener(
  "error",
  (event) => {

    console.error(
      "GLOBAL ERROR:",
      event.error || event.message
    );

  }
);


window.addEventListener(
  "unhandledrejection",
  (event) => {

    console.error(
      "UNHANDLED PROMISE:",
      event.reason
    );

  }
);


// ======================================================
// END OF SCRIPT
// ======================================================
