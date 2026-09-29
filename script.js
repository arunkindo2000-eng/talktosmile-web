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
  apiKey: "AIzaSyCv6ISry_cbpR89phb1D68wkM4V_DHQPQPQ",
  authDomain: "talktosmile-16bca.firebaseapp.com",
  databaseURL: "https://talktosmile-16bca-default-rtdb.firebaseio.com",
  projectId: "talktosmile-16bca",
  storageBucket: "talktosmile-16bca.appspot.com",
  messagingSenderId: "550139117184",
  appId: "1:550139117184:web:c354dce8e28c8e2144f065"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);


// ===============================
// GLOBAL VARIABLES
// ===============================

let myId = null;
let myUsername = null;
let roomId = null;
let listening = false;

let localStream = null;
let peerConnection = null;


// ===============================
// ONLINE COUNTER
// ===============================

function startOnlineCounter() {

  if (!myId) return;

  const myOnlineRef = ref(db, "onlineUsers/" + myId);
  const connectedRef = ref(db, ".info/connected");

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

  onValue(ref(db, "onlineUsers"), (snapshot) => {

    const users = snapshot.val();

    const count = users
      ? Object.keys(users).length
      : 0;

    const counter =
      document.getElementById("onlineCount");

    if (counter) {
      counter.innerText = count;
    }

  });
}


// ===============================
// START CHAT
// ===============================

async function startChat() {

  if (listening) return;

  const usernameInput =
    document.getElementById("usernameInput");

  let username =
    usernameInput
      ? usernameInput.value.trim()
      : "";

  myUsername =
    (username ||
      "Stranger" +
      Math.floor(Math.random() * 10000))
      .substring(0, 20);

  myId =
    "user_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .substring(2, 7);

  listening = true;

  const status =
    document.getElementById("status");

  if (status) {
    status.innerText =
      "Status: Waiting...";
  }

  startOnlineCounter();


  const myWaitingRef =
    ref(db, "waiting/" + myId);


  try {

    await set(myWaitingRef, {

      id: myId,
      username: myUsername,
      roomId: null,
      partnerUsername: null

    });


    onDisconnect(myWaitingRef).remove();


    await findMatch();


    onValue(myWaitingRef, (snapshot) => {

      const data = snapshot.val();

      if (!data) return;

      if (!data.roomId) return;

      if (roomId) return;


      roomId = data.roomId;


      set(
        ref(db, "rooms/" + roomId + "/status"),
        "connected"
      );


      if (status) {

        status.innerText =
          "Status: Connected with " +
          (data.partnerUsername ||
            "Stranger");

      }


      listenMessages();

      listenRoomStatus();


      remove(myWaitingRef);

    });


  } catch (error) {

    console.error(
      "Start chat error:",
      error
    );

    listening = false;

    if (status) {
      status.innerText =
        "Status: Connection error";
    }

    alert(
      "Firebase connection error. Check Firebase Database Rules."
    );
  }
}


// ===============================
// FIND RANDOM MATCH
// ===============================

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
        Object.values(currentData);


      const otherUsers =
        users.filter((user) => {

          return (
            user.id !== myId &&
            !user.roomId
          );

        });


      if (otherUsers.length === 0) {

        return currentData;

      }


      const otherUser =
        otherUsers[
          Math.floor(
            Math.random() *
            otherUsers.length
          )
        ];


      const newRoomId =
        "room_" +
        Date.now() +
        "_" +
        Math.random()
          .toString(36)
          .substring(2, 7);


      if (!currentData[myId]) {
        return currentData;
      }

      if (!currentData[otherUser.id]) {
        return currentData;
      }


      currentData[myId].roomId =
        newRoomId;

      currentData[myId].partnerUsername =
        otherUser.username;


      currentData[otherUser.id].roomId =
        newRoomId;

      currentData[otherUser.id].partnerUsername =
        myUsername;


      return currentData;

    }
  );
}


// ===============================
// SEND MESSAGE
// ===============================

function sendMessage() {

  const msgInput =
    document.getElementById("msgInput");

  if (!msgInput) return;

  const msg =
    msgInput.value.trim();


  if (!msg) return;

  if (!roomId) {

    alert(
      "Pehle stranger se connect ho!"
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
      username: myUsername

    }
  );


  msgInput.value = "";
}


// ===============================
// LISTEN MESSAGES
// ===============================

function listenMessages() {

  if (!roomId) return;


  onValue(
    ref(
      db,
      "messages/" + roomId
    ),
    (snapshot) => {

      const box =
        document.getElementById("chatBox");

      if (!box) return;


      box.innerHTML = "";


      const msgs =
        snapshot.val();


      if (!msgs) return;


      Object.values(msgs)
        .forEach((m) => {

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


// ===============================
// DISCONNECT CHAT
// ===============================

async function disconnectChat() {

  const oldRoomId =
    roomId;

  const oldMyId =
    myId;


  if (oldMyId) {

    await remove(
      ref(
        db,
        "waiting/" + oldMyId
      )
    );

    await remove(
      ref(
        db,
        "onlineUsers/" + oldMyId
      )
    );
  }


  if (oldRoomId) {

    await set(
      ref(
        db,
        "rooms/" +
        oldRoomId +
        "/status"
      ),
      "disconnected"
    );

    await remove(
      ref(
        db,
        "messages/" +
        oldRoomId
      )
    );

    await remove(
      ref(
        db,
        "voice/" +
        oldRoomId
      )
    );
  }


  endVoice();


  myId = null;
  myUsername = null;
  roomId = null;
  listening = false;


  const status =
    document.getElementById("status");

  if (status) {

    status.innerText =
      "Status: Stranger disconnected";

  }


  const box =
    document.getElementById("chatBox");

  if (box) {
    box.innerHTML = "";
  }
}


// ===============================
// STRANGER DISCONNECT
// ===============================

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
        roomId === currentRoomId
      ) {

        endVoice();

        roomId = null;

        listening = false;


        const status =
          document.getElementById(
            "status"
          );

        if (status) {

          status.innerText =
            "Status: Stranger disconnected";

        }


        const box =
          document.getElementById(
            "chatBox"
          );

        if (box) {
          box.innerHTML = "";
        }

      }

    }
  );
}


// ===============================
// VOICE CHAT
// ===============================

const rtcConfig = {

  iceServers: [

    {
      urls:
        "stun:stun.l.google.com:19302"
    }

  ]

};


async function startVoice() {

  if (!roomId) {

    alert(
      "Pehle kisi stranger se connect ho!"
    );

    return;
  }


  if (peerConnection) return;


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
      .forEach((track) => {

        peerConnection.addTrack(
          track,
          localStream
        );

      });


    peerConnection.ontrack =
      (event) => {

        const remoteAudio =
          document.getElementById(
            "remoteAudio"
          );

        if (!remoteAudio) return;

        remoteAudio.srcObject =
          event.streams[0];

        remoteAudio
          .play()
          .catch(() => {});

      };


    peerConnection.onicecandidate =
      (event) => {

        if (!event.candidate)
          return;


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


    const status =
      document.getElementById(
        "status"
      );

    if (status) {

      status.innerText =
        "Voice starting...";

    }


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


    if (callerId === myId) {

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
      "Voice error:",
      error
    );

    alert(
      "Microphone permission allow karo."
    );

    endVoice();

  }
}


// ===============================
// VOICE OFFER
// ===============================

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
      ) return;


      if (
        peerConnection
          .remoteDescription
      ) return;


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


        const status =
          document.getElementById(
            "status"
          );

        if (status) {

          status.innerText =
            "Voice connected 🎙️";

        }

      } catch (error) {

        console.error(
          "Voice offer error:",
          error
        );

      }

    }
  );
}


// ===============================
// VOICE ANSWER
// ===============================

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
      ) return;


      if (
        peerConnection
          .remoteDescription
      ) return;


      try {

        await peerConnection
          .setRemoteDescription(
            new RTCSessionDescription(
              answer
            )
          );


        const status =
          document.getElementById(
            "status"
          );

        if (status) {

          status.innerText =
            "Voice connected 🎙️";

        }

      } catch (error) {

        console.error(
          "Voice answer error:",
          error
        );

      }

    }
  );
}


// ===============================
// ICE CANDIDATES
// ===============================

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
      ) return;


      for (
        const userId
        of Object.keys(
          allCandidates
        )
      ) {

        if (userId === myId)
          continue;


        const candidates =
          allCandidates[userId];


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
          ) continue;


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
              "ICE error:",
              error
            );

          }

        }

      }

    }
  );
}


// ===============================
// MUTE
// ===============================

function muteVoice() {

  if (!localStream) return;


  localStream
    .getAudioTracks()
    .forEach((track) => {

      track.enabled =
        !track.enabled;

    });
}


// ===============================
// END VOICE
// ===============================

function endVoice() {

  if (localStream) {

    localStream
      .getTracks()
      .forEach((track) => {
        track.stop();
      });

    localStream = null;
  }


  if (peerConnection) {

    peerConnection.close();

    peerConnection = null;

  }


  const remoteAudio =
    document.getElementById(
      "remoteAudio"
    );


  if (remoteAudio) {

    remoteAudio.srcObject =
      null;

  }
}


// ===============================
// BUTTON EVENTS
// ===============================

const startBtn =
  document.getElementById(
    "startBtn"
  );

if (startBtn) {

  startBtn.onclick =
    startChat;

}


const sendBtn =
  document.getElementById(
    "sendBtn"
  );

if (sendBtn) {

  sendBtn.onclick =
    sendMessage;

}


const disconnectBtn =
  document.getElementById(
    "disconnectBtn"
  );

if (disconnectBtn) {

  disconnectBtn.onclick =
    disconnectChat;

}


const voiceBtn =
  document.getElementById(
    "voiceBtn"
  );

if (voiceBtn) {

  voiceBtn.onclick =
    startVoice;

}


const muteBtn =
  document.getElementById(
    "muteBtn"
  );

if (muteBtn) {

  muteBtn.onclick =
    muteVoice;

}


const endVoiceBtn =
  document.getElementById(
    "endVoiceBtn"
  );

if (endVoiceBtn) {

  endVoiceBtn.onclick =
    endVoice;

}


// ===============================
// ENTER TO SEND
// ===============================

const msgInput =
  document.getElementById(
    "msgInput"
  );


if (msgInput) {

  msgInput.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        sendMessage();

      }

    }
  );

}


// ===============================
// AUTO CONNECT
// ===============================

window.addEventListener(
  "load",
  () => {

    const usernameInput =
      document.getElementById(
        "usernameInput"
      );


    if (usernameInput) {

      if (!usernameInput.value) {

        usernameInput.value =
          "Stranger" +
          Math.floor(
            Math.random() *
            10000
          );

      }

      setTimeout(
        () => {

          startChat();

        },
        1000
      );

    }

  }
);
