import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";


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
    appId: "1:952515321392:web:0fb1af669529827d7097f5",
};

const app = initializeApp(firebase_config);
const auth = getAuth(app);
const functions = getFunctions(app, "us-central1");
//#endregion


//? ----------------------------
//* ----- Login ----------------
//? ----------------------------
//#region
const login_button = document.getElementById("loginButton");
const username = document.getElementById("username");
const password = document.getElementById("password");

document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" &&
        !document.getElementById("signupDialog").open) {
        login_button.click();
    }
});

document.getElementById("showPassword").addEventListener("change", function () {
    password.type = this.checked ? "text" : "password";
});

login_button.addEventListener("click", async () => {
    try {
        await signInWithEmailAndPassword(
            auth,
            username.value.trim(),
            password.value
        );
        window.location.href = "lobby_page/Lobby.html";
    } catch (error) {
        alert(error.message);
    }
});
//#endregion


//? ----------------------------
//* ----- Invite Signup --------
//? ----------------------------
//#region
const signup_dialog = document.getElementById("signupDialog");
const signup_form = document.getElementById("signupForm");
const signup_message = document.getElementById("signupMessage");
const create_account_button =
    document.getElementById("createAccountButton");

document.getElementById("openSignupButton").addEventListener("click", () => {
    signup_message.textContent = "";
    signup_dialog.showModal();
});

document.getElementById("closeSignupButton").addEventListener("click", () => {
    signup_dialog.close();
});

signup_dialog.addEventListener("click", (event) => {
    const bounds = signup_dialog.getBoundingClientRect();
    const outside =
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom;

    if (outside) signup_dialog.close();
});

signup_form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email =
        document.getElementById("signupEmail").value.trim();
    const signup_password =
        document.getElementById("signupPassword").value;
    const confirm_password =
        document.getElementById("signupConfirmPassword").value;
    const invite_key =
        document.getElementById("signupInviteKey").value.trim();

    if (signup_password !== confirm_password) {
        signup_message.textContent = "Passwords do not match.";
        return;
    }

    create_account_button.disabled = true;
    signup_message.textContent = "Creating account...";

    try {
        const create_invited_account =
            httpsCallable(functions, "createInvitedAccount");
        await create_invited_account({
            email,
            password: signup_password,
            invite_key
        });

        signup_message.textContent =
            "Account created. Signing you in...";

        await signInWithEmailAndPassword(
            auth,
            email,
            signup_password
        );

        window.location.href = "lobby_page/Lobby.html";
    } catch (error) {
        console.error("Unable to create account:", error);

        const messages = {
            "functions/permission-denied":
                "That invite key is invalid, expired, or already used.",
            "functions/already-exists":
                "An account already exists for that email.",
            "functions/invalid-argument":
                "Check your email and password, then try again."
        };

        signup_message.textContent =
            messages[error.code] ||
            "Unable to create the account. Please try again.";
    } finally {
        create_account_button.disabled = false;
    }
});
//#endregion


//? ----------------------------
//* ----- Navigation ----------
//? ----------------------------
//#region
document.getElementById("portfolioButton").addEventListener("click", () => {
    window.location.href = "portfolio_page/Portfolio.html";
});

document.getElementById("security_robot").addEventListener("click", () => {
    window.location.href = "security_robot_page/security_robot.html";
});
//#endregion
