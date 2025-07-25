// // This part is for the login function
// // Get the element with id="loginButton"
// // When the button is "clicked", do the function
// document.getElementById("loginButton").addEventListener("click", function () {
//     // retrieve the value for username and password.
//     const username = document.getElementById("username").value;
//     const password = document.getElementById("password").value;

//     // Replace this with real validation later
//     // Checks if username and password match the values I want
//     if (username === "" && password === "") {
//         // Redirect to the lobby page
//         window.location.href = "Lobby.html";
//     } else {
//         alert("Invalid username or password.");
//     }
// });

// // Pressing "Enter" acts the same a pressing login button
// // "event" is to detect when a key is pressed.
// document.addEventListener("keydown", function (event){
//     // If the enter key has been pressed, do the following.
//     if (event.key === "Enter") {
//         // Get element with id="loginButton" and click it.
//         document.getElementById("loginButton").click();
//     }
// });

// // This part is for the "showPassword" function
// // Get element with id="showPassword"
// document.getElementById("showPassword").addEventListener("change", function(){
//     const passwordInput = document.getElementById("password");
//     passwordInput.type = this.checked ? "text" : "password";
// });

// document.getElementById("portfolioButton").addEventListener("click", function(){
//     window.location.href = "Portfolio.html";
// });



// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, doc, setDoc} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyA35BdFVlIVLS4Qz16nDplkuD2BNZuoDu8",
    authDomain: "stellazhq-bb090.firebaseapp.com",
    projectId: "stellazhq-bb090",
    storageBucket: "stellazhq-bb090.firebasestorage.app",
    messagingSenderId: "952515321392",
    appId: "1:952515321392:web:0fb1af669529827d7097f5",
    measurementId: "G-QPG6L33CK4"
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

//Input fields
const username = document.getElementById("username").value;
const password = document.getElementById("password").value;

createUserWithEmailAndPassword(auth, email, password)
    .then((userCredential) => {
        // Signed up 
        const user = userCredential.user;
        setDoc(doc(db,"users", user.uid), {
            email: user.email,

        })


        window.location.href="Lobby.html";
    })
    .catch((error) => {
        const errorCode = error.code;
        const errorMessage = error.message;
        alert(ErrorMessage);
    });
