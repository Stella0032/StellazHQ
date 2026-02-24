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
// --- Boot (works for dev + prod) ---
onAuthStateChanged(auth, (user) => {
  document.documentElement.style.visibility = "visible";

  // Prod: require login
  if (!DEV_MODE && !user) {
    window.location.replace("index.html?next=Lobby.html");
    return;
  }

  // Dev: allow page to load even if not logged in
  startLobby({ dev: DEV_MODE, user });
});

//? ----------------------------
//* --------- Lobby Logic ------
//? ----------------------------
async function startLobby({ dev, user }) {
  const vortex_stream = "https://vortex.stellaz.org/video";

  const vortex_cam_container = document.getElementById("vortex-cam-container");
  const vortex_streamImg = document.createElement("img");


  if (!vortex_cam_container) {
    console.error("Missing cam containers in HTML");
    return;
  }

  // If not logged in:
  if (!user) {
    vortex_cam_container.innerHTML =
      "<p style='text-align:center;'>Dev: please log in to view camera.</p>";

    return;
  }

  // Logged in -> tokened streams
  const token = await user.getIdToken(true);

  vortex_streamImg.src = `${vortex_stream}?token=${encodeURIComponent(token)}`;

  setInterval(async () => {
    const u = auth.currentUser || user;
    if (!u) return;
    const t = await u.getIdToken(true);
    vortex_streamImg.src = `${vortex_stream}?token=${encodeURIComponent(t)}&ts=${Date.now()}`;
  }, 50 * 60 * 1000);

  vortex_cam_container.innerHTML = "";

  vortex_cam_container.appendChild(vortex_streamImg);

  //------------------------
  // -------------------------------
  // Servo Controls (secured)
  // -------------------------------
  const API_BASE = "https://vortex.stellaz.org";

  let currentToken = token; // keep a copy we can refresh later

    const STEP = 1;      // degrees per nudge
  const HOLD_MS = 80;  // repeat rate while holding key

  // Keep token fresh (same idea as your video refresh)
  setInterval(async () => {
    const u = auth.currentUser || user;
    if (!u) return;
    currentToken = await u.getIdToken(true);
  }, 50 * 60 * 1000);

  async function nudge(axis, delta) {
    try {
      const url = `${API_BASE}/servo/nudge?token=${encodeURIComponent(currentToken)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ axis, delta }),
      });
      if (!res.ok) console.error("Servo error:", res.status, await res.text());
    } catch (e) {
      console.error("Servo fetch failed:", e);
    }
  }

  // ✅ Correct mapping (matches your labels)
  const keyMap = {
    w: { axis: "tilt", delta: +STEP },  // Tilt Up
    a: { axis: "pan", delta: -STEP },  // Tilt Down
    s: { axis: "tilt",  delta: -STEP },  // Pan Left
    d: { axis: "pan",  delta: +STEP },  // Pan Right
  };

  // Button clicks use same map
  document.getElementById("w-key")?.addEventListener("click", () => nudge("tilt", +STEP));
  document.getElementById("a-key")?.addEventListener("click", () => nudge("pan", -STEP));
  document.getElementById("s-key")?.addEventListener("click", () => nudge("tilt",  -STEP));
  document.getElementById("d-key")?.addEventListener("click", () => nudge("pan",  +STEP));

  // ✅ One timer per key (so two keys can run at once)
  const holdTimers = new Map();

  function startHold(key) {
    if (holdTimers.has(key)) return;
    const cmd = keyMap[key];
    if (!cmd) return;

    nudge(cmd.axis, cmd.delta); // immediate
    const t = setInterval(() => nudge(cmd.axis, cmd.delta), HOLD_MS);
    holdTimers.set(key, t);
  }

  function stopHold(key) {
    const t = holdTimers.get(key);
    if (!t) return;
    clearInterval(t);
    holdTimers.delete(key);
  }

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (!keyMap[k]) return;
    if (e.repeat) return;
    startHold(k);
  });

  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (!keyMap[k]) return;
    stopHold(k);
  });

  // safety: stop everything if tab loses focus
  window.addEventListener("blur", () => {
    for (const [, t] of holdTimers) clearInterval(t);
    holdTimers.clear();
  });


} 
