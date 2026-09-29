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


// =====================================================
// FIREBASE
// =====================================================

const firebaseConfig = {
  apiKey: "PASTE_YOUR_ORIGINAL_FIREBASE_API_KEY_HERE",
  authDomain: "talktosmile-16bca.firebaseapp.com",
  databaseURL: "https://talktosmile-16bca-default-rtdb.firebaseio.com",
  projectId: "talktosmile-16bca",
  storageBucket: "talktosmile-16bca.appspot.com",
  messagingSenderId: "550139117184",
  appId: "1:550139117184:web:c354dce8e28c8e2144f065"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);


// =====================================================
// VARIABLES
// =====================================================

let myId = null;
let myUsername = null;
let roomId = null;
let listening = false;

let localStream = null;
let peerConnection = null;


// =====================================================
// ELEMENTS
// =====================================================

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


// =====================================================
// STATUS
// =====================================================

function setStatus(text) {
  if (statusElement) {
    statusElement.innerText = text;
  }
}


// =====================================================
// USER ID
// =====================================================

function generateUserId() {
  return (
    "user_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .substring(2, 8)
  );
}


// =====================================================
// ONLINE COUNTER
// =====================================================

function startOnlineCounter() {

  if (!myId) return;

  const myOnlineRef =
    ref(db, "onlineUsers/" + myId);

  const connectedRef =
    ref(db, ".info/connected");

  onValue(connectedRef, (snapshot) => {

    if (snapshot.val() === true) {

      set(myOnlineRef, {
        username: myUsername || "Stranger",
        online: true,
        lastSeen: Date.now()
      });

      onDisconnect(myOnlineRef).remove();
    }

  });

  onValue(
    ref(db, "onlineUsers"),
    (snapshot) => {

      const users = snapshot.val();

      const count = users
        ? Object.keys(users).length
        : 0;

      if (onlineCount) {
        onlineCount.innerText = count;
      }

    }
  );
}


// =====================================================
// START CHAT
// =====================================================

async function startChat() {

  if (listening) return;

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

  myUsername =
    username.substring(0, 20);

  if (usernameInput) {
    usernameInput.value =
      myUsername;
  }

  myId =
    generateUserId();

  roomId = null;

  listening = true;

  setStatus(
    "Status: Waiting..."
  );

  startOnlineCounter();

  const myWaitingRef =
    ref(
      db,
      "waiting/" + myId
    );

  try {

    await set(
      myWaitingRef,
      {
        id: myId,
        username: myUsername,
        roomId: null,
        partnerUsername: null
      }
    );

    onDisconnect(
      myWaitingRef
    ).remove();

    await findMatch();

    onValue(
      myWaitingRef,
      (snapshot) => {

        const data =
          snapshot.val();

        if (!data) return;

        if (!data.roomId) return;

        if (roomId) return;

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

        listenMessages();

        listenRoomStatus();

        remove(
          myWaitingRef
        );

      }
    );

  } catch (error) {

    console.error(
      "START CHAT ERROR:",
      error
    );

    listening = false;
    myId = null;

    setStatus(
      "Status: Connection error"
    );

    alert(
      "Firebase connection error. Check Firebase Database Rules."
    );

  }
}


// =====================================================
// FIND RANDOM MATCH
// =====================================================

async function findMatch() {

  const waitingRef =
    ref(db, "waiting");

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

      const otherUsers =
        users.filter(
          (user) => {

            return (
              user &&
              user.id !== myId &&
              !user.roomId
            );

          }
        );

      if (
        otherUsers.length === 0
      ) {
        return currentData;
      }

      const otherUser =
        otherUsers[
          Math.floor(
            Math.random() *
            otherUsers.length
          )
        ];

      if (
        !currentData[myId] ||
        !currentData[otherUser.id]
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

      currentData[myId].roomId =
        newRoomId;

      currentData[myId]
        .partnerUsername =
        otherUser.username;

      currentData[
        otherUser.id
      ].roomId =
        newRoomId;

      currentData[
        otherUser.id
      ].partnerUsername =
        myUsername;

      return currentData;

    }
  );
}


// =====================================================
// SEND MESSAGE
// =====================================================

function sendMessage() {

  if (!msgInput) return;

  const msg =
    msgInput.value.trim();

  if (!msg) return;

  if (!roomId) {

    alert(
      "Pehle kisi stranger se connect ho!"
    );

    return;
  }

  push(
    ref(
      db,
      "messages/" + roomId
    ),
    {
      text: msg,
      sender: myId,
      username: myUsername,
      timestamp: Date.now()
    }
  );

  msgInput.value = "";

  msgInput.focus();
}


// =====================================================
// RECEIVE MESSAGES
// =====================================================

function listenMessages() {

  if (!roomId) return;

  const currentRoomId =
    roomId;

  onValue(
    ref(
      db,
      "messages/" +
      currentRoomId
    ),
    (snapshot) => {

      if (
        roomId !== currentRoomId
      ) {
        return;
      }

      if (!chatBox) return;

      chatBox.innerHTML = "";

      const messages =
        snapshot.val();

      if (!messages) return;

      Object.values(
        messages
      ).forEach(
        (message) => {

          const div =
            document.createElement(
              "div"
            );

          div.style.marginBottom =
            "8px";

          div.innerText =
            (
              message.sender === myId
                ? "You"
                : (
                    message.username ||
                    "Stranger"
                  )
            ) +
            ": " +
            message.text;

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


// =====================================================
// DISCONNECT
// =====================================================

async function disconnectChat() {

  const oldId =
    myId;

  const oldRoom =
    roomId;

  endVoice();

  if (oldId) {

    try {

      await remove(
        ref(
          db,
          "waiting/" +
          oldId
        )
      );

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

  myId = null;
  myUsername = null;
  roomId = null;
  listening = false;

  if (chatBox) {
    chatBox.innerHTML = "";
  }

  setStatus(
    "Status: Stranger disconnected"
  );
}


// =====================================================
// NEXT STRANGER
// =====================================================

async function nextStranger() {

  await disconnectChat();

  setTimeout(
    () => {
      startChat();
    },
    500
  );
}


// =====================================================
// STRANGER DISCONNECT DETECTION
// =====================================================

function listenRoomStatus() {

  if (!roomId) return;

  const currentRoomId =
    roomId;

  const roomRef =
    ref(
      db,
      "rooms/" +
      currentRoomId
    );

  onValue(
    roomRef,
    (snapshot) => {

      const room =
        snapshot.val();

      if (
        room &&
        room.status ===
        "disconnected" &&
        roomId ===
        currentRoomId
      ) {

        endVoice();

        roomId = null;

        listening = false;

        setStatus(
          "Status: Stranger disconnected"
        );

        if (chatBox) {
          chatBox.innerHTML = "";
        }
      }

    }
  );
}


// =====================================================
// WEBRTC
// =====================================================

const rtcConfig = {

  iceServers: [
    {
      urls:
        "stun:stun.l.google.com:19302"
    }
  ]

};


// =====================================================
// START VOICE
// =====================================================

async function startVoice() {

  if (!roomId) {

    alert(
      "Pehle kisi stranger se connect ho!"
    );

    return;
  }

  if (peerConnection) return;

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {

    alert(
      "Voice chat browser mein supported nahi hai."
    );

    return;
  }

  try {

    const currentRoomId =
      roomId;

    localStream =
      await navigator
        .mediaDevices
        .getUserMedia({
          audio: true
        });

    peerConnection =
      new RTCPeerConnection(
        rtcConfig
      );

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

    peerConnection.ontrack =
      (event) => {

        if (!remoteAudio) return;

        remoteAudio.srcObject =
          event.streams[0];

        remoteAudio
          .play()
          .catch(
            () => {}
          );
      };

    peerConnection.onicecandidate =
      (event) => {

        if (!event.candidate) {
          return;
        }

        push(
          ref(
            db,
            "voice/" +
            currentRoomId +
            "/candidates/" +
            myId
          ),
          event.candidate.toJSON()
        );
      };

    setStatus(
      "Status: Voice starting..."
    );

    const callerRef =
      ref(
        db,
        "voice/" +
        currentRoomId +
        "/caller"
      );

    const result =
      await runTransaction(
        callerRef,
        (current) => {

          return current || myId;

        }
      );

    const callerId =
      result.snapshot.val();

    if (
      callerId === myId
    ) {

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
          "voice/" +
          currentRoomId +
          "/offer"
        ),
        {
          type: offer.type,
          sdp: offer.sdp
        }
      );

      listenForVoiceAnswer(
        currentRoomId
      );

    } else {

      listenForVoiceOffer(
        currentRoomId
      );

    }

    listenForVoiceCandidates(
      currentRoomId
    );

  } catch (error) {

    console.error(
      "VOICE ERROR:",
      error
    );

    endVoice();

    alert(
      "Microphone permission allow karo."
    );

    setStatus(
      "Status: Connected"
    );
  }
}


// =====================================================
// RECEIVE VOICE OFFER
// =====================================================

function listenForVoiceOffer(
  currentRoomId
) {

  const offerRef =
    ref(
      db,
      "voice/" +
      currentRoomId +
      "/offer"
    );

  onValue(
    offerRef,
    async (snapshot) => {

      const offer =
        snapshot.val();

      if (
        !offer ||
        !peerConnection
      ) {
        return;
      }

      if (
        peerConnection
          .remoteDescription
      ) {
        return;
      }

      try {

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
            "voice/" +
            currentRoomId +
            "/answer"
          ),
          {
            type: answer.type,
            sdp: answer.sdp
          }
        );

        setStatus(
          "Status: Voice connected 🎙️"
        );

      } catch (error) {

        console.error(
          "VOICE OFFER ERROR:",
          error
        );

      }
    }
  );
}


// =====================================================
// RECEIVE VOICE ANSWER
// =====================================================

function listenForVoiceAnswer(
  currentRoomId
) {

  const answerRef =
    ref(
      db,
      "voice/" +
      currentRoomId +
      "/answer"
    );

  onValue(
    answerRef,
    async (snapshot) => {

      const answer =
        snapshot.val();

      if (
        !answer ||
        !peerConnection
      ) {
        return;
      }

      if (
        peerConnection
          .remoteDescription
      ) {
        return;
      }

      try {

        await peerConnection
          .setRemoteDescription(
            new RTCSessionDescription(
              answer
            )
          );

        setStatus(
          "Status: Voice connected 🎙️"
        );

      } catch (error) {

        console.error(
          "VOICE ANSWER ERROR:",
          error
        );

      }
    }
  );
}


// =====================================================
// ICE CANDIDATES
// =====================================================

function listenForVoiceCandidates(
  currentRoomId
) {

  const candidatesRef =
    ref(
      db,
      "voice/" +
      currentRoomId +
      "/candidates"
    );

  const addedCandidates =
    new Set();

  onValue(
    candidatesRef,
    async (snapshot) => {

      const allCandidates =
        snapshot.val();

      if (
        !allCandidates ||
        !peerConnection
      ) {
        return;
      }

      for (
        const userId
        of Object.keys(
          allCandidates
        )
      ) {

        if (
          userId === myId
        ) {
          continue;
        }

        const candidates =
          allCandidates[
            userId
          ];

        if (!candidates) {
          continue;
        }

        for (
          const candidateId
          of Object.keys(
            candidates
          )
        ) {

          if (
            addedCandidates.has(
              candidateId
            )
          ) {
            continue;
          }

          addedCandidates.add(
            candidateId
          );

          try {

            await peerConnection
              .addIceCandidate(
                new RTCIceCandidate(
                  candidates[
                    candidateId
                  ]
                )
              );

          } catch (error) {

            console.error(
              "ICE ERROR:",
              error
            );

          }
        }
      }
    }
  );
}


// =====================================================
// MUTE
// =====================================================

function muteVoice() {

  if (!localStream) return;

  localStream
    .getAudioTracks()
    .forEach(
      (track) => {

        track.enabled =
          !track.enabled;

      }
    );
}


// =====================================================
// END VOICE
// =====================================================

function endVoice() {

  if (localStream) {

    localStream
      .getTracks()
      .forEach(
        (track) => {
          track.stop();
        }
      );

    localStream = null;
  }

  if (peerConnection) {

    peerConnection.close();

    peerConnection = null;
  }

  if (remoteAudio) {

    remoteAudio.srcObject =
      null;
  }
}


// =====================================================
// BUTTONS
// =====================================================

const startBtn =
  document.getElementById(
    "startBtn"
  );

if (startBtn) {

  startBtn.addEventListener(
    "click",
    startChat
  );

}


const disconnectBtn =
  document.getElementById(
    "disconnectBtn"
  );

if (disconnectBtn) {

  disconnectBtn.addEventListener(
    "click",
    nextStranger
  );

}


const sendBtn =
  document.getElementById(
    "sendBtn"
  );

if (sendBtn) {

  sendBtn.addEventListener(
    "click",
    sendMessage
  );

}


const voiceBtn =
  document.getElementById(
    "voiceBtn"
  );

if (voiceBtn) {

  voiceBtn.addEventListener(
    "click",
    startVoice
  );

}


const muteBtn =
  document.getElementById(
    "muteBtn"
  );

if (muteBtn) {

  muteBtn.addEventListener(
    "click",
    muteVoice
  );

}


const endVoiceBtn =
  document.getElementById(
    "endVoiceBtn"
  );

if (endVoiceBtn) {

  endVoiceBtn.addEventListener(
    "click",
    endVoice
  );

}


// =====================================================
// ENTER TO SEND
// =====================================================

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


// =====================================================
// PAGE LOAD
// =====================================================

window.addEventListener(
  "load",
  () => {

    if (
      usernameInput &&
      !usernameInput.value
    ) {

      usernameInput.value =
        "Stranger" +
        Math.floor(
          Math.random() * 10000
        );
    }

    setStatus(
      "Status: Idle"
    );

  }
);
