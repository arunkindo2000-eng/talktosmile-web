// ======================================================
// START CHAT - FIXED MATCHING SYSTEM
// ======================================================

async function startChat() {

  console.log("START CHAT");

  if (isSearching) {
    console.log("Already searching");
    return;
  }

  if (roomId) {
    setStatus("Status: Already connected");
    return;
  }

  // --------------------------------------------------
  // CREATE USER
  // --------------------------------------------------

  myUsername = getUsername();

  myId = createUserId();

  roomId = null;
  partnerId = null;
  partnerUsername = null;

  isSearching = true;

  setStatus("Status: Waiting for stranger...");

  if (chatBox) {
    chatBox.innerHTML = "";
  }

  // --------------------------------------------------
  // START ONLINE COUNTER
  // --------------------------------------------------

  startOnlineCounter();

  // --------------------------------------------------
  // CLEAN OLD LISTENER
  // --------------------------------------------------

  if (waitingUnsubscribe) {
    waitingUnsubscribe();
    waitingUnsubscribe = null;
  }

  // --------------------------------------------------
  // MY WAITING NODE
  // --------------------------------------------------

  const myWaitingRef = ref(
    db,
    "waiting/" + myId
  );

  try {

    // ------------------------------------------------
    // PUT MYSELF IN WAITING
    // ------------------------------------------------

    await set(myWaitingRef, {

      id: myId,

      username: myUsername,

      roomId: "",

      partnerId: "",

      partnerUsername: "",

      createdAt: Date.now()

    });

    // ------------------------------------------------
    // REMOVE ME IF BROWSER DISCONNECTS
    // ------------------------------------------------

    onDisconnect(myWaitingRef).remove();

    // ------------------------------------------------
    // LISTEN FOR MATCH
    // ------------------------------------------------

    waitingUnsubscribe = onValue(
      myWaitingRef,
      async (snapshot) => {

        const data = snapshot.val();

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

        // Already processed
        if (roomId === data.roomId) {
          return;
        }

        // ------------------------------------------------
        // MATCH FOUND
        // ------------------------------------------------

        console.log(
          "MATCH FOUND:",
          data
        );

        roomId = data.roomId;

        partnerId =
          data.partnerId || null;

        partnerUsername =
          data.partnerUsername ||
          "Stranger";

        isSearching = false;

        setStatus(
          "Status: Connected with " +
          partnerUsername
        );

        console.log(
          "MY ID:",
          myId
        );

        console.log(
          "PARTNER ID:",
          partnerId
        );

        console.log(
          "ROOM ID:",
          roomId
        );

        // ------------------------------------------------
        // START ROOM SYSTEMS
        // ------------------------------------------------

        listenRoomStatus();

        listenMessages();

        setupWebRTCSignaling();

        // ------------------------------------------------
        // REMOVE FROM WAITING
        // ------------------------------------------------

        try {

          await remove(myWaitingRef);

          console.log(
            "Removed from waiting:",
            myId
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

    // ------------------------------------------------
    // TRY TO FIND STRANGER
    // ------------------------------------------------

    await findMatch();

  } catch (error) {

    showError(
      "Start Chat",
      error
    );

    isSearching = false;

    roomId = null;

    partnerId = null;

    partnerUsername = null;

    try {
      await remove(myWaitingRef);
    } catch (e) {
      console.log(e);
    }

    setStatus(
      "Status: Unable to start chat"
    );

  }

}


// ======================================================
// FIND RANDOM MATCH - FIXED
// ======================================================

async function findMatch() {

  if (!myId || !isSearching) {
    return;
  }

  const waitingRef =
    ref(db, "waiting");

  console.log(
    "SEARCHING FOR MATCH:",
    myId
  );

  try {

    const result =
      await runTransaction(
        waitingRef,
        (currentData) => {

          // --------------------------------------------
          // NO WAITING USERS
          // --------------------------------------------

          if (!currentData) {
            return currentData;
          }

          // --------------------------------------------
          // FIND AVAILABLE USERS
          // --------------------------------------------

          const availableUsers =
            Object.values(currentData)
              .filter((user) => {

                return (
                  user &&
                  user.id &&
                  user.id !== myId &&
                  !user.roomId
                );

              });

          console.log(
            "AVAILABLE USERS:",
            availableUsers
          );

          // --------------------------------------------
          // NOBODY AVAILABLE
          // --------------------------------------------

          if (
            availableUsers.length === 0
          ) {

            return currentData;

          }

          // --------------------------------------------
          // RANDOM USER
          // --------------------------------------------

          const stranger =
            availableUsers[
              Math.floor(
                Math.random() *
                availableUsers.length
              )
            ];

          // --------------------------------------------
          // CHECK BOTH NODES
          // --------------------------------------------

          if (
            !currentData[myId] ||
            !currentData[stranger.id]
          ) {

            return currentData;

          }

          // --------------------------------------------
          // CREATE ROOM
          // --------------------------------------------

          const newRoomId =
            "room_" +
            Date.now() +
            "_" +
            Math.random()
              .toString(36)
              .substring(2, 10);

          // --------------------------------------------
          // USER A
          // --------------------------------------------

          currentData[myId].roomId =
            newRoomId;

          currentData[myId].partnerId =
            stranger.id;

          currentData[myId].partnerUsername =
            stranger.username ||
            "Stranger";

          // --------------------------------------------
          // USER B
          // --------------------------------------------

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
      "TRANSACTION COMPLETE:",
      result.committed,
      result.snapshot.val()
    );

    // ------------------------------------------------
    // IMPORTANT:
    // Immediately check MY NODE
    // ------------------------------------------------

    if (!result.committed) {

      console.log(
        "Match transaction not committed"
      );

      return;

    }

    const finalData =
      result.snapshot.val();

    const myData =
      finalData &&
      finalData[myId];

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

      // ----------------------------------------------
      // START CHAT SYSTEMS
      // ----------------------------------------------

      listenRoomStatus();

      listenMessages();

      setupWebRTCSignaling();

      // ----------------------------------------------
      // REMOVE MY WAITING NODE
      // ----------------------------------------------

      try {

        await remove(
          ref(
            db,
            "waiting/" + myId
          )
        );

      } catch (error) {

        showError(
          "Remove matched user",
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
