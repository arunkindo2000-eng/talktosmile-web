import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

let myUser = null;

function startChat() {

  const waitingRef = ref(db,"waiting");

  myUser = push(waitingRef,{
    status:"waiting"
  });

  console.log("Waiting for stranger...");
}

function disconnectChat(){

  if(myUser){
    remove(myUser);
    console.log("Disconnected");
  }

}

document.querySelector("#startBtn").onclick = startChat;
document.querySelector("#disconnectBtn").onclick = disconnectChat;
