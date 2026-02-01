import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// TODO: paste your real Firebase config here
const firebaseConfig = {
  apiKey: "AIzaSyA35BdFVlIVLS4Qz16nDplkuD2BNZuoDu8",
  authDomain: "stellazhq-bb090.firebaseapp.com",
  projectId: "stellazhq-bb090",
  appId: "1:952515321392:web:0fb1af669529827d7097f5",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Hide the page until we know auth status (prevents “flash”)
document.documentElement.style.visibility = "hidden";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    // Not signed in → send to your existing login page
    window.location.replace("index.html?next=Lobby.html");
    return;
  }

  // Signed in → show the page + run the lobby
  document.documentElement.style.visibility = "visible";
  startLobby();
});

// --- Your existing code goes inside startLobby() ---
function startLobby() {
  const esp32Base = "https://api.stellaz.org";

  const streamURL = "https://api.stellaz.org/stream";
  const camContainer = document.getElementById('camContainer');
  const streamImg = document.createElement('img');
  streamImg.src = streamURL;
  streamImg.width = 640;
  streamImg.alt = "Live camera feed";
  streamImg.style.border = "2px solid black";
  streamImg.style.maxWidth = "100%";
  camContainer.appendChild(streamImg);

  const pumpButton = document.getElementById('pumpButton');
  const moistureDisplay = document.getElementById('moistureValue');
  const angleDisplay = document.getElementById('angleValue');
  const led_button = document.getElementById('led_button');
  const elapsedDisplay = document.getElementById('elapsedValue');

  streamImg.addEventListener('click', () => {
    if (streamImg.requestFullscreen) streamImg.requestFullscreen();
    else if (streamImg.webkitRequestFullscreen) streamImg.webkitRequestFullscreen();
    else if (streamImg.msRequestFullscreen) streamImg.msRequestFullscreen();
  });

  pumpButton.addEventListener('click', () => {
    fetch(esp32Base + '/PUMP').catch(console.error);
  });

  function fetchMoisture(){
    fetch(esp32Base + '/moisture')
      .then(res => res.text())
      .then(data => { moistureDisplay.textContent = data; })
      .catch(console.error);
  }

  function fetchAngle() {
    fetch(esp32Base + '/angle')
      .then(res => res.text())
      .then(data => { angleDisplay.textContent = data; })
      .catch(console.error);
  }

  led_button.addEventListener('click', () => {
    fetch(esp32Base + '/LED').catch(console.error);
  });

  function fetchElapsed(){
    fetch(esp32Base + '/elapsed')
      .then(r => r.text())
      .then(msStr => {
        let ms = parseInt(msStr, 10);
        let totalSec = Math.floor(ms / 1000);
        let days = Math.floor(totalSec / 86400);
        let hrs  = Math.floor((totalSec % 86400) / 3600);
        let mins = Math.floor((totalSec % 3600)  / 60);
        let secs = totalSec % 60;
        elapsedDisplay.textContent =
          String(days).padStart(2,'0') + ':' +
          String(hrs ).padStart(2,'0') + ':' +
          String(mins).padStart(2,'0') + ':' +
          String(secs).padStart(2,'0');
      })
      .catch(console.error);
  }

  setInterval(() => {
    fetchMoisture();
    fetchAngle();
    fetchElapsed();
  }, 5000);

  fetchMoisture();
  fetchAngle();
  fetchElapsed();
}

