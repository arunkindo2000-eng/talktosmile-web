import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, push, remove, off } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
let listening = false;

// 🔥 START CHAT
function startChat(){

  if(listening) return;

  myId = "user_" + Date.now();
  document.getElementById("status").innerText = "Status: Waiting...";

  const waitingRef = ref(db,"waiting");

  // khud ko waiting me daalo
  set(ref(db,"waiting/"+myId),{
    id: myId
  });

  listening = true;

  onValue(waitingRef,(snapshot)=>{

    const users = snapshot.val();
    if(!users) return;

    const ids = Object.keys(users);

    for(let id of ids){

      if(id !== myId){

        // room create
        roomId = "room_" + Date.now();

        set(ref(db,"rooms/"+roomId),{
          user1: myId,
          user2: id
        });

        // waiting clean
        remove(ref(db,"waiting/"+id));
        remove(ref(db,"waiting/"+myId));

        document.getElementById("status").innerText = "Status: Connected";

        listenMessages();
        return;
      }
    }

  });

}

// 🔥 SEND MESSAGE
function sendMessage(){

  const msg = document.getElementById("msgInput").value;

  if(!msg || !roomId) return;

  push(ref(db,"messages/"+roomId),{
    text: msg,
    sender: myId
  });

  document.getElementById("msgInput").value="";
}

// 🔥 LISTEN MESSAGES
function listenMessages(){

  onValue(ref(db,"messages/"+roomId),(snapshot)=>{

    const box = document.getElementById("chatBox");
    box.innerHTML="";

    const msgs = snapshot.val();
    if(!msgs) return;

    Object.values(msgs).forEach(m=>{

      const div = document.createElement("div");
      div.innerText = (m.sender === myId ? "You: " : "Stranger: ") + m.text;
      box.appendChild(div);

    });

  });

}

// 🔥 DISCONNECT
function disconnectChat(){

  if(myId){
    remove(ref(db,"waiting/"+myId));
  }

  if(roomId){
    remove(ref(db,"messages/"+roomId));
    remove(ref(db,"rooms/"+roomId));
  }

  // reset
  myId = null;
  roomId = null;
  listening = false;

  document.getElementById("status").innerText = "Status: Disconnected";
}

// 🔥 BUTTON EVENTS
document.getElementById("startBtn").onclick = startChat;
document.getElementById("sendBtn").onclick = sendMessage;
document.getElementById("disconnectBtn").onclick = disconnectChat;
