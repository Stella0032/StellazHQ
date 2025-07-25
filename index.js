 // Pressing "Enter" acts the same a pressing login button
 // "event" is to detect when a key is pressed.
 document.addEventListener("keydown", function (event){
     // If the enter key has been pressed, do the following.
     if (event.key === "Enter") {
         // Get element with id="loginButton" and click it.
         document.getElementById("loginButton").click();
     }
 });

 // This part is for the "showPassword" function
 // Get element with id="showPassword"
 document.getElementById("showPassword").addEventListener("change", function(){
     const passwordInput = document.getElementById("password");
     passwordInput.type = this.checked ? "text" : "password";
 });

 document.getElementById("portfolioButton").addEventListener("click", function(){
     window.location.href = "Portfolio.html";
 });


// index.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";

// Your Firebase config (public values only)
const firebaseConfig = {
    apiKey: "AIzaSyA35BdFVlIVLS4Qz16nDplkuD2BNZuoDu8",
    authDomain: "stellazhq-bb090.firebaseapp.com",
    projectId: "stellazhq-bb090",
    storageBucket: "stellazhq-bb090.appspot.com",
    messagingSenderId: "952515321392",
    appId: "1:952515321392:web:0fb1af669529827d7097f5",
};

// Init Firebase
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Attach click handler *after* the DOM loads
window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("loginButton").addEventListener("click", async () => {
        const email    = document.getElementById("username").value;
        const password = document.getElementById("password").value;

        try {
            // Sign in, not sign up
            await signInWithEmailAndPassword(auth, email, password);
            // On success, redirect
            window.location.href = "Lobby.html";
        } catch (err) {
        // Show the error message
            alert(err.message);
        }
    });
});
