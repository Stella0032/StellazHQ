//? ----------------------------
//* --------- Lobby Logic ------
//? ----------------------------
//#region
async function startLobby() {

  const PI_IP = "192.168.18.23";
  const NODE_PORT = 3001;
  const VIDEO_PORT = 8889;

  // Find HTML container where camera will be displayed
  const vortex_cam_container =
    document.getElementById("vortex_cam_container");

  if (!vortex_cam_container) {
    console.error("Missing camera container in HTML");
    return;
  }

  const VIDEO_URL = `http://${PI_IP}:${VIDEO_PORT}/camera`;

  const iframe = document.createElement("iframe");

  iframe.src = VIDEO_URL;
  iframe.allow = "autoplay; fullscreen";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";

  vortex_cam_container.innerHTML = "";
  vortex_cam_container.appendChild(iframe);
  //? -------------------------------
  //* ------- Servo Controls --------
  //? -------------------------------
  //#region
  const API_BASE = `http://${PI_IP}:${NODE_PORT}`;

  // Track which keyboard keys are currently held.
  const activeKeys = new Set();

// Send one start/stop movement command to Node.
  async function setServoMotion(axis, direction) {
    try {
      const url = `${API_BASE}/servo/motion`;

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
startLobby();
  //#endregion

