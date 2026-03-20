import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, push, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
  document.getElementById("status").innerText = "Status: Waiting...";

  const waitingRef = ref(db,"waiting");

  onValue(waitingRef,(snapshot)=>{

    const users = snapshot.val();

    if(users){
      const ids = Object.keys(users);

      for(let id of ids){
        if(id !== myId){

          roomId = "room_" + Date.now();

          set(ref(db,"rooms/"+roomId),{
            user1: myId,
            user2: id
          });

          remove(ref(db,"waiting/"+id));
          remove(ref(db,"waiting/"+myId));

          document.getElementById("status").innerText = "Status: Connected";

          listenMessages();
          return;
        }
      }
    }

    set(ref(db,"waiting/"+myId),{
      id: myId
    });

  },{onlyOnce:true});
}

function sendMessage(){
  const msg = document.getElementById("msgInput").value;
  if(!msg || !roomId) return;

  push(ref(db,"messages/"+roomId),{
    text: msg,
    sender: myId
  });

  document.getElementById("msgInput").value="";
}

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

function disconnectChat(){
  if(myId) remove(ref(db,"waiting/"+myId));
  if(roomId){
    remove(ref(db,"messages/"+roomId));
    remove(ref(db,"rooms/"+roomId));
  }
  document.getElementById("status").innerText = "Status: Disconnected";
}

document.getElementById("startBtn").onclick = startChat;
document.getElementById("sendBtn").onclick = sendMessage;
document.getElementById("disconnectBtn").onclick = disconnectChat;
