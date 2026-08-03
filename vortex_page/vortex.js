  //? -------------------------------
  //* ----- Firebase Auth Gate ------
  //? -------------------------------
  //#region
  // import the firebase functions required to initialize Firebase and monitor whether the user is logged in.
  import { 
    initializeApp 
  } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

  import {
    getAuth, onAuthStateChanged 
  } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"; 

  // Firebase project information
  const firebaseConfig = {
    apiKey: "AIzaSyA35BdFVlIVLS4Qz16nDplkuD2BNZuoDu8",
    authDomain: "stellazhq-bb090.firebaseapp.com",
    projectId: "stellazhq-bb090",
    appId: "1:952515321392:web:0fb1af669529827d7097f5",
  };

  initializeApp(firebaseConfig); // Connect this page to the firebase project
  const auth = getAuth();        // Get the firebase authentication service

  // Hide the entire page while Firebase checks whether the user is logged in.
  // This prevents protected content from appearing briefly before redirecting.
  document.documentElement.style.visibility = "hidden"; 
  //#endregion
  //? -------------------------------
  //* ----------- Boot --------------
  //? -------------------------------
  //#region
  // This callback runs when firebase finishes checking whether the user is logged in
  onAuthStateChanged(auth, (user) => {
    // Firebase finished authentication, page can now be visible
    document.documentElement.style.visibility = "visible";

    // If user didn't login, return to login page.
    if (!user) {
      window.location.replace("index.html?next=Lobby.html");
      return;
    }

    // User logged in, start lobby
    startLobby(user);
  });
  //#endregion
  //? ----------------------------
  //* --------- Lobby Logic ------
  //? ----------------------------
  //#region
  async function startLobby(user) {
    // Find HTML container where camera will be displayed
    const vortex_cam_container =
      document.getElementById("vortex_cam_container");

    if (!vortex_cam_container) {
      console.error("Missing camera container in HTML");
      return;
    }

    // Create the video element used by WebRTC.
    const vortex_video = document.createElement("video");
    vortex_video.autoplay = true;
    vortex_video.playsInline = true;
    vortex_video.muted = true;
    vortex_video.controls = false;

    // Request a Firebase token for the authenticated user.
    const token = await user.getIdToken(true);

    // Connect to the MediaMTX WHEP endpoint.
    const vortex_reader = new MediaMTXWebRTCReader({
      url: "https://vortex-video.stellaz.org/camera/whep",
      token,

      onTrack: (event) => {
        vortex_video.srcObject = event.streams[0];
      },

      onError: (error) => {
        console.error("WebRTC camera error:", error);
      },
    });

    //^ Replace any previous camera content.
    vortex_cam_container.innerHTML = "";
    vortex_cam_container.appendChild(vortex_video);
    //? -------------------------------
    //* ------- Servo Controls --------
    //? -------------------------------
    //#region
    // Base URL of the server controlling the Vortex robot.
    const API_BASE = "https://vortex.stellaz.org";

    let currentToken = token; // Keep a local copy of the authentication token for servo-control requests.

    const STEP = 1;      // Number of degrees the servo moves for each command.
    const HOLD_MS = 80;  // Time in milliseconds between repeated commands while a keyboard key is held.

    // Refresh the servo-control authentication token every 50 minutes.
    setInterval(async () => {
      const u = auth.currentUser || user;
      if (!u) return;
      currentToken = await u.getIdToken(true);
    }, 50 * 60 * 1000);


    async function nudge(axis, delta) {
      try {
        // Create a secured servo-control URL
        const url = `${API_BASE}/servo/nudge?token=${encodeURIComponent(currentToken)}`;

        // Send the servo movement command to the server.
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },

          // Convert the JavaScript object into JSON.
          // Example:
          // {
          //   "axis": "pan",
          //   "delta": 1
          // }
          body: JSON.stringify({ axis, delta }),
        });

        // A response outside the 200–299 range means the server returned an error.
        if (!res.ok) {
          console.error("Servo error:", res.status, await res.text());
        };
      } catch (e) {
        // This normally means the browser could not contact the server because of a network, CORS or server error.
        console.error("Servo fetch failed:", e);
      }
    }

    // Connect each keyboard key to a servo movement. W and S control the tilt servo. A and D control the pan servo.
    const keyMap = {
      s: { axis: "tilt", delta: +STEP },  // Tilt Up
      d: { axis: "pan", delta: -STEP },  // Tilt Down
      w: { axis: "tilt",  delta: -STEP },  // Pan Left
      a: { axis: "pan",  delta: +STEP },  // Pan Right
    };

    // Clicking the on-screen buttons sends the same commands as pressing the matching keyboard keys.
    document.getElementById("s-key")?.addEventListener("click", () => nudge("tilt", +STEP));
    document.getElementById("d-key")?.addEventListener("click", () => nudge("pan", -STEP));
    document.getElementById("w-key")?.addEventListener("click", () => nudge("tilt",  -STEP));
    document.getElementById("a-key")?.addEventListener("click", () => nudge("pan",  +STEP));

    // Store one repeating timer for each keyboard key that is currently being held.
    // Using a Map allows multiple keys to be held at once.
    // For example, W and A can both send commands at the same time.
    const holdTimers = new Map();

    // Start repeatedly sending the movement command associated with a keyboard key.
    function startHold(key) {
      if (holdTimers.has(key)) return;    // Do not create another timer if this key is already being held.
      const cmd = keyMap[key];            // Find the movement command associated with the key.
      if (!cmd) return;                   // Ignore keys that are not in the keyboard map.

      nudge(cmd.axis, cmd.delta);                                           // Send one movement command immediately.
      const t = setInterval(() => nudge(cmd.axis, cmd.delta), HOLD_MS);     // Continue sending the movement command every HOLD_MS milliseconds while the key remains held.
      holdTimers.set(key, t);                                               // Store the timer so it can be stopped later.
    }

    // Stop repeatedly sending the movement command associated with a keyboard key.
    function stopHold(key) {
      const t = holdTimers.get(key);    // Get the timer associated with this key.
      if (!t) return;                   // Stop if the key does not have an active timer.
      clearInterval(t);                 // Stop the repeating movement command.
      holdTimers.delete(key);           // Remove the timer from the Map.
    }

    // Start moving when W, A, S or D is pressed.
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();  // Convert the pressed key to lowercase.
      if (!keyMap[k]) return;         // Ignore keys that are not in the keyboard map.
      // Browsers automatically generate repeated keydown events while a key is held.
      if (e.repeat) return;           // Ignore those repeated browser events because startHold() already creates its own repeating timer. 
      startHold(k);                   // Begin sending repeated servo commands.
    });

    // Stop moving when W, A, S or D is released.
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      if (!keyMap[k]) return;
      stopHold(k);            // Stop sending repeated servo commands.
    });

    // Stop all servo commands if the browser tab or window loses focus.
    // This prevents the camera from continuing to move if the user switches tabs while holding a key.
    window.addEventListener("blur", () => {
      for (const [, t] of holdTimers) clearInterval(t); // Stop every active repeating timer.
      holdTimers.clear(); // Remove every timer from the Map.
    });
    //#endregion
  } 
  //#endregion

