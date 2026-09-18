import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";

import { auth, functions, supabase } from "../firebase/firebase_config.js";

//? ---------------------------------
//* ----- Recommendation Data ------
//? ---------------------------------
//#region
const recommendations = {
    movies: [
        { title: "Venom", year: 2018, reason: "More of Sony's Spider-Man universe" },
        { title: "Doctor Strange", year: 2016, reason: "Marvel magic and multiverse energy" },
        { title: "Avengers: Infinity War", year: 2018, reason: "Spider-Man continues in the MCU" },
        { title: "Avengers: Endgame", year: 2019, reason: "Continues the MCU story" },
        { title: "Deadpool & Wolverine", year: 2024, reason: "Marvel multiverse action" },
        { title: "Big Hero 6", year: 2014, reason: "Animated superhero adventure" }
    ],
    shows: [
        { title: "Daredevil", reason: "Street-level Marvel story" },
        { title: "Loki", reason: "Marvel multiverse story" },
        { title: "The Boys", reason: "A very different superhero series" },
        { title: "Invincible", reason: "Animated superhero action" },
        { title: "Hawkeye", reason: "Street-level MCU adventure" },
        { title: "Moon Knight", reason: "A darker Marvel story" }
    ],
    anime: [
        { title: "My Hero Academia", reason: "Superhero-focused anime" },
        { title: "One Punch Man", reason: "Superhero action and comedy" },
        { title: "Jujutsu Kaisen", reason: "Fast supernatural action" },
        { title: "Demon Slayer", reason: "Stylish action adventure" },
        { title: "Mob Psycho 100", reason: "Powers, action and heart" },
        { title: "Solo Leveling", reason: "Power progression and action" }
    ],
    manga: [
        { title: "One-Punch Man", reason: "Superhero manga" },
        { title: "My Hero Academia", reason: "A world built around heroes" },
        { title: "Kaiju No. 8", reason: "Action and transformation powers" },
        { title: "Chainsaw Man", reason: "Wild supernatural action" },
        { title: "Solo Leveling", reason: "Fast power progression" },
        { title: "Dandadan", reason: "Supernatural action and comedy" }
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
        .map((item) => `
            <article class="recommendation-card">
                <div class="poster-placeholder" aria-hidden="true">✦</div>
                <h3>${item.title}</h3>
                <p>${item.year ? `${item.year} · ` : ""}${item.reason}</p>
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
const movie_library_count = document.getElementById("movie_library_count");
const movie_grid = document.getElementById("movie_grid");

function create_movie_card(movie) {
    const poster = movie.poster_url
        ? `<img class="movie-poster" src="${movie.poster_url}" alt="${movie.title} poster" loading="lazy">`
        : `<div class="movie-poster-placeholder"><span>${movie.title}</span></div>`;

    const rating = movie.my_rating !== null
        ? ` · ★ ${movie.my_rating}/10`
        : "";

    return `
        <article class="movie-card">
            ${poster}
            <h3 title="${movie.title}">${movie.title}</h3>
            <p class="movie-meta">${movie.year}${rating}</p>
        </article>
    `;
}

async function load_movie_library() {
    try {
        const { data: movies, error } = await supabase
            .from("movies")
            .select("*")
            .order("year", { ascending: false });

        if (error) {
            throw error;
        }

        movie_count.textContent = movies.length;
        movie_library_count.textContent = `${movies.length} MOVIES`;

        if (movies.length === 0) {
            movie_grid.innerHTML = '<p class="library-loading">No movies added yet.</p>';
            return;
        }

        movie_grid.innerHTML = movies.map(create_movie_card).join("");

        movies.forEach((movie) => {
            console.log("Loaded Supabase movie:", movie.title, movie);
        });
    } catch (error) {
        console.error("Unable to load Supabase movie library:", error);
        movie_count.textContent = "Error";
        movie_library_count.textContent = "ERROR";
        movie_grid.innerHTML = '<p class="library-loading">Unable to load your movies.</p>';
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
        if (card.dataset.library === "Movies") {
            event.preventDefault();
            document.getElementById("movie_library").scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
            return;
        }

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
