const esp32IP = "http://192.168.18.21"; // Replace with your ESP32's actual IP

const streamURL = "http://192.168.18.24:81/stream"; // Stream runs on port 81
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

// Send request to trigger pump
pumpButton.addEventListener('click', () => {
    fetch(esp32IP + '/PUMP')
        .then(response => {
            if (!response.ok){
                throw new Error("Pump request failed");
            }
        })
        .catch(error => {
            console.error("Pump error:", error);
        });
});

// Fetch moisture level
function fetchMoisture(){
    fetch(esp32IP + '/moisture')
        .then(res => res.text())
        .then(data => {
            moistureDisplay.textContent = data;
        })
        .catch(err => console.error("Error fetching moisture:", err));
}

// Fetch angle
function fetchAngle() {
    fetch(esp32IP + '/angle')
        .then(res => res.text())
        .then(data => {
            angleDisplay.textContent = data;
        })
        .catch(err => console.error("Error fetching angle:", err));
}

// Send request to trigger LED
led_button.addEventListener('click', () => {
    fetch(esp32IP + '/LED')
        .then(response => {
            if (!response.ok){
                throw new Error("Led request failed");
            }
        })
        .catch(error => {
            console.error("Led error:", error);
        });
});

function fetchElapsed(){
    fetch(esp32IP + '/elapsed')
    .then(r => r.text())
    .then(msStr => {
        let ms = parseInt(msStr, 10);
        let totalSec = Math.floor(ms / 1000);
        let days    = Math.floor(totalSec / 86400);
        let hrs     = Math.floor((totalSec % 86400) / 3600);
        let mins    = Math.floor((totalSec % 3600)  / 60);
        let secs    = totalSec % 60;
      // format as DD:HH:MM:SS
        elapsedDisplay.textContent =
        String(days).padStart(2,'0') + ':' +
        String(hrs ).padStart(2,'0') + ':' +
        String(mins).padStart(2,'0') + ':' +
        String(secs).padStart(2,'0');
    })
    .catch(console.error);
}

// Update both every 5 seconds
setInterval(() => {
    fetchMoisture();
    fetchAngle();
    fetchElapsed();
}, 5000);

// Initial fetch
fetchMoisture();
fetchAngle();
fetchElapsed();