import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";

import { auth, functions, supabase } from "../firebase/firebase_config.js";

//? ---------------------------------
//* ----- Smart Recommendations ----
//? ---------------------------------
//#region
const recommendation_grid = document.getElementById("recommendation_grid");
const recommendation_count = document.querySelector(".recommendation-count");

let recommendation_pool = [];
let visible_recommendations = [];

function create_recommendation_card(movie) {
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
                <button class="recommendation-refresh"
                        type="button"
                        title="Show me something else"
                        aria-label="Replace ${movie.title} with another suggestion">
                    ↻
                </button>
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
}

function render_recommendations() {
    recommendation_count.textContent =
        `${visible_recommendations.length} PICKS`;

    recommendation_grid.innerHTML =
        visible_recommendations.map(create_recommendation_card).join("");
}

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

        recommendation_pool = result.data.recommendations || [];
        visible_recommendations = recommendation_pool.splice(0, 6);

        if (visible_recommendations.length === 0) {
            recommendation_count.textContent = "0 PICKS";
            recommendation_grid.innerHTML =
                '<p class="recommendation-loading">Rate a few movies to improve your recommendations.</p>';
            return;
        }

        render_recommendations();
    } catch (error) {
        console.error("Unable to load recommendations:", error);
        recommendation_count.textContent = "—";
        recommendation_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load recommendations.</p>';
    }
}

recommendation_grid.addEventListener("click", (event) => {
    const refresh_button = event.target.closest(".recommendation-refresh");
    const card = event.target.closest(".recommendation-card");

    if (!card) {
        return;
    }

    if (refresh_button) {
        event.stopPropagation();

        const replacement = recommendation_pool.shift();

        if (!replacement) {
            refresh_button.disabled = true;
            refresh_button.textContent = "✓";
            refresh_button.title = "No more suggestions right now";
            return;
        }

        const current_id = Number(card.dataset.recommendationId);
        const index = visible_recommendations.findIndex(
            (movie) => movie.tmdb_id === current_id
        );

        if (index !== -1) {
            visible_recommendations[index] = replacement;
            card.outerHTML = create_recommendation_card(replacement);
        }

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
//* ----- TV Show Library --------
//? ------------------------------
//#region
const show_count = document.getElementById("show_count");
const show_library_count = document.getElementById("show_library_count");
const show_grid = document.getElementById("show_grid");
const show_library_toggle = document.getElementById("show_library_toggle");
const show_search = document.getElementById("show_search");
const show_genre_filter = document.getElementById("show_genre_filter");
const show_sort = document.getElementById("show_sort");
const show_filter_clear = document.getElementById("show_filter_clear");

let show_library = [];

function create_show_card(show, index) {
    const poster = show.poster_url
        ? `<img class="movie-poster" src="${show.poster_url}" alt="${show.title} poster" loading="lazy">`
        : `<div class="movie-poster-placeholder"><span>${show.title}</span></div>`;

    const personal_rating_value = show.my_rating !== null
        ? Number(show.my_rating)
        : null;
    const tmdb_rating = show.tmdb_rating !== null
        ? ` · ⭐ ${Number(show.tmdb_rating).toFixed(1)}`
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
                    type="button" data-show-id="${show.id}"
                    data-rating="${rating}"
                    aria-label="Rate ${show.title} ${rating} out of 10">
                ★<span>${rating}</span>
            </button>`;
    }).join("");
    const extra_class = index >= get_collapsed_movie_count()
        ? " library-extra"
        : "";

    return `
        <article class="movie-card${extra_class}">
            <div class="movie-poster-wrap">
                ${poster}
                <div class="movie-rating-overlay">
                    <p>Rate this show</p>
                    <div class="rating-stars">${rating_buttons}</div>
                </div>
            </div>
            <h3 title="${show.title}">${show.title}</h3>
            <p class="movie-meta">${show.year}${tmdb_rating}${personal_rating}</p>
        </article>`;
}

function get_filtered_shows() {
    const search = show_search.value.trim().toLowerCase();
    const genre = show_genre_filter.value;

    return show_library.filter((show) => {
        return (!search || show.title.toLowerCase().includes(search)) &&
            (!genre || (show.genres || []).includes(genre));
    }).sort((a, b) => {
        switch (show_sort.value) {
            case "year-asc": return a.year - b.year;
            case "title-asc": return a.title.localeCompare(b.title);
            case "title-desc": return b.title.localeCompare(a.title);
            default: return b.year - a.year;
        }
    });
}

function render_show_library() {
    const shows = get_filtered_shows();
    show_grid.classList.remove("expanded");

    if (shows.length === 0) {
        show_grid.innerHTML =
            '<p class="library-loading">No TV shows match these filters.</p>';
        show_library_toggle.hidden = true;
        show_library_count.textContent = "0 MATCHES";
        return;
    }

    show_grid.innerHTML = shows.map(create_show_card).join("");
    const filters_active = show_search.value.trim() || show_genre_filter.value;
    show_library_count.textContent = filters_active
        ? `${shows.length} OF ${show_library.length} SHOWS`
        : `${show_library.length} SHOWS`;
    show_library_toggle.hidden =
        shows.length <= get_collapsed_movie_count();
    show_library_toggle.textContent = "Show all shows";
}

function populate_show_filters(shows) {
    const genres = [...new Set(
        shows.flatMap((show) => show.genres || [])
    )].sort((a, b) => a.localeCompare(b));

    show_genre_filter.innerHTML = '<option value="">All genres</option>' +
        genres.map((genre) =>
            `<option value="${genre}">${genre}</option>`
        ).join("");
}

async function enrich_missing_show_metadata(shows) {
    const missing = shows.filter(
        (show) => !show.poster_url || show.tmdb_rating === null
    );
    const get_tv_show_metadata =
        httpsCallable(functions, "getTVShowMetadata");

    for (const show of missing) {
        try {
            const result = await get_tv_show_metadata({
                title: show.title,
                year: show.year
            });
            const metadata = result.data;
            const {error} = await supabase.from("tv_shows").update({
                poster_url: metadata.poster_url,
                genres: metadata.genres,
                tmdb_rating: metadata.tmdb_rating
            }).eq("id", show.id);

            if (error) throw error;

            show.poster_url = metadata.poster_url;
            show.genres = metadata.genres;
            show.tmdb_rating = metadata.tmdb_rating;
        } catch (error) {
            console.error("Unable to add TV metadata:", show.title, error);
        }
    }
}

async function load_show_library() {
    try {
        const {data: shows, error} = await supabase
            .from("tv_shows").select("*").order("year", {ascending: false});

        if (error) throw error;

        show_count.textContent = shows.length;
        show_library_count.textContent = `${shows.length} SHOWS`;

        if (shows.length === 0) {
            show_library = [];
            show_grid.innerHTML =
                '<p class="library-loading">No TV shows added yet.</p>';
            return;
        }

        await enrich_missing_show_metadata(shows);
        show_library = shows;
        populate_show_filters(shows);
        render_show_library();
    } catch (error) {
        console.error("Unable to load TV show library:", error);
        show_count.textContent = "Error";
        show_library_count.textContent = "ERROR";
        show_grid.innerHTML =
            '<p class="library-loading">Unable to load your TV shows.</p>';
    }
}

show_grid.addEventListener("click", async (event) => {
    const button = event.target.closest(".rating-star");
    if (!button) return;

    const show_id = Number(button.dataset.showId);
    const rating = Number(button.dataset.rating);

    try {
        const {error} = await supabase.from("tv_shows")
            .update({my_rating: rating}).eq("id", show_id);
        if (error) throw error;

        const show = show_library.find((item) => item.id === show_id);
        if (show) show.my_rating = rating;
        render_show_library();
    } catch (error) {
        console.error("Unable to save TV show rating:", error);
        alert("Unable to save your rating. Please try again.");
    }
});

[show_search, show_genre_filter, show_sort].forEach((control) => {
    control.addEventListener("input", render_show_library);
    control.addEventListener("change", render_show_library);
});

show_filter_clear.addEventListener("click", () => {
    show_search.value = "";
    show_genre_filter.value = "";
    show_sort.value = "year-desc";
    render_show_library();
});

show_library_toggle.addEventListener("click", () => {
    const expanded = show_grid.classList.toggle("expanded");
    show_library_toggle.textContent = expanded ? "Show less" : "Show all shows";
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
        await load_show_library();
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
        if (card.dataset.library === "Movies" ||
            card.dataset.library === "TV Shows") {
            event.preventDefault();
            const target_id = card.dataset.library === "Movies"
                ? "movie_library"
                : "show_library";
            document.getElementById(target_id).scrollIntoView({
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
