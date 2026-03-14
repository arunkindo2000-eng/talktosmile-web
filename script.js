import { getDatabase, ref, push, onValue, remove } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";

const db = getDatabase();

let userRef = null;

function startChat() {
  const waitingRef = ref(db, "waiting");

  userRef = push(waitingRef, {
    status: "waiting"
  });

  console.log("Waiting for stranger...");
}

function disconnectChat() {
  if (userRef) {
    remove(userRef);
    userRef = null;
  }
  console.log("Disconnected");
}

document.querySelector("#startChat").onclick = startChat;
document.querySelector("#disconnect").onclick = disconnectChat;
