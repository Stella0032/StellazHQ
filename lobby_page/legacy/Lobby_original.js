import { auth } from './auth.js';

//? -------------------------------
//* --------- Secure LED ----------
//? -------------------------------
//#region
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
//#endregion

//? ----------------------------
//* --------- Lobby Logic ------
//? ----------------------------
//#region
export async function startLobby({ dev, user }) {
  const esp32Base = "https://api.stellaz.org";
  const streamURL = "https://api.stellaz.org/stream";
  const vortex_stream = "https://vortex.stellaz.org/video";
  const params = new URLSearchParams(window.location.search);
  const requestedSection = params.get('section') || 'projects';

  // Hide all sections initially
  document.querySelectorAll('.view').forEach(view => {
    view.style.display = 'none';
  });

  // Navbar event listeners (works regardless of login)
  document.querySelectorAll('.nav_links button').forEach(button => {
    button.addEventListener('click', () => {
      const sectionId = button.dataset.section;
      showSection(sectionId);
    });
  });

  initEmails();
  initCalendar();

  const camContainer = document.getElementById("camContainer");
  const streamImg = document.createElement("img");

  const vortex_cam_container = document.getElementById("vortex_cam_container");
  const vortex_streamImg = document.createElement("img");

  if (!camContainer || !vortex_cam_container) {
    console.error("Missing cam containers in HTML");
    return;
  }

  // If not logged in:
  if (!user) {
    camContainer.innerHTML =
      "<p style='text-align:center;'>Dev: please log in to view camera.</p>";
    vortex_cam_container.innerHTML =
      "<p style='text-align:center;'>Dev: please log in to view camera.</p>";

    // Optional: auto-send to login even in dev
    // if (dev) window.location.replace("index.html?next=Lobby.html");
    return;
  }

  // Logged in -> tokened streams
  const token = await user.getIdToken(true);

  streamImg.src = `${streamURL}?token=${encodeURIComponent(token)}`;
  vortex_streamImg.src = `${vortex_stream}?token=${encodeURIComponent(token)}`;

  setInterval(async () => {
    const u = auth.currentUser || user;
    if (!u) return;
    const t = await u.getIdToken(true);
    streamImg.src = `${streamURL}?token=${encodeURIComponent(t)}&ts=${Date.now()}`;
    vortex_streamImg.src = `${vortex_stream}?token=${encodeURIComponent(t)}&ts=${Date.now()}`;
  }, 50 * 60 * 1000);

  camContainer.innerHTML = "";
  vortex_cam_container.innerHTML = "";

  camContainer.appendChild(streamImg);
  vortex_cam_container.appendChild(vortex_streamImg);


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

  // Default to projects section
  showSection(requestedSection);

  // Initialize chat and investments
  initChats();
  initInvestments();
}
//#endregion