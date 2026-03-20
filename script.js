import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, set, onValue, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
let roomId = null;

function startChat(){

  myId = "user_" + Date.now();

  const waitingRef = ref(db, "waiting");

  document.getElementById("status").innerText = "Status: Waiting...";

  onValue(waitingRef, (snapshot)=>{

    const users = snapshot.val();

    if(users){

      const ids = Object.keys(users);

      // agar koi already waiting hai
      for(let id of ids){

        if(id !== myId){

          // ROOM CREATE
          roomId = "room_" + Date.now();

          set(ref(db, "rooms/" + roomId), {
            user1: myId,
            user2: id
          });

          // dono ko waiting se hatao
          remove(ref(db, "waiting/" + id));
          remove(ref(db, "waiting/" + myId));

          document.getElementById("status").innerText = "Status: Connected";

          listenMessages();
          return;
        }
      }
    }

    // agar koi nahi mila → waiting me add ho jao
    set(ref(db, "waiting/" + myId), {
      id: myId
    });

  }, { onlyOnce: true });

}
    }

  });

}

// 🔹 SEND MESSAGE
function sendMessage(){

  const input = document.getElementById("msgInput");
  const msg = input.value;

  if(!msg || !roomId) return;

  push(ref(db,"messages/"+roomId),{
    text: msg,
    sender: myId
  });

  input.value = "";
}

// 🔹 LISTEN MESSAGE
function listenMessages(){

  onValue(ref(db,"messages/"+roomId),(snapshot)=>{

    const box = document.getElementById("chatBox");
    box.innerHTML = "";

    const msgs = snapshot.val();
    if(!msgs) return;

    Object.values(msgs).forEach(m=>{
      const div = document.createElement("div");
      div.innerText = (m.sender === myId ? "You: " : "Stranger: ") + m.text;
      box.appendChild(div);
    });

  });

}

// 🔹 DISCONNECT
function disconnectChat(){

  if(roomId){
    remove(ref(db,"messages/"+roomId));
  }

  document.getElementById("status").innerText = "Status: Disconnected";
}

// 🔹 BUTTONS
document.getElementById("startBtn").onclick = startChat;
document.getElementById("sendBtn").onclick = sendMessage;
document.getElementById("disconnectBtn").onclick = disconnectChat;
