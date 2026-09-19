import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";

import { auth, functions, supabase } from "../firebase/firebase_config.js";

//? ---------------------------------
//* ----- Smart Recommendations ----
//? ---------------------------------
//#region
const recommendation_grid = document.getElementById("recommendation_grid");
const recommendation_count = document.querySelector(".recommendation-count");

async function load_movie_recommendations(movies) {
    recommendation_grid.innerHTML =
        '<p class="recommendation-loading">Finding movies for you...</p>';

    try {
        const get_movie_recommendations =
            httpsCallable(functions, "getMovieRecommendations");

        const result = await get_movie_recommendations({
            movies: movies.map((movie) => ({
                title: movie.title,
                year: movie.year,
                my_rating: movie.my_rating,
                tmdb_rating: movie.tmdb_rating
            }))
        });

        const recommendations = result.data.recommendations || [];
        recommendation_count.textContent =
            `${recommendations.length} PICKS`;

        if (recommendations.length === 0) {
            recommendation_grid.innerHTML =
                '<p class="recommendation-loading">Rate a few movies to improve your recommendations.</p>';
            return;
        }

        recommendation_grid.innerHTML = recommendations.map((movie) => {
            const reason = movie.because_of?.length
                ? `Because you liked ${movie.because_of.join(" and ")}`
                : "Picked from your movie history";

            const rating = movie.tmdb_rating !== null
                ? ` · ⭐ ${Number(movie.tmdb_rating).toFixed(1)}`
                : "";

            return `
                <article class="recommendation-card"
                         tabindex="0"
                         role="button"
                         data-recommendation-id="${movie.tmdb_id}"
                         aria-label="View details for ${movie.title}">
                    <div class="recommendation-poster-wrap">
                        <img class="recommendation-poster"
                             src="${movie.poster_url}"
                             alt="${movie.title} poster"
                             loading="lazy">
                        <span class="recommendation-expand-icon" aria-hidden="true">＋</span>
                    </div>
                    <h3 title="${movie.title}">${movie.title}</h3>
                    <p>${movie.year}${rating}</p>
                    <p class="recommendation-reason">${reason}</p>
                    <div class="recommendation-details">
                        <p class="recommendation-description">${movie.overview || "No description available."}</p>
                        <p class="recommendation-match">${reason}</p>
                    </div>
                </article>
            `;
        }).join("");
    } catch (error) {
        console.error("Unable to load recommendations:", error);
        recommendation_count.textContent = "—";
        recommendation_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load recommendations.</p>';
    }
}

recommendation_grid.addEventListener("click", (event) => {
    const card = event.target.closest(".recommendation-card");

    if (!card) {
        return;
    }

    card.classList.toggle("expanded");
});

recommendation_grid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
        return;
    }

    const card = event.target.closest(".recommendation-card");

    if (!card) {
        return;
    }

    event.preventDefault();
    card.classList.toggle("expanded");
});

//#endregion


//? ------------------------------
//* ----- Supabase Library -------
//? ------------------------------
//#region
const movie_count = document.getElementById("movie_count");
const movie_watch_time = document.getElementById("movie_watch_time");
const movie_library_count = document.getElementById("movie_library_count");
const movie_grid = document.getElementById("movie_grid");
const movie_library_toggle = document.getElementById("movie_library_toggle");
const movie_search = document.getElementById("movie_search");
const genre_filter = document.getElementById("genre_filter");
const franchise_filter = document.getElementById("franchise_filter");
const movie_sort = document.getElementById("movie_sort");
const movie_filter_clear = document.getElementById("movie_filter_clear");

let movie_library = [];

function get_collapsed_movie_count() {
    if (window.innerWidth <= 700) {
        return 4;
    }

    if (window.innerWidth <= 1100) {
        return 10;
    }

    return 14;
}

function create_movie_card(movie, index) {
    const poster = movie.poster_url
        ? `<img class="movie-poster" src="${movie.poster_url}" alt="${movie.title} poster" loading="lazy">`
        : `<div class="movie-poster-placeholder"><span>${movie.title}</span></div>`;

    const personal_rating_value = movie.my_rating !== null
        ? Number(movie.my_rating)
        : null;

    const tomato_rating = movie.tomato_rating !== null
        ? ` · 🍅 ${movie.tomato_rating}%`
        : "";

    const audience_rating = movie.audience_rating !== null
        ? ` · 🍿 ${movie.audience_rating}%`
        : "";

    const tmdb_rating = movie.tmdb_rating !== null &&
        movie.tmdb_rating !== undefined
        ? ` · ⭐ ${Number(movie.tmdb_rating).toFixed(1)}`
        : "";

    const personal_rating = personal_rating_value !== null
        ? ` · ★ ${personal_rating_value}/10`
        : " · ★ —";

    const rating_buttons = Array.from({length: 10}, (_, index) => {
        const rating = index + 1;
        const selected = personal_rating_value !== null &&
            rating <= personal_rating_value;

        return `
            <button class="rating-star ${selected ? "selected" : ""}"
                    type="button"
                    data-movie-id="${movie.id}"
                    data-rating="${rating}"
                    aria-label="Rate ${movie.title} ${rating} out of 10">
                ★
                <span>${rating}</span>
            </button>
        `;
    }).join("");

    const extra_class = index >= get_collapsed_movie_count()
        ? " library-extra"
        : "";

    return `
        <article class="movie-card${extra_class}">
            <div class="movie-poster-wrap">
                ${poster}
                <div class="movie-rating-overlay">
                    <p>Rate this movie</p>
                    <div class="rating-stars">${rating_buttons}</div>
                </div>
            </div>
            <h3 title="${movie.title}">${movie.title}</h3>
            <p class="movie-meta">
                ${movie.year}${tomato_rating}${audience_rating}${tmdb_rating}${personal_rating}
            </p>
        </article>
    `;
}

async function save_personal_rating(movie_id, rating) {
    const my_rating = rating === "" ? null : Number(rating);

    const { error } = await supabase
        .from("movies")
        .update({my_rating})
        .eq("id", movie_id);

    if (error) {
        throw error;
    }

    const movie = movie_library.find((item) => item.id === movie_id);

    if (movie) {
        movie.my_rating = my_rating;
    }
}

movie_grid.addEventListener("click", async (event) => {
    const rating_button = event.target.closest(".rating-star");

    if (!rating_button) {
        return;
    }

    const movie_id = Number(rating_button.dataset.movieId);
    const rating = Number(rating_button.dataset.rating);
    const card = rating_button.closest(".movie-card");

    try {
        await save_personal_rating(movie_id, rating);

        card.querySelectorAll(".rating-star").forEach((button) => {
            button.classList.toggle(
                "selected",
                Number(button.dataset.rating) <= rating
            );
        });

        const movie = movie_library.find((item) => item.id === movie_id);

        if (movie) {
            const meta = card.querySelector(".movie-meta");
            const tomato = movie.tomato_rating !== null
                ? ` · 🍅 ${movie.tomato_rating}%`
                : "";
            const audience = movie.audience_rating !== null
                ? ` · 🍿 ${movie.audience_rating}%`
                : "";
            const tmdb = movie.tmdb_rating !== null &&
                movie.tmdb_rating !== undefined
                ? ` · ⭐ ${Number(movie.tmdb_rating).toFixed(1)}`
                : "";

            meta.textContent =
                `${movie.year}${tomato}${audience}${tmdb} · ★ ${rating}/10`;
        }
    } catch (error) {
        console.error("Unable to save personal rating:", error);
        alert("Unable to save your rating. Please try again.");
    }
});

function populate_movie_filters(movies) {
    const genres = [...new Set(
        movies.flatMap((movie) => movie.genres || [])
    )].sort((a, b) => a.localeCompare(b));

    const franchises = [...new Set(
        movies
            .map((movie) => movie.franchise)
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    genre_filter.innerHTML = '<option value="">All genres</option>' +
        genres.map((genre) => `<option value="${genre}">${genre}</option>`).join("");

    franchise_filter.innerHTML = '<option value="">All franchises</option>' +
        franchises.map((franchise) =>
            `<option value="${franchise}">${franchise}</option>`
        ).join("");
}

function get_filtered_movies() {
    const search = movie_search.value.trim().toLowerCase();
    const genre = genre_filter.value;
    const franchise = franchise_filter.value;

    const filtered_movies = movie_library.filter((movie) => {
        const matches_search = !search ||
            movie.title.toLowerCase().includes(search);
        const matches_genre = !genre ||
            (movie.genres || []).includes(genre);
        const matches_franchise = !franchise ||
            movie.franchise === franchise;

        return matches_search && matches_genre && matches_franchise;
    });

    return filtered_movies.sort((a, b) => {
        switch (movie_sort.value) {
            case "year-asc":
                return a.year - b.year;
            case "title-asc":
                return a.title.localeCompare(b.title);
            case "title-desc":
                return b.title.localeCompare(a.title);
            default:
                return b.year - a.year;
        }
    });
}

function render_movie_library() {
    const movies = get_filtered_movies();

    movie_grid.classList.remove("expanded");

    if (movies.length === 0) {
        movie_grid.innerHTML =
            '<p class="library-loading">No movies match these filters.</p>';
        movie_library_toggle.hidden = true;
        movie_library_count.textContent = "0 MATCHES";
        return;
    }

    movie_grid.innerHTML = movies.map(create_movie_card).join("");

    const filters_active = movie_search.value.trim() ||
        genre_filter.value ||
        franchise_filter.value;

    movie_library_count.textContent = filters_active
        ? `${movies.length} OF ${movie_library.length} MOVIES`
        : `${movie_library.length} MOVIES`;

    const has_hidden_movies = movies.length > get_collapsed_movie_count();
    movie_library_toggle.hidden = !has_hidden_movies;
    movie_library_toggle.textContent = "Show all movies";
}

async function enrich_missing_movie_metadata(movies) {
    const movies_missing_metadata = movies.filter(
        (movie) => !movie.poster_url || movie.tmdb_rating === null
    );

    if (movies_missing_metadata.length === 0) {
        return false;
    }

    const get_movie_metadata = httpsCallable(functions, "getMovieMetadata");

    for (const movie of movies_missing_metadata) {
        try {
            const result = await get_movie_metadata({
                title: movie.title,
                year: movie.year
            });

            const metadata = result.data;

            const { error } = await supabase
                .from("movies")
                .update({
                    poster_url: metadata.poster_url,
                    genres: metadata.genres,
                    runtime_minutes: metadata.runtime_minutes,
                    tmdb_rating: metadata.tmdb_rating
                })
                .eq("id", movie.id);

            if (error) {
                throw error;
            }

            movie.poster_url = metadata.poster_url;
            movie.genres = metadata.genres;
            movie.runtime_minutes = metadata.runtime_minutes;
            movie.tmdb_rating = metadata.tmdb_rating;

            console.log("Added TMDB metadata:", movie.title);
        } catch (error) {
            console.error("Unable to add TMDB metadata:", movie.title, error);
        }
    }

    return true;
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

        const total_runtime_minutes = movies.reduce(
            (total, movie) => total + (movie.runtime_minutes || 0),
            0
        );
        const total_runtime_hours = Math.round(total_runtime_minutes / 60);

        movie_watch_time.textContent = `${total_runtime_hours}h`;
        movie_library_count.textContent = `${movies.length} MOVIES`;

        if (movies.length === 0) {
            movie_grid.innerHTML = '<p class="library-loading">No movies added yet.</p>';
            return;
        }

        await enrich_missing_movie_metadata(movies);

        movie_library = movies;
        populate_movie_filters(movies);
        render_movie_library();
        await load_movie_recommendations(movies);

        movies.forEach((movie) => {
            console.log("Loaded Supabase movie:", movie.title, movie);
        });
    } catch (error) {
        console.error("Unable to load Supabase movie library:", error);
        movie_count.textContent = "Error";
        movie_watch_time.textContent = "—";
        movie_library_count.textContent = "ERROR";
        movie_grid.innerHTML = '<p class="library-loading">Unable to load your movies.</p>';
    }
}
[movie_search, genre_filter, franchise_filter, movie_sort].forEach((control) => {
    control.addEventListener("input", render_movie_library);
    control.addEventListener("change", render_movie_library);
});

movie_filter_clear.addEventListener("click", () => {
    movie_search.value = "";
    genre_filter.value = "";
    franchise_filter.value = "";
    movie_sort.value = "year-desc";
    render_movie_library();
});

movie_library_toggle.addEventListener("click", () => {
    const expanded = movie_grid.classList.toggle("expanded");

    movie_library_toggle.textContent = expanded
        ? "Show less"
        : "Show all movies";

    if (!expanded) {
        document.getElementById("movie_library").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
});
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
