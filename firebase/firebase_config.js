import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


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
const storage = getStorage(app);
//#endregion


//? ----------------------------
//* ----- Supabase Setup -------
//? ----------------------------
//#region
const supabase_url = "https://xmycfxwapejnbpareaxc.supabase.co";
const supabase_publishable_key = "sb_publishable_FG31JeX9PleOHKaqH0yaOw_XKn7ySxD";

const supabase = createClient(
    supabase_url,
    supabase_publishable_key,
    {
        accessToken: async () => {
            return (await auth.currentUser?.getIdToken(false)) ?? null;
        }
    }
);
//#endregion


export { app, auth, db, functions, storage, supabase };
