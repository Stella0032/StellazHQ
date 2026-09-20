import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-functions.js";

import { auth, functions, supabase } from "../firebase/firebase_config.js";


//? ---------------------------------
//* ----- Stellaz AI Test Hook ------
//? ---------------------------------
//#region
// Temporary browser-console helper for testing the authenticated AI backend.
// Example: await test_stellaz_ai("Add The Matrix (1999)")
window.test_stellaz_ai = async (message) => {
    if (!auth.currentUser) {
        throw new Error("Log in to Stellaz before testing Stellaz AI.");
    }

    const stellaz_ai = httpsCallable(functions, "stellazAI");
    const result = await stellaz_ai({message});

    console.log("Stellaz AI result:", result.data);
    return result.data;
};
//#endregion



//? ---------------------------------
//* ----- New & Upcoming Releases ----
//? ---------------------------------
//#region
const new_release_title = document.getElementById("new_release_title");
const upcoming_release_title =
    document.getElementById("upcoming_release_title");
const new_release_grid = document.getElementById("new_release_grid");
const upcoming_release_grid =
    document.getElementById("upcoming_release_grid");

function create_release_card(item) {
    const date = item.release_date
        ? new Date(`${item.release_date}T00:00:00`).toLocaleDateString(
            undefined,
            {year: "numeric", month: "short", day: "numeric"}
        )
        : "Date TBA";
    const rating = item.rating
        ? ` · ⭐ ${Number(item.rating).toFixed(1)}`
        : "";

    return `
        <article class="recommendation-card release-card">
            <div class="recommendation-poster-wrap">
                <img class="recommendation-poster"
                     src="${item.poster_url}"
                     alt="${item.title} poster"
                     loading="lazy">
            </div>
            <h3 title="${item.title}">${item.title}</h3>
            <p>${date}${rating}</p>
        </article>
    `;
}

async function load_release_rows(type) {
    const labels = type === "show"
        ? ["Newly Released TV Shows", "Upcoming TV Releases"]
        : type === "anime"
            ? ["Newly Released Anime", "Upcoming Anime Releases"]
            : ["Newly Released Movies", "Upcoming Movie Releases"];

    new_release_title.textContent = labels[0];
    upcoming_release_title.textContent = labels[1];
    new_release_grid.innerHTML =
        '<p class="recommendation-loading">Loading new releases...</p>';
    upcoming_release_grid.innerHTML =
        '<p class="recommendation-loading">Loading upcoming releases...</p>';

    try {
        const get_releases =
            httpsCallable(functions, "getEntertainmentReleases");
        const result = await get_releases({type});
        const newly_released = result.data.newly_released || [];
        const upcoming = result.data.upcoming || [];

        new_release_grid.innerHTML = newly_released.length
            ? newly_released.map(create_release_card).join("")
            : '<p class="recommendation-loading">No new releases found.</p>';

        upcoming_release_grid.innerHTML = upcoming.length
            ? upcoming.map(create_release_card).join("")
            : '<p class="recommendation-loading">No upcoming releases found.</p>';
    } catch (error) {
        console.error("Unable to load release rows:", error);
        new_release_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load new releases.</p>';
        upcoming_release_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load upcoming releases.</p>';
    }
}
//#endregion


movie_grid.addEventListener("click", (event) => {
    const open = event.target.closest("[data-library-open=\"movie\"]");
    if (!open) return;
    const movie = movie_library.find((item) =>
        item.id === Number(open.dataset.libraryOpenId));
    if (movie) open_library_details("movie", movie);
});

show_grid.addEventListener("click", (event) => {
    const open = event.target.closest("[data-library-open=\"show\"]");
    if (!open) return;
    const show = show_library.find((item) =>
        item.id === Number(open.dataset.libraryOpenId));
    if (show) open_library_details("show", show);
});

recommendation_dialog_actions.addEventListener("click", async (event) => {
    const rating = event.target.closest("[data-library-rating-type]");
    if (rating) {
        const type = rating.dataset.libraryRatingType;
        const id = Number(rating.dataset.libraryRatingId);
        const value = Number(rating.dataset.rating);
        const table = type === "movie" ? "movies" : "tv_shows";
        try {
            const {error} = await supabase.from(table)
                .update({my_rating: value}).eq("id", id);
            if (error) throw error;
            const library = type === "movie" ? movie_library : show_library;
            const item = library.find((entry) => entry.id === id);
            if (item) item.my_rating = value;
            recommendation_dialog_actions.querySelectorAll(
                '[data-library-rating-type]'
            ).forEach((button) => button.classList.toggle(
                "selected", Number(button.dataset.rating) <= value
            ));
            if (type === "movie") render_movie_library();
            else render_show_library();
        } catch (error) {
            console.error("Unable to save library rating:", error);
        }
        return;
    }

    const watched = event.target.closest("[data-library-mark-watched]");
    if (watched) {
        await mark_library_item_watched(
            watched.dataset.libraryMarkWatched,
            Number(watched.dataset.libraryMarkWatchedId),
            watched
        );
        recommendation_dialog.close();
    }
});

//? ---------------------------------
//* ----- Smart Recommendations ----
//? ---------------------------------
//#region
const recommendation_grid = document.getElementById("recommendation_grid");
const recommendation_count = document.querySelector(".recommendation-count");
const recommendation_title = document.getElementById("recommendation_title");
const recommendation_genre_filter =
    document.getElementById("recommendation_genre_filter");

const movie_genres = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
    80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
    14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
    9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
    53: "Thriller", 10752: "War", 37: "Western"
};
const show_genres = {
    10759: "Action & Adventure", 16: "Animation", 35: "Comedy",
    80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
    10762: "Kids", 9648: "Mystery", 10763: "News", 10764: "Reality",
    10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk",
    10768: "War & Politics", 37: "Western"
};

let active_recommendation_type = "movie";
let recommendation_pool = [];
let visible_recommendations = [];
let ignored_recommendation_ids = new Set();

function recommendation_id(item) {
    return Number(active_recommendation_type === "anime"
        ? item.mal_id
        : item.tmdb_id);
}

function populate_recommendation_genres() {
    if (active_recommendation_type === "anime") {
        recommendation_genre_filter.innerHTML =
            '<option value="">All genres</option>';
        recommendation_genre_filter.disabled = true;
        return;
    }

    recommendation_genre_filter.disabled = false;
    const genre_map = active_recommendation_type === "show"
        ? show_genres : movie_genres;
    const ids = [...new Set(
        recommendation_pool.flatMap((item) => item.genre_ids || [])
    )].filter((id) => genre_map[id]).sort((a, b) =>
        genre_map[a].localeCompare(genre_map[b])
    );

    recommendation_genre_filter.innerHTML =
        '<option value="">All genres</option>' +
        ids.map((id) =>
            `<option value="${id}">${genre_map[id]}</option>`
        ).join("");
}

function apply_recommendation_filter() {
    const genre_id = Number(recommendation_genre_filter.value || 0);
    const filtered = recommendation_pool.filter((item) =>
        !ignored_recommendation_ids.has(recommendation_id(item)) &&
        (!genre_id || (item.genre_ids || []).includes(genre_id))
    );
    visible_recommendations = filtered.slice(0, 7);
    render_recommendations();
}

const recommendation_dialog = document.getElementById("recommendation_dialog");
const recommendation_dialog_close = document.getElementById("recommendation_dialog_close");
const recommendation_dialog_poster = document.getElementById("recommendation_dialog_poster");
const recommendation_dialog_type = document.getElementById("recommendation_dialog_type");
const recommendation_dialog_title = document.getElementById("recommendation_dialog_title");
const recommendation_dialog_meta = document.getElementById("recommendation_dialog_meta");
const recommendation_dialog_description = document.getElementById("recommendation_dialog_description");
const recommendation_dialog_facts = document.getElementById("recommendation_dialog_facts");
const recommendation_dialog_reason = document.getElementById("recommendation_dialog_reason");
const recommendation_dialog_actions = document.getElementById("recommendation_dialog_actions");
let active_recommendation_detail = null;

function recommendation_reason(item) {
    if (active_recommendation_type === "anime") {
        return "Recommended from your MyAnimeList history";
    }
    return item.because_of?.length
        ? `Because you liked ${item.because_of.join(" and ")}`
        : `Picked from your ${active_recommendation_type} history`;
}

function create_recommendation_card(item) {
    const rating = item.tmdb_rating !== null &&
        item.tmdb_rating !== undefined
        ? ` · ⭐ ${Number(item.tmdb_rating).toFixed(1)}` : "";
    const controls = active_recommendation_type === "anime" ? "" : `
        <button class="recommendation-dismiss" type="button"
                data-rec-action="not_interested" title="Not interested"
                aria-label="Not interested in ${item.title}">×</button>
        <button class="recommendation-watch-later" type="button"
                data-rec-action="watch_later" title="Add to Watch Later"
                aria-label="Add ${item.title} to Watch Later">＋</button>`;

    return `
        <article class="recommendation-card"
                 data-recommendation-id="${recommendation_id(item)}">
            <div class="recommendation-poster-wrap">
                <button class="recommendation-open" type="button"
                        data-rec-open aria-label="View details for ${item.title}">
                    <img class="recommendation-poster" src="${item.poster_url}"
                         alt="${item.title} poster" loading="lazy">
                </button>
                ${controls}
                <button class="recommendation-refresh" type="button"
                        title="Show me something else"
                        aria-label="Replace ${item.title} with another suggestion">↻</button>
            </div>
            <button class="recommendation-title-button" type="button"
                    data-rec-open title="${item.title}">${item.title}</button>
            <p>${item.year || ""}${rating}</p>
            <p class="recommendation-reason">${recommendation_reason(item)}</p>
        </article>`;
}

function render_recommendations() {
    recommendation_count.textContent = `${visible_recommendations.length} PICKS`;
    recommendation_grid.innerHTML = visible_recommendations.length
        ? visible_recommendations.map(create_recommendation_card).join("")
        : '<p class="recommendation-loading">No recommendations match this genre right now.</p>';
}

async function load_recommendation_feedback(type) {
    ignored_recommendation_ids = new Set();
    if (type === "anime") return;

    const {data, error} = await supabase
        .from("recommendation_feedback")
        .select("tmdb_id")
        .eq("media_type", type)
        .eq("feedback", "not_interested");

    if (error) throw error;
    ignored_recommendation_ids =
        new Set((data || []).map((item) => Number(item.tmdb_id)));
}

async function finish_recommendation_load(items) {
    const library = active_recommendation_type === "movie"
        ? movie_library
        : active_recommendation_type === "show"
            ? show_library
            : [];
    recommendation_pool = items.filter((item) =>
        !library.some((entry) =>
            entry.title.toLowerCase() === item.title.toLowerCase() &&
            Number(entry.year) === Number(item.year)
        )
    );
    recommendation_genre_filter.value = "";
    await load_recommendation_feedback(active_recommendation_type);
    populate_recommendation_genres();
    apply_recommendation_filter();
}

async function load_movie_recommendations(movies) {
    active_recommendation_type = "movie";
    recommendation_title.textContent = "Recommended Movies For You";
    recommendation_grid.innerHTML =
        '<p class="recommendation-loading">Finding movies for you...</p>';
    try {
        const get_recommendations =
            httpsCallable(functions, "getMovieRecommendations");
        const watched = movies.filter((movie) => movie.status === "watched");
        const result = await get_recommendations({
            movies: watched.map((movie) => ({
                title: movie.title, year: movie.year,
                my_rating: movie.my_rating, tmdb_rating: movie.tmdb_rating
            }))
        });
        await finish_recommendation_load(result.data.recommendations || []);
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
    const watched = shows.filter((show) => show.status === "watched");
    if (!watched.length) {
        recommendation_count.textContent = "0 PICKS";
        recommendation_grid.innerHTML =
            '<p class="recommendation-loading">Add and rate some TV shows to get recommendations.</p>';
        return;
    }
    try {
        const get_recommendations =
            httpsCallable(functions, "getTVShowRecommendations");
        const result = await get_recommendations({
            shows: watched.map((show) => ({
                title: show.title, year: show.year,
                my_rating: show.my_rating, tmdb_rating: show.tmdb_rating
            }))
        });
        await finish_recommendation_load(result.data.recommendations || []);
    } catch (error) {
        console.error("Unable to load TV recommendations:", error);
        recommendation_count.textContent = "—";
        recommendation_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load TV recommendations.</p>';
    }
}

async function load_anime_recommendations(anime) {
    active_recommendation_type = "anime";
    recommendation_title.textContent = "Recommended Anime For You";
    recommendation_grid.innerHTML =
        '<p class="recommendation-loading">Finding anime for you...</p>';
    const rated = [...anime]
        .filter((item) => item.status === "completed" || item.status === "watching")
        .sort((a, b) => Number(b.my_rating || 0) - Number(a.my_rating || 0));
    const seeds = rated.slice(0, 8);
    if (!seeds.length) {
        recommendation_count.textContent = "0 PICKS";
        recommendation_grid.innerHTML =
            '<p class="recommendation-loading">Watch or rate some anime to get recommendations.</p>';
        return;
    }
    try {
        const get_recommendations =
            httpsCallable(functions, "getMALAnimeRecommendations");
        const result = await get_recommendations({
            seed_ids: seeds.map((item) => item.mal_id),
            library_ids: anime.map((item) => item.mal_id)
        });
        await finish_recommendation_load(result.data.recommendations || []);
    } catch (error) {
        console.error("Unable to load anime recommendations:", error);
        recommendation_count.textContent = "—";
        recommendation_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load anime recommendations.</p>';
    }
}


async function save_recommendation_to_library(item, status) {
    const is_movie = active_recommendation_type === "movie";
    const table = is_movie ? "movies" : "tv_shows";
    const metadata_function = httpsCallable(
        functions, is_movie ? "getMovieMetadata" : "getTVShowMetadata"
    );
    const metadata_result = await metadata_function({
        title: item.title, year: item.year
    });
    const metadata = metadata_result.data;
    const row = is_movie ? {
        title: item.title, year: item.year, status,
        poster_url: metadata.poster_url,
        genres: metadata.genres || [],
        runtime_minutes: metadata.runtime_minutes,
        tmdb_rating: metadata.tmdb_rating
    } : {
        title: item.title, year: item.year, status,
        poster_url: metadata.poster_url,
        genres: metadata.genres || [],
        average_episode_runtime_minutes:
            metadata.average_episode_runtime_minutes,
        tmdb_rating: metadata.tmdb_rating
    };

    const library = is_movie ? movie_library : show_library;
    const existing = library.find((entry) =>
        entry.title.toLowerCase() === item.title.toLowerCase() &&
        Number(entry.year) === Number(item.year)
    );

    if (existing) {
        const next_status = status === "watched" ? "watched" : existing.status;
        const {error} = await supabase.from(table)
            .update({...row, status: next_status}).eq("id", existing.id);
        if (error) throw error;
    } else {
        const {error} = await supabase.from(table).insert(row);
        if (error) throw error;
    }

    if (is_movie) await load_movie_library();
    else await load_show_library();
}

async function mark_not_interested(item) {
    const {error} = await supabase.from("recommendation_feedback").insert({
        media_type: active_recommendation_type,
        tmdb_id: Number(item.tmdb_id),
        feedback: "not_interested"
    });
    if (error) throw error;
    ignored_recommendation_ids.add(Number(item.tmdb_id));
    apply_recommendation_filter();
}


async function open_recommendation_details(item) {
    active_recommendation_detail = item;
    recommendation_dialog_poster.src = item.poster_url || "";
    recommendation_dialog_poster.alt = `${item.title} poster`;
    recommendation_dialog_type.textContent =
        active_recommendation_type === "show" ? "TV SHOW RECOMMENDATION" :
            active_recommendation_type === "anime" ? "ANIME RECOMMENDATION" :
                "MOVIE RECOMMENDATION";
    recommendation_dialog_title.textContent = item.title;
    recommendation_dialog_meta.textContent =
        `${item.year || "Year unavailable"}${item.tmdb_rating != null ?
            ` · ⭐ ${Number(item.tmdb_rating).toFixed(1)} TMDB` : ""}`;
    recommendation_dialog_description.textContent =
        item.overview || "No description available.";
    recommendation_dialog_reason.textContent = recommendation_reason(item);
    recommendation_dialog_facts.innerHTML =
        '<span>Loading full details…</span>';
    recommendation_dialog_actions.innerHTML =
        active_recommendation_type === "anime" ? "" : `
            <button type="button" class="recommendation-action primary"
                    data-dialog-action="watched">✓ I've seen it</button>
            <button type="button" class="recommendation-action"
                    data-dialog-action="watch_later">＋ Watch later</button>
            <button type="button" class="recommendation-action muted"
                    data-dialog-action="not_interested">Not interested</button>`;
    recommendation_dialog.showModal();

    if (active_recommendation_type === "anime") {
        recommendation_dialog_facts.innerHTML =
            '<span>More anime details are provided through MyAnimeList.</span>';
        return;
    }

    try {
        const metadata_function = httpsCallable(
            functions,
            active_recommendation_type === "movie"
                ? "getMovieMetadata" : "getTVShowMetadata"
        );
        const result = await metadata_function({
            title: item.title, year: item.year
        });
        const data = result.data;
        const facts = [
            data.release_date ? `Release: ${data.release_date}` : null,
            data.genres?.length ? `Genres: ${data.genres.join(", ")}` : null,
            data.runtime_minutes ? `Runtime: ${data.runtime_minutes} min` : null,
            data.average_episode_runtime_minutes
                ? `Episode runtime: ~${data.average_episode_runtime_minutes} min` : null,
            data.number_of_seasons ? `Seasons: ${data.number_of_seasons}` : null,
            data.number_of_episodes ? `Episodes: ${data.number_of_episodes}` : null,
            data.status ? `Status: ${data.status}` : null,
            data.original_title && data.original_title !== data.title
                ? `Original title: ${data.original_title}` : null,
            data.tmdb_vote_count != null
                ? `TMDB votes: ${Number(data.tmdb_vote_count).toLocaleString()}` : null
        ].filter(Boolean);
        recommendation_dialog_description.textContent =
            data.overview || item.overview || "No description available.";
        recommendation_dialog_facts.innerHTML = facts.length
            ? facts.map((fact) => `<span>${fact}</span>`).join("")
            : "<span>No additional details available.</span>";
        if (data.backdrop_url) {
            recommendation_dialog.style.setProperty(
                "--recommendation-backdrop", `url("${data.backdrop_url}")`
            );
        } else {
            recommendation_dialog.style.removeProperty("--recommendation-backdrop");
        }
    } catch (error) {
        console.error("Unable to load recommendation details:", error);
        recommendation_dialog_facts.innerHTML =
            "<span>Additional details could not be loaded.</span>";
    }
}

async function run_recommendation_action(item, action, button) {
    button.disabled = true;
    try {
        if (action === "not_interested") {
            await mark_not_interested(item);
            if (recommendation_dialog.open) recommendation_dialog.close();
            show_toast(`${item.title} won't be recommended again.`);
            return;
        }
        await save_recommendation_to_library(item, action);
        ignored_recommendation_ids.add(recommendation_id(item));
        apply_recommendation_filter();
        if (recommendation_dialog.open) recommendation_dialog.close();
        show_toast(action === "watched"
            ? `${item.title} added as watched.`
            : `${item.title} added to Watch Later.`);
    } catch (error) {
        console.error("Unable to update recommendation:", error);
        button.disabled = false;
        alert("Unable to update that recommendation. Please try again.");
    }
}

recommendation_genre_filter.addEventListener("change", apply_recommendation_filter);

recommendation_grid.addEventListener("click", async (event) => {
    const card = event.target.closest(".recommendation-card");
    if (!card) return;
    const item = recommendation_pool.find((entry) =>
        recommendation_id(entry) === Number(card.dataset.recommendationId)
    );
    if (!item) return;

    const action = event.target.closest("[data-rec-action]");
    if (action) {
        await run_recommendation_action(item, action.dataset.recAction, action);
        return;
    }

    const refresh_button = event.target.closest(".recommendation-refresh");
    if (refresh_button) {
        ignored_recommendation_ids.add(recommendation_id(item));
        apply_recommendation_filter();
        return;
    }

    if (event.target.closest("[data-rec-open]")) {
        await open_recommendation_details(item);
    }
});

recommendation_dialog_actions.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-dialog-action]");
    if (!button || !active_recommendation_detail) return;
    await run_recommendation_action(
        active_recommendation_detail,
        button.dataset.dialogAction,
        button
    );
});

recommendation_dialog_close.addEventListener("click", () =>
    recommendation_dialog.close()
);

recommendation_dialog.addEventListener("close", () => {
    active_recommendation_detail = null;
    recommendation_dialog.style.removeProperty("--recommendation-backdrop");
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
const movie_status_filter = document.getElementById("movie_status_filter");
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

    const extra_class = index >= get_collapsed_movie_count()
        ? " library-extra"
        : "";

    return `
        <article class="movie-card${extra_class}" data-library-item="movie" data-item-id="${movie.id}">
            <div class="movie-poster-wrap">
                <button class="library-detail-open" type="button" data-library-open="movie" data-library-open-id="${movie.id}" aria-label="View details for ${movie.title}">${poster}</button>
                ${movie.status === "watch_later" ? '<span class="watch-later-badge">WATCH LATER</span><button class="watch-later-complete" type="button" data-mark-watched-type="movie" data-mark-watched-id="' + movie.id + '" title="Mark as watched" aria-label="Mark ' + movie.title + ' as watched">✓</button>' : ""}
                <button class="library-remove-button" type="button" data-remove-type="movie" data-remove-id="${movie.id}" aria-label="Remove ${movie.title} from your movies" title="Remove from library">×</button>
 
            </div>
            <button class="library-title-button" type="button" data-library-open="movie" data-library-open-id="${movie.id}" title="${movie.title}">${movie.title}</button>
            <p class="movie-meta">
                ${movie.year}${tomato_rating}${audience_rating}${tmdb_rating}${personal_rating}
            </p>
        </article>
    `;
}

function library_rating_buttons(item, type) {
    const value = item.my_rating !== null ? Number(item.my_rating) : null;
    return Array.from({length: 10}, (_, index) => {
        const rating = index + 1;
        return `<button class="rating-star ${value !== null && rating <= value ? "selected" : ""}"
            type="button" data-library-rating-type="${type}"
            data-library-rating-id="${item.id}" data-rating="${rating}"
            aria-label="Rate ${item.title} ${rating} out of 10">★<span>${rating}</span></button>`;
    }).join("");
}

async function open_library_details(type, item) {
    active_recommendation_detail = null;
    recommendation_dialog_poster.src = item.poster_url || "";
    recommendation_dialog_poster.alt = `${item.title} poster`;
    recommendation_dialog_type.textContent =
        type === "movie" ? "YOUR MOVIE LIBRARY" : "YOUR TV LIBRARY";
    recommendation_dialog_title.textContent = item.title;
    recommendation_dialog_meta.textContent =
        `${item.year || "Year unavailable"}${item.tmdb_rating != null ?
            ` · ⭐ ${Number(item.tmdb_rating).toFixed(1)} TMDB` : ""}`;
    recommendation_dialog_description.textContent = "Loading description…";
    recommendation_dialog_reason.textContent =
        item.status === "watch_later" ? "Saved to Watch Later" : "In your watched library";
    recommendation_dialog_facts.innerHTML = '<span>Loading full details…</span>';
    recommendation_dialog_actions.innerHTML = `
        <div class="library-dialog-rating">
            <p>Your rating</p>
            <div class="rating-stars">${library_rating_buttons(item, type)}</div>
        </div>
        ${item.status === "watch_later" ? `<button class="recommendation-action primary"
            data-library-mark-watched="${type}" data-library-mark-watched-id="${item.id}">✓ Mark watched</button>` : ""}
    `;
    recommendation_dialog.showModal();

    try {
        const fn = httpsCallable(functions,
            type === "movie" ? "getMovieMetadata" : "getTVShowMetadata");
        const result = await fn({title: item.title, year: item.year});
        const data = result.data;
        recommendation_dialog_description.textContent =
            data.overview || "No description available.";
        const facts = [
            data.release_date ? `Release: ${data.release_date}` : null,
            data.genres?.length ? `Genres: ${data.genres.join(", ")}` : null,
            data.runtime_minutes ? `Runtime: ${data.runtime_minutes} min` : null,
            data.average_episode_runtime_minutes ? `Episode runtime: ~${data.average_episode_runtime_minutes} min` : null,
            data.number_of_seasons ? `Seasons: ${data.number_of_seasons}` : null,
            data.number_of_episodes ? `Episodes: ${data.number_of_episodes}` : null,
            data.status ? `Status: ${data.status}` : null
        ].filter(Boolean);
        recommendation_dialog_facts.innerHTML =
            facts.map((fact) => `<span>${fact}</span>`).join("") ||
            "<span>No additional details available.</span>";
        if (data.backdrop_url) recommendation_dialog.style.setProperty(
            "--recommendation-backdrop", `url("${data.backdrop_url}")`);
    } catch (error) {
        console.error("Unable to load library details:", error);
        recommendation_dialog_description.textContent =
            "Description could not be loaded.";
    }
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
    const status = movie_status_filter.value;

    const filtered_movies = movie_library.filter((movie) => {
        const matches_search = !search ||
            movie.title.toLowerCase().includes(search);
        const matches_genre = !genre ||
            (movie.genres || []).includes(genre);
        const matches_franchise = !franchise ||
            movie.franchise === franchise;
        const matches_status = !status || movie.status === status;

        return matches_search && matches_genre && matches_franchise &&
            matches_status;
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
        franchise_filter.value ||
        movie_status_filter.value;

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

        const watched_movies = movies.filter((movie) =>
            movie.status === "watched"
        );
        movie_count.textContent = watched_movies.length;

        const total_runtime_minutes = watched_movies.reduce(
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
[movie_search, genre_filter, franchise_filter, movie_status_filter, movie_sort].forEach((control) => {
    control.addEventListener("input", render_movie_library);
    control.addEventListener("change", render_movie_library);
});

movie_filter_clear.addEventListener("click", () => {
    movie_search.value = "";
    genre_filter.value = "";
    franchise_filter.value = "";
    movie_status_filter.value = "";
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
const show_watch_time = document.getElementById("show_watch_time");
const show_library_count = document.getElementById("show_library_count");
const show_grid = document.getElementById("show_grid");
const show_library_toggle = document.getElementById("show_library_toggle");
const show_search = document.getElementById("show_search");
const show_genre_filter = document.getElementById("show_genre_filter");
const show_status_filter = document.getElementById("show_status_filter");
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
    const extra_class = index >= get_collapsed_movie_count()
        ? " library-extra"
        : "";

    return `
        <article class="movie-card${extra_class}" data-library-item="show" data-item-id="${show.id}">
            <div class="movie-poster-wrap">
                <button class="library-detail-open" type="button" data-library-open="show" data-library-open-id="${show.id}" aria-label="View details for ${show.title}">${poster}</button>
                ${show.status === "watch_later" ? '<span class="watch-later-badge">WATCH LATER</span><button class="watch-later-complete" type="button" data-mark-watched-type="show" data-mark-watched-id="' + show.id + '" title="Mark as watched" aria-label="Mark ' + show.title + ' as watched">✓</button>' : ""}
                <button class="library-remove-button" type="button" data-remove-type="show" data-remove-id="${show.id}" aria-label="Remove ${show.title} from your TV shows" title="Remove from library">×</button>
 
            </div>
            <button class="show-title-button" type="button"
                    data-library-open="show" data-library-open-id="${show.id}"
                    aria-label="Open seasons for ${show.title}">
                ${show.title}
            </button>
            <p class="movie-meta">${show.year}${tmdb_rating}${personal_rating}</p>
        </article>`;
}

function get_filtered_shows() {
    const search = show_search.value.trim().toLowerCase();
    const genre = show_genre_filter.value;
    const status = show_status_filter.value;

    return show_library.filter((show) => {
        return (!search || show.title.toLowerCase().includes(search)) &&
            (!genre || (show.genres || []).includes(genre)) &&
            (!status || show.status === status);
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
    const filters_active = show_search.value.trim() ||
        show_genre_filter.value || show_status_filter.value;
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
        (show) => !show.poster_url || show.tmdb_rating === null ||
            show.average_episode_runtime_minutes === null
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
                tmdb_rating: metadata.tmdb_rating,
                average_episode_runtime_minutes:
                    metadata.average_episode_runtime_minutes
            }).eq("id", show.id);

            if (error) throw error;

            show.poster_url = metadata.poster_url;
            show.genres = metadata.genres;
            show.tmdb_rating = metadata.tmdb_rating;
            show.average_episode_runtime_minutes =
                metadata.average_episode_runtime_minutes;
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

        const watched_shows = shows.filter((show) =>
            show.status === "watched"
        );
        show_count.textContent = watched_shows.length;
        show_library_count.textContent = `${shows.length} SHOWS`;

        if (shows.length === 0) {
            show_library = [];
            show_grid.innerHTML =
                '<p class="library-loading">No TV shows added yet.</p>';
            return;
        }

        await enrich_missing_show_metadata(shows);

        const {data: watched_episodes, error: progress_error} =
            await supabase.from("tv_episode_progress")
                .select("tv_show_id, episode_number, watched")
                .eq("watched", true);

        if (progress_error) throw progress_error;

        const show_by_id = new Map(
            shows.map((show) => [show.id, show])
        );
        const total_tv_minutes = (watched_episodes || []).reduce(
            (total, episode) => {
                const show = show_by_id.get(episode.tv_show_id);
                return total +
                    (show?.average_episode_runtime_minutes || 0);
            },
            0
        );

        show_watch_time.textContent =
            `${Math.round(total_tv_minutes / 60)}h`;

        show_library = shows;
        populate_show_filters(shows);
        render_show_library();
    } catch (error) {
        console.error("Unable to load TV show library:", error);
        show_count.textContent = "Error";
        show_watch_time.textContent = "—";
        show_library_count.textContent = "ERROR";
        show_grid.innerHTML =
            '<p class="library-loading">Unable to load your TV shows.</p>';
    }
}

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
                    <button class="season-poster-action" type="button"
                            data-season-watched="${season.season_number}"
                            data-episode-count="${season.episode_count}"
                            aria-label="${watched ? "Mark season not watched" : "Mark season watched"}">
                        ${poster}
                        <span class="season-watch-overlay">
                            <span class="season-watch-check">✓</span>
                            <span>${watched ? "Watched" : "Mark watched"}</span>
                        </span>
                    </button>
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



season_grid.addEventListener("click", async (event) => {
    const watch_button = event.target.closest("[data-season-watched]");

    if (watch_button) {
        const season_number = Number(watch_button.dataset.seasonWatched);
        const episode_count = Number(watch_button.dataset.episodeCount);
        const card = watch_button.closest(".season-card");
        const watched = !card.classList.contains("watched");

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
            watch_button.querySelector(".season-watch-overlay")
                .classList.toggle("watched", watched);
            watch_button.querySelector(".season-watch-overlay span:last-child").textContent =
                watched ? "Watched" : "Mark watched";
            watch_button.setAttribute(
                "aria-label",
                watched ? "Mark season not watched" : "Mark season watched"
            );

            // Keep an already-open episode view in sync immediately.
            if (active_season_number === season_number &&
                !episode_list.hidden) {
                episode_list.querySelectorAll(".episode-card").forEach(
                    (episode_card) => {
                        episode_card.classList.toggle("watched", watched);
                        const episode_button =
                            episode_card.querySelector("[data-episode-watched]");
                        const overlay =
                            episode_button?.querySelector(".episode-watch-overlay");

                        if (overlay) {
                            overlay.innerHTML = `<span>✓</span>${
                                watched ? "Watched" : "Mark watched"
                            }`;
                        }

                        episode_button?.setAttribute(
                            "aria-label",
                            watched ?
                                "Mark episode not watched" :
                                "Mark episode watched"
                        );
                    }
                );
            }
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

show_details_dialog.addEventListener("click", (event) => {
    const bounds = show_details_dialog.getBoundingClientRect();
    const clicked_outside =
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom;

    if (clicked_outside) {
        show_details_dialog.close();
    }
});

[show_search, show_genre_filter, show_status_filter, show_sort].forEach((control) => {
    control.addEventListener("input", render_show_library);
    control.addEventListener("change", render_show_library);
});

show_filter_clear.addEventListener("click", () => {
    show_search.value = "";
    show_genre_filter.value = "";
    show_status_filter.value = "";
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
const library_add_status = document.getElementById("library_add_status");
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
    library_add_status.value = "watched";
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
    const status = library_add_status.value;

    if (!title || !Number.isInteger(year)) return;

    library_add_submit.disabled = true;
    library_add_submit.textContent = "Adding...";

    try {
        const {error} = await supabase.from(table).insert({
            title,
            year,
            status
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

async function mark_library_item_watched(type, id, button) {
    button.disabled = true;
    const table = type === "movie" ? "movies" : "tv_shows";

    try {
        const {error} = await supabase.from(table)
            .update({status: "watched"})
            .eq("id", id);
        if (error) throw error;

        if (type === "movie") {
            await load_movie_library();
        } else {
            await load_show_library();
        }

        show_toast(type === "movie"
            ? "Movie moved to Watched."
            : "TV show moved to Watched.");
    } catch (error) {
        console.error("Unable to mark title watched:", error);
        button.disabled = false;
        alert("Unable to mark that title as watched. Please try again.");
    }
}

movie_grid.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-mark-watched-type=\"movie\"]");
    if (!button) return;
    event.stopPropagation();
    await mark_library_item_watched(
        "movie",
        Number(button.dataset.markWatchedId),
        button
    );
});

show_grid.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-mark-watched-type=\"show\"]");
    if (!button) return;
    event.stopPropagation();
    await mark_library_item_watched(
        "show",
        Number(button.dataset.markWatchedId),
        button
    );
});

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



//? ---------------------------------
//* ----- MyAnimeList Connection ----
//? ---------------------------------
//#region
const mal_connect_button = document.getElementById("mal_connect_button");
const mal_connection_label = document.getElementById("mal_connection_label");
const mal_connect_title = document.getElementById("mal_connect_title");
const mal_connect_description = document.getElementById("mal_connect_description");
const anime_grid = document.getElementById("anime_grid");
const anime_sync_summary = document.getElementById("anime_sync_summary");
const anime_library_toggle = document.getElementById("anime_library_toggle");
const anime_count = document.getElementById("anime_count");
const anime_watch_time = document.getElementById("anime_watch_time");
const anime_filters = document.getElementById("anime_filters");
const anime_search = document.getElementById("anime_search");
const anime_status_filter = document.getElementById("anime_status_filter");
const anime_sort = document.getElementById("anime_sort");
const anime_filter_clear = document.getElementById("anime_filter_clear");
let anime_library = [];
let active_anime = null;
const anime_edit_dialog = document.getElementById("anime_edit_dialog");
const anime_edit_title = document.getElementById("anime_edit_title");
const anime_edit_form = document.getElementById("anime_edit_form");
const anime_edit_status = document.getElementById("anime_edit_status");
const anime_episode_picker = document.getElementById("anime_episode_picker");
const anime_edit_cover = document.getElementById("anime_edit_cover");
let selected_anime_episode = 0;
const anime_edit_score = document.getElementById("anime_edit_score");
const anime_edit_close = document.getElementById("anime_edit_close");
const anime_edit_save = document.getElementById("anime_edit_save");
const mal_connect_card = document.getElementById("mal_connect_card");
const mal_sync_header_button = document.getElementById("mal_sync_header_button");

function random_url_safe_string(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

async function load_mal_connection_status() {
    try {
        const get_status = httpsCallable(functions, "getMALConnectionStatus");
        const result = await get_status();
        if (result.data.connected) {
            mal_connection_label.textContent = "CONNECTED";
            mal_connect_title.textContent = "MyAnimeList Connected ✓";
            mal_connect_description.textContent =
                "Your MyAnimeList account is connected to this Stellaz profile.";
            mal_connect_button.textContent = "Sync MyAnimeList";
            mal_connect_button.dataset.connected = "true";
            mal_sync_header_button.hidden = false;
        }
    } catch (error) {
        console.error("Unable to check MAL connection:", error);
    }
}


function render_anime_library() {
    const search = anime_search.value.trim().toLowerCase();
    const status = anime_status_filter.value;

    let visible_anime = anime_library.filter((item) => {
        const matches_search = !search ||
            item.title.toLowerCase().includes(search);
        const matches_status = !status || item.status === status;
        return matches_search && matches_status;
    });

    if (anime_sort.value === "title-desc") {
        visible_anime.sort((a, b) => b.title.localeCompare(a.title));
    } else if (anime_sort.value === "score-desc") {
        visible_anime.sort((a, b) =>
            Number(b.my_rating || 0) - Number(a.my_rating || 0));
    } else {
        visible_anime.sort((a, b) => a.title.localeCompare(b.title));
    }

    anime_grid.classList.remove("expanded");
    anime_grid.innerHTML = visible_anime.map((item, index) => {
        const poster = item.poster_url
            ? '<img class="movie-poster" src="' + item.poster_url +
                '" alt="" loading="lazy">'
            : '<div class="movie-poster-placeholder">ANIME</div>';
        const progress = item.total_episodes
            ? item.episodes_watched + "/" + item.total_episodes + " eps"
            : item.episodes_watched + " eps";
        const mal_score = item.mal_score
            ? "MAL: " + Number(item.mal_score).toFixed(2)
            : "MAL: —";
        const personal_score = item.my_rating
            ? " · ★ " + Number(item.my_rating).toFixed(1) + "/10"
            : " · ★ —";
        const extra_class = index >= get_collapsed_movie_count()
            ? " library-extra"
            : "";

        return '<article class="movie-card anime-card' + extra_class + '">' +
            '<div class="movie-poster-wrap">' + poster +
            '</div>' +
            '<h3 class="anime-edit-title" data-anime-id="' + item.id + '" tabindex="0" role="button" title="Edit on MyAnimeList">' + item.title + '</h3><p>' +
            progress + " · " + mal_score + personal_score + '</p></article>';
    }).join("");

    const has_hidden_anime =
        visible_anime.length > get_collapsed_movie_count();
    anime_library_toggle.hidden = !has_hidden_anime;
    anime_library_toggle.textContent = "Show all anime";
}

async function load_anime_library() {
    const {data, error} = await supabase.from("anime").select("*").order("title");
    if (error) throw error;

    anime_library = data || [];
    const watched_anime =
        anime_library.filter((item) => item.status === "completed");
    const watched_ms = anime_library.reduce((total, item) => {
        const episode_ms = Number(item.average_episode_duration_ms || 0);
        const watched_episodes = Number(item.episodes_watched || 0);
        return total + (episode_ms * watched_episodes);
    }, 0);

    anime_count.textContent = watched_anime.length;
    anime_watch_time.textContent = watched_ms > 0
        ? Math.round(watched_ms / 3600) + "h"
        : "—";

    render_anime_library();

    const has_synced_anime = anime_library.length > 0;
    anime_sync_summary.hidden = !has_synced_anime;
    anime_sync_summary.textContent =
        watched_anime.length + " watched · " +
        anime_library.length + " total synced from MyAnimeList";
    anime_filters.hidden = !has_synced_anime;

    if (has_synced_anime) {
        mal_connect_card.hidden = true;
        mal_connection_label.hidden = true;
        mal_sync_header_button.hidden = false;
    }
}

function render_anime_episode_picker() {
    const total = Number(active_anime?.total_episodes || 0);

    if (total <= 0) {
        anime_episode_picker.innerHTML =
            '<p class="anime-episode-empty">Episode count unavailable.</p>';
        return;
    }

    anime_episode_picker.innerHTML = Array.from({length: total}, (_, index) => {
        const episode = index + 1;
        const watched = episode <= selected_anime_episode ? " watched" : "";
        return '<button class="anime-episode-button' + watched +
            '" type="button" data-episode="' + episode +
            '" aria-label="Watched through episode ' + episode + '">' +
            episode + '</button>';
    }).join("");
}

function open_anime_editor(anime_id) {
    active_anime = anime_library.find((item) => item.id === anime_id);
    if (!active_anime) return;

    selected_anime_episode = Number(active_anime.episodes_watched || 0);
    anime_edit_title.textContent = active_anime.title;
    anime_edit_status.value = active_anime.status;
    anime_edit_score.value = active_anime.my_rating
        ? String(Math.round(Number(active_anime.my_rating)))
        : "";
    anime_edit_cover.src = active_anime.poster_url || "";
    anime_edit_cover.hidden = !active_anime.poster_url;
    render_anime_episode_picker();
    anime_edit_dialog.showModal();
}

anime_grid.addEventListener("click", (event) => {
    const title = event.target.closest(".anime-edit-title");
    if (title) open_anime_editor(Number(title.dataset.animeId));
});

anime_grid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const title = event.target.closest(".anime-edit-title");
    if (!title) return;
    event.preventDefault();
    open_anime_editor(Number(title.dataset.animeId));
});

anime_edit_close.addEventListener("click", () => anime_edit_dialog.close());

anime_episode_picker.addEventListener("click", (event) => {
    const button = event.target.closest(".anime-episode-button");
    if (!button) return;

    const episode = Number(button.dataset.episode);
    selected_anime_episode =
        episode === selected_anime_episode ? Math.max(0, episode - 1) : episode;
    render_anime_episode_picker();
});

anime_edit_status.addEventListener("change", () => {
    if (anime_edit_status.value === "completed" &&
        active_anime?.total_episodes) {
        selected_anime_episode = active_anime.total_episodes;
        render_anime_episode_picker();
    }
});

anime_edit_form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!active_anime) return;

    anime_edit_save.disabled = true;
    anime_edit_save.textContent = "Saving...";

    try {
        const update_mal = httpsCallable(functions, "updateMALAnimeStatus");
        await update_mal({
            anime_id: active_anime.mal_id,
            status: anime_edit_status.value,
            episodes_watched: selected_anime_episode,
            total_episodes: Number(active_anime.total_episodes || 0),
            score: anime_edit_score.value === ""
                ? null
                : Number(anime_edit_score.value)
        });
        anime_edit_dialog.close();
        await sync_mal_anime();
        show_toast("Updated on MyAnimeList.");
    } catch (error) {
        console.error("Unable to update MAL anime:", error);
        alert("Unable to update this anime on MyAnimeList.");
    } finally {
        anime_edit_save.disabled = false;
        anime_edit_save.textContent = "Save to MyAnimeList";
    }
});

anime_search.addEventListener("input", render_anime_library);
anime_status_filter.addEventListener("change", render_anime_library);
anime_sort.addEventListener("change", render_anime_library);
anime_filter_clear.addEventListener("click", () => {
    anime_search.value = "";
    anime_status_filter.value = "";
    anime_sort.value = "title-asc";
    render_anime_library();
});


anime_library_toggle.addEventListener("click", () => {
    const expanded = anime_grid.classList.toggle("expanded");

    anime_library_toggle.textContent = expanded
        ? "Show less"
        : "Show all anime";

    if (!expanded) {
        anime_library_panel.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
});

async function sync_mal_anime() {
    mal_connect_button.disabled = true;
    mal_connect_button.textContent = "Syncing...";

    try {
        const sync = httpsCallable(functions, "syncMALAnimeList");
        const result = await sync();
        const anime = result.data.anime || [];

        if (anime.length > 0) {
            const rows = anime.map((item) => ({
                mal_id: item.mal_id,
                title: item.title,
                status: item.status,
                episodes_watched: item.episodes_watched,
                total_episodes: item.total_episodes,
                my_rating: item.my_rating,
                poster_url: item.poster_url,
                media_type: item.media_type,
                start_date: item.start_date,
                finish_date: item.finish_date,
                mal_updated_at: item.mal_updated_at,
                average_episode_duration_ms: item.average_episode_duration_ms,
                mal_score: item.mal_score,
                synced_at: new Date().toISOString()
            }));

            const {error} = await supabase
                .from("anime")
                .upsert(rows, {onConflict: "user_id,mal_id"});
            if (error) throw error;
        }

        await load_anime_library();
        show_toast(anime.length + " anime synced from MyAnimeList.");
    } catch (error) {
        console.error("Unable to sync MAL anime:", error);
        alert("Unable to sync your MyAnimeList anime. Please try again.");
    } finally {
        mal_connect_button.disabled = false;
        mal_connect_button.textContent = "Sync MyAnimeList";
    }
}

async function begin_mal_connection() {
    const state = random_url_safe_string(48);
    const code_verifier = random_url_safe_string(64);
    sessionStorage.setItem("mal_oauth_state", state);
    sessionStorage.setItem("mal_code_verifier", code_verifier);

    const get_url = httpsCallable(functions, "getMALAuthorizationUrl");
    const result = await get_url({state, code_verifier});
    window.location.href = result.data.authorization_url;
}

async function finish_mal_connection() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const returned_state = params.get("state");
    if (!code) return;

    const expected_state = sessionStorage.getItem("mal_oauth_state");
    const code_verifier = sessionStorage.getItem("mal_code_verifier");
    history.replaceState({}, document.title, window.location.pathname);

    if (!expected_state || returned_state !== expected_state || !code_verifier) {
        alert("MyAnimeList connection could not be verified. Please try again.");
        return;
    }

    try {
        const exchange_code =
            httpsCallable(functions, "exchangeMALAuthorizationCode");
        await exchange_code({code, code_verifier});
        sessionStorage.removeItem("mal_oauth_state");
        sessionStorage.removeItem("mal_code_verifier");
        await load_mal_connection_status();
        show_toast("MyAnimeList connected.");
        show_entertainment_category("Anime");
    } catch (error) {
        console.error("Unable to finish MAL connection:", error);
        alert("Unable to connect MyAnimeList. Please try again.");
    }
}

mal_sync_header_button.addEventListener("click", sync_mal_anime);

mal_connect_button.addEventListener("click", async () => {
    if (mal_connect_button.dataset.connected === "true") {
        await sync_mal_anime();
        return;
    }

    mal_connect_button.disabled = true;
    mal_connect_button.textContent = "Connecting...";

    try {
        await begin_mal_connection();
    } catch (error) {
        console.error("Unable to start MAL connection:", error);
        mal_connect_button.disabled = false;
        mal_connect_button.textContent = "Connect MyAnimeList";
        alert("Unable to start MyAnimeList connection.");
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
        await load_mal_connection_status();
        await load_anime_library();
        await finish_mal_connection();

        // Movies are the default visible category on first load.
        // Load its recommendations and release rows immediately instead
        // of waiting for the user to switch categories.
        load_movie_recommendations(movie_library);
        load_release_rows("movie");
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
const anime_library_panel = document.getElementById("anime_library");

function show_entertainment_category(category) {
    const showing_movies = category === "Movies";
    const showing_shows = category === "TV Shows";
    const showing_anime = category === "Anime";

    movie_library_panel.classList.toggle("category-panel-hidden", !showing_movies);
    show_library_panel.classList.toggle("category-panel-hidden", !showing_shows);
    anime_library_panel.classList.toggle("category-panel-hidden", !showing_anime);

    if (showing_movies) {
        load_movie_recommendations(movie_library);
        load_release_rows("movie");
        movie_library_panel.scrollIntoView({behavior: "smooth", block: "start"});
    } else if (showing_shows) {
        load_show_recommendations(show_library);
        load_release_rows("show");
        show_library_panel.scrollIntoView({behavior: "smooth", block: "start"});
    } else if (showing_anime) {
        load_anime_recommendations(anime_library);
        load_release_rows("anime");
        anime_library_panel.scrollIntoView({behavior: "smooth", block: "start"});
    }
}

library_cards.forEach((card) => {
    card.addEventListener("click", (event) => {
        if (card.dataset.library === "Movies" ||
            card.dataset.library === "TV Shows" ||
            card.dataset.library === "Anime") {
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


//? ----------------------------
//* ----- Stellaz AI Chat -----
//? ----------------------------
//#region
const stellaz_ai_launcher = document.getElementById("stellaz_ai_launcher");
const stellaz_ai_panel = document.getElementById("stellaz_ai_panel");
const stellaz_ai_close = document.getElementById("stellaz_ai_close");
const stellaz_ai_form = document.getElementById("stellaz_ai_form");
const stellaz_ai_input = document.getElementById("stellaz_ai_input");
const stellaz_ai_send = document.getElementById("stellaz_ai_send");
const stellaz_ai_messages = document.getElementById("stellaz_ai_messages");

function add_stellaz_ai_message(text, type, extra_class = "") {
    const message = document.createElement("div");
    message.className = `stellaz-ai-message ${type} ${extra_class}`.trim();
    message.textContent = text;
    stellaz_ai_messages.appendChild(message);
    stellaz_ai_messages.scrollTop = stellaz_ai_messages.scrollHeight;
    return message;
}

function set_stellaz_ai_open(is_open) {
    stellaz_ai_panel.hidden = !is_open;
    stellaz_ai_launcher.setAttribute("aria-expanded", String(is_open));
    if (is_open) {
        stellaz_ai_input.focus();
    }
}

stellaz_ai_launcher.addEventListener("click", () => {
    set_stellaz_ai_open(stellaz_ai_panel.hidden);
});

stellaz_ai_close.addEventListener("click", () => {
    set_stellaz_ai_open(false);
});

stellaz_ai_form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = stellaz_ai_input.value.trim();
    if (!message || !auth.currentUser) return;

    add_stellaz_ai_message(message, "user");
    stellaz_ai_input.value = "";
    stellaz_ai_input.disabled = true;
    stellaz_ai_send.disabled = true;

    const pending = add_stellaz_ai_message(
        "Working on that…",
        "assistant",
        "pending"
    );

    try {
        const stellaz_ai = httpsCallable(functions, "stellazAI");
        const result = await stellaz_ai({message});
        pending.remove();

        add_stellaz_ai_message(
            result.data?.message || "Done.",
            "assistant"
        );

        if (result.data?.success) {
            await load_movie_library();
            load_movie_recommendations(movie_library);
        }
    } catch (error) {
        console.error("Stellaz AI failed:", error);
        pending.remove();
        add_stellaz_ai_message(
            "Something went wrong. Please try again.",
            "assistant"
        );
    } finally {
        stellaz_ai_input.disabled = false;
        stellaz_ai_send.disabled = false;
        stellaz_ai_input.focus();
    }
});
//#endregion
