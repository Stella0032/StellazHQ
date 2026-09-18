import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";

import { auth, functions, supabase } from "../firebase/firebase_config.js";

//? ---------------------------------
//* ----- Recommendation Data ------
//? ---------------------------------
//#region
// Temporary placeholders only.
// Later, this data will come from the user's actual entertainment library.
const recommendations = {
    movies: [
        "Movie Recommendation 1",
        "Movie Recommendation 2",
        "Movie Recommendation 3",
        "Movie Recommendation 4",
        "Movie Recommendation 5",
        "Movie Recommendation 6"
    ],
    shows: [
        "TV Recommendation 1",
        "TV Recommendation 2",
        "TV Recommendation 3",
        "TV Recommendation 4",
        "TV Recommendation 5",
        "TV Recommendation 6"
    ],
    anime: [
        "Anime Recommendation 1",
        "Anime Recommendation 2",
        "Anime Recommendation 3",
        "Anime Recommendation 4",
        "Anime Recommendation 5",
        "Anime Recommendation 6"
    ],
    manga: [
        "Manga / Manhwa Recommendation 1",
        "Manga / Manhwa Recommendation 2",
        "Manga / Manhwa Recommendation 3",
        "Manga / Manhwa Recommendation 4",
        "Manga / Manhwa Recommendation 5",
        "Manga / Manhwa Recommendation 6"
    ]
};
//#endregion


//? ---------------------------------
//* ----- Recommendation Tabs ------
//? ---------------------------------
//#region
const recommendation_grid = document.getElementById("recommendation_grid");
const recommendation_tabs = document.querySelectorAll(".recommendation-tab");

function show_recommendations(category) {
    const category_recommendations = recommendations[category];

    recommendation_grid.innerHTML = category_recommendations
        .map((title) => `
            <article class="recommendation-card">
                <div class="poster-placeholder" aria-hidden="true">✦</div>
                <h3>${title}</h3>
                <p>Recommendation</p>
            </article>
        `)
        .join("");
}

recommendation_tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        recommendation_tabs.forEach((item) => item.classList.remove("active"));
        tab.classList.add("active");
        show_recommendations(tab.dataset.category);
    });
});

show_recommendations("movies");
//#endregion


//? ------------------------------
//* ----- Supabase Library -------
//? ------------------------------
//#region
const movie_count = document.getElementById("movie_count");

async function load_movie_library() {
    try {
        const { data: movies, error } = await supabase
            .from("movies")
            .select("*")
            .order("added_at", { ascending: false });

        if (error) {
            throw error;
        }

        movie_count.textContent = movies.length;

        movies.forEach((movie) => {
            console.log("Loaded Supabase movie:", movie.title, movie);
        });
    } catch (error) {
        console.error("Unable to load Supabase movie library:", error);
        movie_count.textContent = "Error";
    }
}
//#endregion


//? ------------------------------
//* ----- Authentication ---------
//? ------------------------------
//#region
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../index.html";
        return;
    }

    try {
        const set_supabase_role = httpsCallable(functions, "setSupabaseRole");
        const result = await set_supabase_role();

        // Force Firebase to issue a fresh token containing the Supabase role.
        await user.getIdToken(true);

        console.log("Supabase role added successfully!");
        console.log(result.data.message);
        console.log("Firebase UID:", user.uid);

        await load_movie_library();
    } catch (error) {
        console.error("Unable to prepare Supabase access:", error);
        movie_count.textContent = "Error";
    }
});
//#endregion


//? ------------------------------
//* ----- Library Navigation -----
//? ------------------------------
//#region
const library_cards = document.querySelectorAll("[data-library]");
const toast = document.getElementById("toast");

library_cards.forEach((card) => {
    card.addEventListener("click", (event) => {
        event.preventDefault();

        toast.textContent = `${card.dataset.library} library is the next page to build.`;
        toast.classList.add("show");

        clearTimeout(window.entertainment_toast_timeout);
        window.entertainment_toast_timeout = setTimeout(() => {
            toast.classList.remove("show");
        }, 1800);
    });
});
//#endregion
