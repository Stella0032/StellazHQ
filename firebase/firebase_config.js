import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";


//? ----------------------------
//* ----- Firebase Setup -------
//? ----------------------------
//#region
const firebase_config = {
    apiKey: "AIzaSyA35BdFVlIVLS4Qz16nDplkuD2BNZuoDu8",
    authDomain: "stellazhq-bb090.firebaseapp.com",
    projectId: "stellazhq-bb090",
    storageBucket: "stellazhq-bb090.appspot.com",
    messagingSenderId: "952515321392",
    appId: "1:952515321392:web:0fb1af669529827d7097f5"
};

const app = initializeApp(firebase_config);

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");
//#endregion


export { app, auth, db, functions };