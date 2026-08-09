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

// Ask the protected Node server for temporary TURN credentials.
  const turnResponse = await fetch(
    "https://vortex.stellaz.org/turn-credentials",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!turnResponse.ok) {
    const errorText = await turnResponse.text();
    throw new Error(
      `Unable to obtain TURN credentials: ${turnResponse.status} ${errorText}`,
    );
  }
  const turnData = await turnResponse.json();
  if (!Array.isArray(turnData.iceServers)) {
    throw new Error("Node returned an invalid TURN configuration");
  }
  // Create the WebRTC reader using Cloudflare's temporary TURN credentials.
  const vortex_reader = new MediaMTXWebRTCReader({
    url: "https://vortex-video.stellaz.org/camera/whep",
    token,
    iceServers: turnData.iceServers,
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

    // Refresh the servo-control authentication token every 50 minutes.
    setInterval(async () => {
      const u = auth.currentUser || user;
      if (!u) return;
      currentToken = await u.getIdToken(true);
    }, 50 * 60 * 1000);

    // Track which keyboard keys are currently held.
  const activeKeys = new Set();

// Send one start/stop movement command to Node.
  async function setServoMotion(axis, direction) {
    try {
      const url =
        `${API_BASE}/servo/motion?token=${encodeURIComponent(currentToken)}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          axis,
          direction,
        }),
      });

      if (!res.ok) {
        console.error(
          "Servo motion error:",
          res.status,
          await res.text(),
        );
      }
    } catch (error) {
      console.error("Servo motion request failed:", error);
    }
  }

  // Match each key to one axis and direction.
  const keyMap = {
    w: { axis: "tilt", direction: 1 },
    s: { axis: "tilt", direction: -1 },
    a: { axis: "pan", direction: 1 },
    d: { axis: "pan", direction: -1 },
  };

  // Start movement when a key is pressed.
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const command = keyMap[key];

    if (!command || activeKeys.has(key)) {
      return;
    }

    activeKeys.add(key);

    setServoMotion(
      command.axis,
      command.direction,
    );
  });

  // Stop movement when a key is released.
  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    const command = keyMap[key];

    if (!command) {
      return;
    }

    activeKeys.delete(key);

    setServoMotion(
      command.axis,
      0,
    );
  });

  function connectMotionButton(elementId, axis, direction) {
    const button = document.getElementById(elementId);

    if (!button) {
      return;
    }

    // Start moving while the button is pressed.
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      setServoMotion(axis, direction);
    });

    // Stop moving when the press ends.
    button.addEventListener("pointerup", () => {
      setServoMotion(axis, 0);
    });

    // Also stop if the pointer is cancelled or leaves the button.
    button.addEventListener("pointercancel", () => {
      setServoMotion(axis, 0);
    });

    button.addEventListener("pointerleave", () => {
      setServoMotion(axis, 0);
    });
  }

  connectMotionButton("w-key", "tilt", -1);
  connectMotionButton("s-key", "tilt", 1);
  connectMotionButton("a-key", "pan", 1);
  connectMotionButton("d-key", "pan", -1);

  // Stop both servos if the page loses focus.
  window.addEventListener("blur", () => {
    activeKeys.clear();

    setServoMotion("pan", 0);
    setServoMotion("tilt", 0);
  });
    //#endregion
  } 
  //#endregion

