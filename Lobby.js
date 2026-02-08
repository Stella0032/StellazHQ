const DEV_MODE = true;        // ? Set to false for live server editing

//? -------------------------------
//* ----- Firebase Auth Gate ------
//? -------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"; 

const firebaseConfig = {
  apiKey: "AIzaSyA35BdFVlIVLS4Qz16nDplkuD2BNZuoDu8",
  authDomain: "stellazhq-bb090.firebaseapp.com",
  projectId: "stellazhq-bb090",
  appId: "1:952515321392:web:0fb1af669529827d7097f5",
};

initializeApp(firebaseConfig);
const auth = getAuth();

document.documentElement.style.visibility = "hidden"; // ? Hide the page until we decide what to do


//? -------------------------------
//* ----------- Boot --------------
//? -------------------------------
if (DEV_MODE) {                                                //? Dev mode: no auth gate, no redirect
  document.documentElement.style.visibility = "visible";
  startLobby({ dev: true });
} else {
  // Prod mode: require login
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace("index.html?next=Lobby.html");
      return;
    }
    document.documentElement.style.visibility = "visible";
    startLobby({ dev: false });
  });
}

//? -------------------------------
//* --------- Secure LED ----------
//? -------------------------------
async function setLed(state) {
  const token = await auth.currentUser.getIdToken(true);

  await fetch(
    `https://cam.stellaz.org/api/led?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }), // "on" or "off"
    }
  );
}

//? ----------------------------
//* --------- Lobby Logic ------
//? ----------------------------
async function startLobby({ dev }) {
  const esp32Base = "https://api.stellaz.org";                    //? ESP32 - cactus /moisture /elapsed /angle /LED /PUMP
  const streamURL = "https://api.stellaz.org/stream";


  const vortex_stream = "https://cam.stellaz.org/video";          //? 

  //* cactus stream
  const camContainer = document.getElementById("camContainer"); //? Get the <img> with id="camContainer"
  const streamImg = document.createElement("img");              //? 

  //* vortex stream
  const vortex_cam_container = document.getElementById("vortex_cam_container"); //? Grab existing element from the HTML page
  const vortex_streamImg = document.createElement("img");                       //? Create new element in Javascipt type "img"

  //* Token logic
  let token = null;                                       //? create token variable
  if (!dev && auth.currentUser) {                         //? only give token while not dev and user logged in
    token = await auth.currentUser.getIdToken(true);
  }

  if (token) {
    //* Get stream from the url
    streamImg.src = `${streamURL}?token=${encodeURIComponent(token)}`;
    vortex_streamImg.src = `${vortex_stream}?token=${encodeURIComponent(token)}`;

    //* Refresh token occasionally
    setInterval(async () => {
      if (!auth.currentUser) return;
      const t = await auth.currentUser.getIdToken(true);
      streamImg.src = `${streamURL}?token=${encodeURIComponent(t)}&ts=${Date.now()}`;
      vortex_streamImg.src = `${vortex_stream}?token=${encodeURIComponent(t)}&ts=${Date.now()}`;
    }, 50 * 60 * 1000);
  } else {
    camContainer.innerHTML =
      "<p style='text-align:center;'>DEV MODE: Login required to view camera.</p>"; //? Dev mode: don't break the UI if no token

    vortex_cam_container.innerHTML =
      "<p style='text-align:center;'>DEV MODE: Login required to view camera.</p>";
  }

  streamImg.width = 640;
  streamImg.alt = "Live camera feed";
  streamImg.style.border = "2px solid black";
  streamImg.style.maxWidth = "100%";
  if (token) camContainer.appendChild(streamImg);

  vortex_streamImg.width = 640;
  vortex_streamImg.alt = "Live camera feed";
  vortex_streamImg.style.border = "2px solid black";
  vortex_streamImg.style.maxWidth = "100%";
  if (token) vortex_cam_container.appendChild(vortex_streamImg);


  //* ------- UI elements -------
  const pumpButton = document.getElementById("pumpButton");
  const moistureDisplay = document.getElementById("moistureValue");
  const angleDisplay = document.getElementById("angleValue");
  const led_button = document.getElementById("led_button");
  const elapsedDisplay = document.getElementById("elapsedValue");

  //* Fullscreen camera
  streamImg.addEventListener("click", () => {
    if (!token) return; // nothing to fullscreen in dev placeholder mode
    if (streamImg.requestFullscreen) streamImg.requestFullscreen();
    else if (streamImg.webkitRequestFullscreen) streamImg.webkitRequestFullscreen();
    else if (streamImg.msRequestFullscreen) streamImg.msRequestFullscreen();
  });

  vortex_streamImg.addEventListener("click", () => {
    if(!token) return;
    if (vortex_streamImg.requestFullscreen) vortex_streamImg.requestFullscreen();
    else if (vortex_streamImg.webkitRequestFullscreen) vortex_streamImg.webkitRequestFullscreen();
    else if (vortex_streamImg.msRequestFullscreen) vortex_streamImg.msRequestFullscreen();
  });

  //* ------- Controls -------
  pumpButton.addEventListener("click", () => {
    if (dev) {
      console.log("DEV MODE: Pump clicked (blocked)");
      return;
    }
    fetch(esp32Base + "/PUMP").catch(console.error);
  });

  // Your existing LED endpoint (non-tokened)
  // Keeping exact same behavior for now:
  led_button.addEventListener("click", () => {
    if (dev) {
      console.log("DEV MODE: LED clicked (blocked)");
      return;
    }
    fetch(esp32Base + "/LED").catch(console.error);

    // If you want to use the secure tokened LED instead in prod, swap to:
    // setLed("on");
  });

  function fetchMoisture() {
    if (dev) {
      moistureDisplay.textContent = "—";
      return;
    }
    fetch(esp32Base + "/moisture")
      .then((res) => res.text())
      .then((data) => {
        moistureDisplay.textContent = data;
      })
      .catch(console.error);
  }

  function fetchAngle() {
    if (dev) {
      angleDisplay.textContent = "—";
      return;
    }
    fetch(esp32Base + "/angle")
      .then((res) => res.text())
      .then((data) => {
        angleDisplay.textContent = data;
      })
      .catch(console.error);
  }

  function fetchElapsed() {
    if (dev) {
      elapsedDisplay.textContent = "—";
      return;
    }
    fetch(esp32Base + "/elapsed")
      .then((r) => r.text())
      .then((msStr) => {
        let ms = parseInt(msStr, 10);
        let totalSec = Math.floor(ms / 1000);
        let days = Math.floor(totalSec / 86400);
        let hrs = Math.floor((totalSec % 86400) / 3600);
        let mins = Math.floor((totalSec % 3600) / 60);
        let secs = totalSec % 60;
        elapsedDisplay.textContent =
          String(days).padStart(2, "0") +
          ":" +
          String(hrs).padStart(2, "0") +
          ":" +
          String(mins).padStart(2, "0") +
          ":" +
          String(secs).padStart(2, "0");
      })
      .catch(console.error);
  }

  // Polling
  setInterval(() => {
    fetchMoisture();
    fetchAngle();
    fetchElapsed();
  }, 5000);

  // Initial fetch
  fetchMoisture();
  fetchAngle();
  fetchElapsed();
}
