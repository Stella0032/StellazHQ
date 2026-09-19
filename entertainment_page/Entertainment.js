import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";

import { auth, functions, supabase } from "../firebase/firebase_config.js";

//? ---------------------------------
//* ----- Smart Recommendations ----
//? ---------------------------------
//#region
const recommendation_grid = document.getElementById("recommendation_grid");
const recommendation_count = document.querySelector(".recommendation-count");
const recommendation_title = document.getElementById("recommendation_title");

let active_recommendation_type = "movie";

let recommendation_pool = [];
let visible_recommendations = [];

function create_recommendation_card(movie) {
    const media_label = active_recommendation_type === "show"
        ? "show"
        : "movie";
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
    active_recommendation_type = "movie";
    recommendation_title.textContent = "Recommended Movies For You";
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


async function load_show_recommendations(shows) {
    active_recommendation_type = "show";
    recommendation_title.textContent = "Recommended TV Shows For You";
    recommendation_grid.innerHTML =
        '<p class="recommendation-loading">Finding shows for you...</p>';

    if (shows.length === 0) {
        recommendation_count.textContent = "0 PICKS";
        recommendation_grid.innerHTML =
            '<p class="recommendation-loading">Add and rate some TV shows to get recommendations.</p>';
        return;
    }

    try {
        const get_show_recommendations =
            httpsCallable(functions, "getTVShowRecommendations");
        const result = await get_show_recommendations({
            shows: shows.map((show) => ({
                title: show.title,
                year: show.year,
                my_rating: show.my_rating,
                tmdb_rating: show.tmdb_rating
            }))
        });

        recommendation_pool = result.data.recommendations || [];
        visible_recommendations = recommendation_pool.splice(0, 6);

        if (visible_recommendations.length === 0) {
            recommendation_count.textContent = "0 PICKS";
            recommendation_grid.innerHTML =
                '<p class="recommendation-loading">Rate a few shows to improve your recommendations.</p>';
            return;
        }

        render_recommendations();
    } catch (error) {
        console.error("Unable to load TV recommendations:", error);
        recommendation_count.textContent = "—";
        recommendation_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load TV recommendations.</p>';
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
        return 12;
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
        <article class="movie-card${extra_class}" data-library-item="movie" data-item-id="${movie.id}">
            <div class="movie-poster-wrap">
                ${poster}
                <button class="library-remove-button" type="button" data-remove-type="movie" data-remove-id="${movie.id}" aria-label="Remove ${movie.title} from your movies" title="Remove from library">×</button>
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
            case "tmdb-desc":
                return (b.tmdb_rating ?? -1) - (a.tmdb_rating ?? -1);
            case "mine-desc":
                return (b.my_rating ?? -1) - (a.my_rating ?? -1);
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
const show_details_dialog = document.getElementById("show_details_dialog");
const show_details_title = document.getElementById("show_details_title");
const show_details_close = document.getElementById("show_details_close");
const season_back_button = document.getElementById("season_back_button");
const season_grid = document.getElementById("season_grid");
const episode_list = document.getElementById("episode_list");

let active_show_tmdb_id = null;
let active_show_title = "";
let active_show_id = null;
let season_watch_progress = new Map();
let active_season_number = null;
let active_season_episodes = [];

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
        <article class="movie-card${extra_class}" data-library-item="show" data-item-id="${show.id}">
            <div class="movie-poster-wrap">
                ${poster}
                <button class="library-remove-button" type="button" data-remove-type="show" data-remove-id="${show.id}" aria-label="Remove ${show.title} from your TV shows" title="Remove from library">×</button>
                <div class="movie-rating-overlay">
                    <p>Rate this show</p>
                    <div class="rating-stars">${rating_buttons}</div>
                </div>
            </div>
            <button class="show-title-button" type="button"
                    data-show-open="${show.id}"
                    aria-label="Open seasons for ${show.title}">
                ${show.title}
            </button>
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
            case "tmdb-desc":
                return (b.tmdb_rating ?? -1) - (a.tmdb_rating ?? -1);
            case "mine-desc":
                return (b.my_rating ?? -1) - (a.my_rating ?? -1);
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

async function open_show_seasons(show) {
    active_show_id = show.id;
    show_details_title.textContent = show.title;
    season_grid.innerHTML =
        '<p class="library-loading">Loading seasons...</p>';
    episode_list.hidden = true;
    season_grid.hidden = false;
    season_back_button.hidden = true;
    show_details_dialog.showModal();

    try {
        const get_seasons = httpsCallable(functions, "getTVShowSeasons");
        const result = await get_seasons({
            title: show.title,
            year: show.year
        });

        active_show_tmdb_id = result.data.tmdb_id;
        active_show_title = result.data.title;

        const {data: progress, error: progress_error} = await supabase
            .from("tv_season_progress")
            .select("season_number, watched")
            .eq("tv_show_id", show.id);

        if (progress_error) throw progress_error;

        season_watch_progress = new Map(
            (progress || []).map((item) => [item.season_number, item.watched])
        );

        season_grid.innerHTML = result.data.seasons.map((season) => {
            const poster = season.poster_url
                ? `<img src="${season.poster_url}" alt="${season.name} poster" loading="lazy">`
                : '<div class="season-poster-placeholder">No poster</div>';

            const watched = season_watch_progress.get(
                season.season_number
            ) === true;

            return `
                <article class="season-card ${watched ? "watched" : ""}"
                         data-season-number="${season.season_number}">
                    <div class="season-poster-action">
                        <button class="season-open-button" type="button"
                                data-season-open="${season.season_number}">
                            ${poster}
                        </button>
                        <button class="season-watch-overlay ${watched ? "watched" : ""}"
                                type="button"
                                data-season-watched="${season.season_number}"
                                data-episode-count="${season.episode_count}"
                                aria-label="${watched ? "Mark season not watched" : "Mark season watched"}">
                            <span class="season-watch-check">✓</span>
                            <span>${watched ? "Watched" : "Mark watched"}</span>
                        </button>
                    </div>
                    <button class="season-text-button" type="button"
                            data-season-open="${season.season_number}">
                        <strong>${season.name}</strong>
                        <span>${season.episode_count} episodes</span>
                    </button>
                </article>`;
        }).join("") ||
            '<p class="library-loading">No seasons found.</p>';
    } catch (error) {
        console.error("Unable to load seasons:", error);
        const code = error?.code || "";
        const message = code.includes("not-found")
            ? "That show could not be matched on TMDB."
            : code.includes("unimplemented") || code.includes("not-found")
                ? "Season service is not deployed yet."
                : "Unable to load seasons. Check the browser console for details.";
        season_grid.innerHTML =
            `<div class="season-error">
                <strong>Seasons couldn't load</strong>
                <p>${message}</p>
                <button type="button" id="season_retry_button">Try again</button>
            </div>`;
        document.getElementById("season_retry_button")
            ?.addEventListener("click", () => open_show_seasons(show));
    }
}

async function open_season_episodes(season_number) {
    active_season_number = season_number;
    season_grid.hidden = true;
    episode_list.hidden = false;
    season_back_button.hidden = false;
    episode_list.innerHTML =
        '<p class="library-loading">Loading episodes...</p>';

    try {
        const get_episodes =
            httpsCallable(functions, "getTVSeasonEpisodes");
        const result = await get_episodes({
            tmdb_id: active_show_tmdb_id,
            season_number
        });

        show_details_title.textContent =
            `${active_show_title} · ${result.data.name}`;
        active_season_episodes = result.data.episodes;

        const {data: episode_progress, error: episode_progress_error} =
            await supabase.from("tv_episode_progress")
                .select("episode_number, watched")
                .eq("tv_show_id", active_show_id)
                .eq("season_number", season_number);

        if (episode_progress_error) throw episode_progress_error;

        const watched_episodes = new Map(
            (episode_progress || []).map(
                (item) => [item.episode_number, item.watched]
            )
        );

        episode_list.innerHTML = result.data.episodes.map((episode) => {
            const still = episode.still_url
                ? `<img src="${episode.still_url}" alt="" loading="lazy">`
                : '<div class="episode-still-placeholder">▶</div>';
            const runtime = episode.runtime_minutes
                ? ` · ${episode.runtime_minutes} min`
                : "";
            const rating = episode.tmdb_rating
                ? ` · ⭐ ${Number(episode.tmdb_rating).toFixed(1)}`
                : "";

            const watched =
                watched_episodes.get(episode.episode_number) === true;

            return `
                <article class="episode-card ${watched ? "watched" : ""}"
                         data-episode-number="${episode.episode_number}">
                    <button class="episode-watch-image" type="button"
                            data-episode-watched="${episode.episode_number}"
                            aria-label="${watched ? "Mark episode not watched" : "Mark episode watched"}">
                        ${still}
                        <span class="episode-watch-overlay">
                            <span>✓</span>
                            ${watched ? "Watched" : "Mark watched"}
                        </span>
                    </button>
                    <div>
                        <strong>E${episode.episode_number} · ${episode.name}</strong>
                        <p>${episode.air_date || "Air date unavailable"}${runtime}${rating}</p>
                        <p class="episode-overview">${episode.overview || "No description available."}</p>
                    </div>
                </article>`;
        }).join("");
    } catch (error) {
        console.error("Unable to load episodes:", error);
        episode_list.innerHTML =
            '<p class="library-loading">Unable to load episodes.</p>';
    }
}

show_grid.addEventListener("click", (event) => {
    if (event.target.closest(".rating-star") ||
        event.target.closest(".library-remove-button")) {
        return;
    }

    const title_button = event.target.closest("[data-show-open]");
    if (!title_button) return;

    const show = show_library.find(
        (item) => item.id === Number(title_button.dataset.showOpen)
    );
    if (show) open_show_seasons(show);
});

season_grid.addEventListener("click", async (event) => {
    const watch_button = event.target.closest("[data-season-watched]");

    if (watch_button) {
        const season_number = Number(watch_button.dataset.seasonWatched);
        const episode_count = Number(watch_button.dataset.episodeCount);
        const watched = !watch_button.classList.contains("watched");
        const card = watch_button.closest(".season-card");

        watch_button.disabled = true;

        try {
            const {error: season_error} = await supabase
                .from("tv_season_progress")
                .upsert({
                    tv_show_id: active_show_id,
                    season_number,
                    watched
                }, {
                    onConflict: "user_id,tv_show_id,season_number"
                });
            if (season_error) throw season_error;

            const episodes = Array.from(
                {length: episode_count},
                (_, index) => ({
                    tv_show_id: active_show_id,
                    season_number,
                    episode_number: index + 1,
                    watched
                })
            );

            const {error: episode_error} = await supabase
                .from("tv_episode_progress")
                .upsert(episodes, {
                    onConflict:
                        "user_id,tv_show_id,season_number,episode_number"
                });
            if (episode_error) throw episode_error;

            season_watch_progress.set(season_number, watched);
            card.classList.toggle("watched", watched);
            watch_button.classList.toggle("watched", watched);
            watch_button.querySelector("span:last-child").textContent =
                watched ? "Watched" : "Mark watched";
            watch_button.setAttribute(
                "aria-label",
                watched ? "Mark season not watched" : "Mark season watched"
            );
        } catch (error) {
            console.error("Unable to save season progress:", error);
            alert("Unable to save that season. Please try again.");
        } finally {
            watch_button.disabled = false;
        }
        return;
    }

    const open_button = event.target.closest("[data-season-open]");
    if (open_button) {
        open_season_episodes(Number(open_button.dataset.seasonOpen));
    }
});

episode_list.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-episode-watched]");
    if (!button) return;

    const episode_number = Number(button.dataset.episodeWatched);
    const card = button.closest(".episode-card");
    const watched = !card.classList.contains("watched");

    button.disabled = true;

    try {
        const {error} = await supabase
            .from("tv_episode_progress")
            .upsert({
                tv_show_id: active_show_id,
                season_number: active_season_number,
                episode_number,
                watched
            }, {
                onConflict:
                    "user_id,tv_show_id,season_number,episode_number"
            });
        if (error) throw error;

        card.classList.toggle("watched", watched);
        const overlay = button.querySelector(".episode-watch-overlay");
        overlay.innerHTML = `<span>✓</span>${
            watched ? "Watched" : "Mark watched"
        }`;

        const {data: progress, error: progress_error} = await supabase
            .from("tv_episode_progress")
            .select("episode_number, watched")
            .eq("tv_show_id", active_show_id)
            .eq("season_number", active_season_number);

        if (progress_error) throw progress_error;

        const watched_count = (progress || []).filter(
            (item) => item.watched
        ).length;
        const season_watched =
            active_season_episodes.length > 0 &&
            watched_count >= active_season_episodes.length;

        const {error: season_error} = await supabase
            .from("tv_season_progress")
            .upsert({
                tv_show_id: active_show_id,
                season_number: active_season_number,
                watched: season_watched
            }, {
                onConflict: "user_id,tv_show_id,season_number"
            });
        if (season_error) throw season_error;

        season_watch_progress.set(
            active_season_number,
            season_watched
        );
    } catch (error) {
        console.error("Unable to save episode progress:", error);
        alert("Unable to save that episode. Please try again.");
    } finally {
        button.disabled = false;
    }
});

season_back_button.addEventListener("click", () => {
    show_details_title.textContent = active_show_title;
    episode_list.hidden = true;
    season_grid.hidden = false;
    season_back_button.hidden = true;
});

show_details_close.addEventListener("click", () => {
    show_details_dialog.close();
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


//? --------------------------------
//* ----- Manual Library Tools ----
//? --------------------------------
//#region
const movie_add_button = document.getElementById("movie_add_button");
const show_add_button = document.getElementById("show_add_button");
const library_add_dialog = document.getElementById("library_add_dialog");
const library_add_form = document.getElementById("library_add_form");
const library_dialog_title = document.getElementById("library_dialog_title");
const library_dialog_close = document.getElementById("library_dialog_close");
const library_add_title = document.getElementById("library_add_title");
const library_add_year = document.getElementById("library_add_year");
const library_title_results = document.getElementById("library_title_results");
const library_add_submit = document.getElementById("library_add_submit");
const library_remove_dialog = document.getElementById("library_remove_dialog");
const library_remove_form = document.getElementById("library_remove_form");
const library_remove_title = document.getElementById("library_remove_title");
const library_remove_cancel = document.getElementById("library_remove_cancel");

let manual_library_type = "movie";
let pending_remove = null;
let title_search_timeout = null;
let title_search_request = 0;

function show_toast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(window.entertainment_toast_timeout);
    window.entertainment_toast_timeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

function open_add_dialog(type) {
    manual_library_type = type;
    library_dialog_title.textContent =
        type === "movie" ? "Add movie" : "Add TV show";
    library_add_title.value = "";
    library_add_year.value = "";
    library_title_results.innerHTML = "";
    library_title_results.hidden = true;
    library_add_dialog.showModal();
    setTimeout(() => library_add_title.focus(), 0);
}


function render_title_results(results) {
    if (results.length === 0) {
        library_title_results.innerHTML =
            '<p class="library-title-empty">No matches found.</p>';
        library_title_results.hidden = false;
        return;
    }

    library_title_results.innerHTML = results.map((item) => {
        const poster = item.poster_url
            ? `<img src="${item.poster_url}" alt="" loading="lazy">`
            : '<span class="library-title-poster-placeholder">🎬</span>';

        return `
            <button class="library-title-result" type="button"
                    data-title="${item.title.replaceAll('"', "&quot;")}"
                    data-year="${item.year}">
                ${poster}
                <span>
                    <strong>${item.title}</strong>
                    <small>${item.year}</small>
                </span>
            </button>`;
    }).join("");
    library_title_results.hidden = false;
}

library_add_title.addEventListener("input", () => {
    clearTimeout(title_search_timeout);
    const query = library_add_title.value.trim();

    if (query.length < 2) {
        library_title_results.hidden = true;
        library_title_results.innerHTML = "";
        return;
    }

    const request_number = ++title_search_request;

    title_search_timeout = setTimeout(async () => {
        try {
            const search_titles =
                httpsCallable(functions, "searchEntertainmentTitles");
            const result = await search_titles({
                query,
                type: manual_library_type
            });

            if (request_number !== title_search_request) return;
            render_title_results(result.data.results || []);
        } catch (error) {
            console.error("Unable to search titles:", error);
            library_title_results.hidden = true;
        }
    }, 300);
});

library_title_results.addEventListener("click", (event) => {
    const result = event.target.closest(".library-title-result");
    if (!result) return;

    library_add_title.value = result.dataset.title;
    library_add_year.value = result.dataset.year;
    library_title_results.hidden = true;
    library_title_results.innerHTML = "";
});

movie_add_button.addEventListener("click", () => open_add_dialog("movie"));
show_add_button.addEventListener("click", () => open_add_dialog("show"));
library_dialog_close.addEventListener("click", () => library_add_dialog.close());

library_add_form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = library_add_title.value.trim();
    const year = Number(library_add_year.value);
    const is_movie = manual_library_type === "movie";
    const table = is_movie ? "movies" : "tv_shows";

    if (!title || !Number.isInteger(year)) return;

    library_add_submit.disabled = true;
    library_add_submit.textContent = "Adding...";

    try {
        const {error} = await supabase.from(table).insert({
            title,
            year,
            status: "watched"
        });

        if (error) {
            if (error.code === "23505") {
                throw new Error("That title is already in your library.");
            }
            throw error;
        }

        library_add_dialog.close();

        if (is_movie) {
            await load_movie_library();
            show_entertainment_category("Movies");
        } else {
            await load_show_library();
            show_entertainment_category("TV Shows");
        }

        show_toast(`${title} added.`);
    } catch (error) {
        console.error("Unable to add library title:", error);
        alert(error.message || "Unable to add that title.");
    } finally {
        library_add_submit.disabled = false;
        library_add_submit.textContent = "Add to library";
    }
});

function request_remove(type, id) {
    const library = type === "movie" ? movie_library : show_library;
    const item = library.find((entry) => entry.id === id);
    if (!item) return;

    pending_remove = {type, id, title: item.title};
    library_remove_title.textContent = `Remove ${item.title}?`;
    library_remove_dialog.showModal();
}

movie_grid.addEventListener("click", (event) => {
    const button = event.target.closest(".library-remove-button");
    if (!button) return;
    event.stopPropagation();
    request_remove("movie", Number(button.dataset.removeId));
});

show_grid.addEventListener("click", (event) => {
    const button = event.target.closest(".library-remove-button");
    if (!button) return;
    event.stopPropagation();
    request_remove("show", Number(button.dataset.removeId));
});

library_remove_cancel.addEventListener("click", () => {
    pending_remove = null;
    library_remove_dialog.close();
});

library_remove_form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pending_remove) return;

    const {type, id, title} = pending_remove;
    const table = type === "movie" ? "movies" : "tv_shows";

    try {
        const {error} = await supabase.from(table).delete().eq("id", id);
        if (error) throw error;

        pending_remove = null;
        library_remove_dialog.close();

        if (type === "movie") {
            await load_movie_library();
            show_entertainment_category("Movies");
        } else {
            await load_show_library();
            show_entertainment_category("TV Shows");
        }

        show_toast(`${title} removed.`);
    } catch (error) {
        console.error("Unable to remove library title:", error);
        alert("Unable to remove that title. Please try again.");
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
const movie_library_panel = document.getElementById("movie_library");
const show_library_panel = document.getElementById("show_library");

function show_entertainment_category(category) {
    const showing_movies = category === "Movies";

    movie_library_panel.classList.toggle(
        "category-panel-hidden",
        !showing_movies
    );
    show_library_panel.classList.toggle(
        "category-panel-hidden",
        showing_movies
    );

    if (showing_movies) {
        load_movie_recommendations(movie_library);
        movie_library_panel.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    } else {
        load_show_recommendations(show_library);
        show_library_panel.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}

library_cards.forEach((card) => {
    card.addEventListener("click", (event) => {
        if (card.dataset.library === "Movies" ||
            card.dataset.library === "TV Shows") {
            event.preventDefault();
            show_entertainment_category(card.dataset.library);
            return;
        }

        event.preventDefault();
        toast.textContent =
            `${card.dataset.library} library is the next page to build.`;
        toast.classList.add("show");

        clearTimeout(window.entertainment_toast_timeout);
        window.entertainment_toast_timeout = setTimeout(() => {
            toast.classList.remove("show");
        }, 1800);
    });
});
//#endregion
