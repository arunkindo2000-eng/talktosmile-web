import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, set, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
let partnerId = null;

function startChat(){

  const waitingRef = ref(db,"waiting");

  myId = push(waitingRef).key;

  set(ref(db,"waiting/"+myId),{
    status:"waiting"
  });

  document.getElementById("status").innerText="Status: Waiting for stranger...";

  onValue(waitingRef,(snapshot)=>{

    const users = snapshot.val();

    if(!users) return;

    for(let id in users){

      if(id !== myId){

        partnerId = id;

        remove(ref(db,"waiting/"+id));
        remove(ref(db,"waiting/"+myId));

        document.getElementById("status").innerText="Status: Connected to stranger";

        console.log("Connected");

        break;
      }

    }

  });

}

function disconnectChat(){

  if(myId){
    remove(ref

document.querySelector("#startBtn").onclick = startChat;
document.querySelector("#disconnectBtn").onclick = disconnectChat;
