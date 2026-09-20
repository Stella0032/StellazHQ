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

let release_rows_type = "movie";
let release_items = [];

function release_item_id(item) {
    return Number(item.tmdb_id || item.id);
}

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
    const controls = release_rows_type === "anime" ? "" : `
        <button class="recommendation-dismiss" type="button"
                data-release-action="not_interested" title="Not interested"
                aria-label="Not interested in ${item.title}">×</button>
        <button class="recommendation-watch-later" type="button"
                data-release-action="watch_later" title="Add to Watch Later"
                aria-label="Add ${item.title} to Watch Later">＋</button>`;

    return `
        <article class="recommendation-card release-card"
                 data-release-id="${release_item_id(item)}">
            <div class="recommendation-poster-wrap">
                <button class="recommendation-open" type="button"
                        data-release-open aria-label="View details for ${item.title}">
                    <img class="recommendation-poster"
                         src="${item.poster_url}"
                         alt="${item.title} poster"
                         loading="lazy">
                </button>
                ${controls}
                <button class="recommendation-refresh" type="button"
                        data-release-next title="Show me something else"
                        aria-label="Hide ${item.title} and show the next release">↻</button>
            </div>
            <button class="recommendation-title-button" type="button"
                    data-release-open title="${item.title}">${item.title}</button>
            <p>${date}${rating}</p>
        </article>
    `;
}

async function load_release_rows(type) {
    release_rows_type = type;
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
        release_items = [...newly_released, ...upcoming];

        const mobile_release_limit =
            window.matchMedia("(max-width: 700px)").matches ? 6 : null;
        const visible_new_releases = mobile_release_limit
            ? newly_released.slice(0, mobile_release_limit)
            : newly_released;
        const visible_upcoming = mobile_release_limit
            ? upcoming.slice(0, mobile_release_limit)
            : upcoming;

        new_release_grid.innerHTML = visible_new_releases.length
            ? visible_new_releases.map(create_release_card).join("")
            : '<p class="recommendation-loading">No new releases found.</p>';

        upcoming_release_grid.innerHTML = visible_upcoming.length
            ? visible_upcoming.map(create_release_card).join("")
            : '<p class="recommendation-loading">No upcoming releases found.</p>';
    } catch (error) {
        console.error("Unable to load release rows:", error);
        new_release_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load new releases.</p>';
        upcoming_release_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load upcoming releases.</p>';
    }
}


function find_release_item(card) {
    return release_items.find((item) =>
        release_item_id(item) === Number(card.dataset.releaseId)
    );
}

async function open_release_details(item) {
    const previous_type = active_recommendation_type;
    active_recommendation_type = release_rows_type;
    await open_recommendation_details({
        ...item,
        tmdb_rating: item.tmdb_rating ?? item.rating,
        year: item.year || (item.release_date
            ? Number(item.release_date.slice(0, 4)) : null)
    });
    active_recommendation_type = release_rows_type || previous_type;
}

async function run_release_action(item, action, button) {
    const normalized = {
        ...item,
        tmdb_rating: item.tmdb_rating ?? item.rating,
        year: item.year || (item.release_date
            ? Number(item.release_date.slice(0, 4)) : null)
    };
    const previous_type = active_recommendation_type;
    active_recommendation_type = release_rows_type;
    await run_recommendation_action(normalized, action, button);
    active_recommendation_type = previous_type;
    if (action === "not_interested") {
        document.querySelectorAll(
            `[data-release-id="${release_item_id(item)}"]`
        ).forEach((card) => card.remove());
    }
}

async function handle_release_click(event) {
    const card = event.target.closest(".release-card");
    if (!card) return;
    const item = find_release_item(card);
    if (!item) return;

    const action = event.target.closest("[data-release-action]");
    if (action) {
        await run_release_action(item, action.dataset.releaseAction, action);
        return;
    }

    if (event.target.closest("[data-release-next]")) {
        card.remove();
        return;
    }

    if (event.target.closest("[data-release-open]")) {
        await open_release_details(item);
    }
}

new_release_grid.addEventListener("click", handle_release_click);
upcoming_release_grid.addEventListener("click", handle_release_click);

//#endregion


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
    const recommendation_limit =
        window.matchMedia("(max-width: 700px)").matches ? 6 : 7;
    visible_recommendations = filtered.slice(0, recommendation_limit);
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
                <button class="library-detail-open" type="button" data-library-detail-type="movie" data-library-detail-id="${movie.id}" aria-label="View details for ${movie.title}">${poster}</button>
                ${movie.status === "watch_later" ? '<span class="watch-later-badge">WATCH LATER</span><button class="watch-later-complete" type="button" data-mark-watched-type="movie" data-mark-watched-id="' + movie.id + '" title="Mark as watched" aria-label="Mark ' + movie.title + ' as watched">✓</button>' : ""}
                <button class="library-remove-button" type="button" data-remove-type="movie" data-remove-id="${movie.id}" aria-label="Remove ${movie.title} from your movies" title="Remove from library">×</button>

            </div>
            <button class="library-title-button" type="button" data-library-detail-type="movie" data-library-detail-id="${movie.id}" title="${movie.title}">${movie.title}</button>
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
            case "franchise-asc":
                return (a.franchise || "zzzz").localeCompare(
                    b.franchise || "zzzz"
                ) || (Number(b.year) || 0) - (Number(a.year) || 0) ||
                    a.title.localeCompare(b.title);
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
                return (a.franchise || "zzzz").localeCompare(
                    b.franchise || "zzzz"
                ) || (Number(b.year) || 0) - (Number(a.year) || 0) ||
                    a.title.localeCompare(b.title);
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


async function get_plex_poster_data_url(plex_thumb) {
    if (!plex_thumb) return null;
    try {
        const result = await httpsCallable(functions, "getPlexPoster")({thumb: plex_thumb});
        if (!result.data?.data) return null;
        return `data:${result.data.content_type || "image/jpeg"};base64,${result.data.data}`;
    } catch (error) {
        console.error("Unable to load Plex poster:", error);
        return null;
    }
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
            const poster_url = metadata.poster_url ||
                await get_plex_poster_data_url(movie.plex_thumb);

            const { error } = await supabase
                .from("movies")
                .update({
                    poster_url,
                    genres: metadata.genres,
                    runtime_minutes: metadata.runtime_minutes,
                    tmdb_rating: metadata.tmdb_rating
                })
                .eq("id", movie.id);

            if (error) {
                throw error;
            }

            movie.poster_url = poster_url;
            movie.genres = metadata.genres;
            movie.runtime_minutes = metadata.runtime_minutes;
            movie.tmdb_rating = metadata.tmdb_rating;

            console.log("Added TMDB metadata:", movie.title);
        } catch (error) {
            console.error("Unable to add TMDB metadata:", movie.title, error);
            const poster_url = await get_plex_poster_data_url(movie.plex_thumb);
            if (poster_url) {
                const {error: poster_error} = await supabase.from("movies")
                    .update({poster_url}).eq("id", movie.id);
                if (!poster_error) movie.poster_url = poster_url;
            }
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
    movie_sort.value = "franchise-asc";
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
const show_details_eyebrow = document.getElementById("show_details_eyebrow");
const show_details_close = document.getElementById("show_details_close");
const season_back_button = document.getElementById("season_back_button");
const anime_detail_back_button = document.getElementById("anime_detail_back_button");
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
                <button class="library-detail-open" type="button" data-library-detail-type="show" data-library-detail-id="${show.id}" aria-label="View details for ${show.title}">${poster}</button>
                ${show.status === "watch_later" ? '<span class="watch-later-badge">WATCH LATER</span><button class="watch-later-complete" type="button" data-mark-watched-type="show" data-mark-watched-id="' + show.id + '" title="Mark as watched" aria-label="Mark ' + show.title + ' as watched">✓</button>' : ""}
                <button class="library-remove-button" type="button" data-remove-type="show" data-remove-id="${show.id}" aria-label="Remove ${show.title} from your TV shows" title="Remove from library">×</button>

            </div>
            <button class="show-title-button library-title-button" type="button"
                    data-library-detail-type="show"
                    data-library-detail-id="${show.id}"
                    aria-label="View details for ${show.title}">
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
                year: show.year,
                tmdb_id: show.tmdb_id || null
            });
            const metadata = result.data;
            const poster_url = metadata.poster_url ||
                await get_plex_poster_data_url(show.plex_thumb);
            const {error} = await supabase.from("tv_shows").update({
                poster_url,
                genres: metadata.genres,
                tmdb_rating: metadata.tmdb_rating,
                average_episode_runtime_minutes:
                    metadata.average_episode_runtime_minutes
            }).eq("id", show.id);

            if (error) throw error;

            show.poster_url = poster_url;
            show.genres = metadata.genres;
            show.tmdb_rating = metadata.tmdb_rating;
            show.average_episode_runtime_minutes =
                metadata.average_episode_runtime_minutes;
        } catch (error) {
            console.error("Unable to add TV metadata:", show.title, error);
            const poster_url = await get_plex_poster_data_url(show.plex_thumb);
            if (poster_url) {
                const {error: poster_error} = await supabase.from("tv_shows")
                    .update({poster_url}).eq("id", show.id);
                if (!poster_error) show.poster_url = poster_url;
            }
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

async function open_show_seasons(show, media_label = "TV SHOW") {
    active_show_id = show.id ?? null;
    show_details_eyebrow.textContent = media_label;
    show_details_title.textContent = show.title;
    season_grid.innerHTML =
        '<p class="library-loading">Loading seasons...</p>';
    episode_list.hidden = true;
    season_grid.hidden = false;
    season_back_button.hidden = true;
    anime_detail_back_button.hidden = media_label !== "ANIME";
    show_details_dialog.showModal();

    try {
        const get_seasons = httpsCallable(functions, "getTVShowSeasons");
        const result = await get_seasons({
            title: show.title,
            year: show.year
        });

        active_show_tmdb_id = result.data.tmdb_id;
        active_show_title = result.data.title;

        let progress = [];
        if (active_show_id !== null) {
            const {data, error: progress_error} = await supabase
                .from("tv_season_progress")
                .select("season_number, watched")
                .eq("tv_show_id", active_show_id);
            if (progress_error) throw progress_error;
            progress = data || [];
        }

        season_watch_progress = new Map(
            progress.map((item) => [item.season_number, item.watched])
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
                            ${active_show_id !== null ? `
                                data-season-watched="${season.season_number}"
                                data-episode-count="${season.episode_count}"
                                aria-label="${watched ? "Mark season not watched" : "Mark season watched"}"
                            ` : `
                                data-season-open="${season.season_number}"
                                aria-label="View ${season.name} episodes"
                            `}>
                        ${poster}
                        ${active_show_id !== null ? `
                            <span class="season-watch-overlay">
                                <span class="season-watch-check">✓</span>
                                <span>${watched ? "Watched" : "Mark watched"}</span>
                            </span>
                        ` : ""}
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
            ?.addEventListener("click", () => open_show_seasons(show, media_label));
    }
}

async function open_season_episodes(season_number) {
    active_season_number = season_number;
    season_grid.hidden = true;
    episode_list.hidden = false;
    season_back_button.hidden = false;
    anime_detail_back_button.hidden = true;
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

        let episode_progress = [];
        if (active_show_id !== null) {
            const {data, error: episode_progress_error} =
                await supabase.from("tv_episode_progress")
                    .select("episode_number, watched")
                    .eq("tv_show_id", active_show_id)
                    .eq("season_number", season_number);
            if (episode_progress_error) throw episode_progress_error;
            episode_progress = data || [];
        }

        const watched_episodes = new Map(
            episode_progress.map(
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
                    <div class="episode-watch-image">
                        ${still}
                        ${active_show_id !== null ? `
                            <span class="episode-watch-overlay">
                                <span>✓</span>
                                ${watched ? "Watched" : "Mark watched"}
                            </span>
                        ` : ""}
                    </div>
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
        event.target.closest(".library-remove-button") ||
        event.target.closest(".watch-later-complete")) {
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
        if (active_show_id === null) return;
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
    if (!button || active_show_id === null) return;

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

anime_detail_back_button.addEventListener("click", () => {
    show_details_dialog.close();
    anime_edit_dialog.showModal();
});

season_back_button.addEventListener("click", () => {
    show_details_title.textContent = active_show_title;
    episode_list.hidden = true;
    season_grid.hidden = false;
    season_back_button.hidden = true;
    anime_detail_back_button.hidden = show_details_eyebrow.textContent !== "ANIME";
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


//? ----------------------------------
//* ----- Library Detail Overlay -----
//? ----------------------------------
//#region
let active_library_detail = null;

function render_library_detail_rating(item, type) {
    const value = item.my_rating !== null ? Number(item.my_rating) : null;

    return Array.from({length: 10}, (_, index) => {
        const rating = index + 1;
        const selected = value !== null && rating <= value;

        return `
            <button class="rating-star ${selected ? "selected" : ""}"
                    type="button"
                    data-library-dialog-rating="${type}"
                    data-library-dialog-id="${item.id}"
                    data-rating="${rating}"
                    aria-label="Rate ${item.title} ${rating} out of 10">
                ★<span>${rating}</span>
            </button>`;
    }).join("");
}

async function open_library_detail(type, item) {
    active_library_detail = {type, item};
    active_recommendation_detail = null;

    recommendation_dialog_poster.src = item.poster_url || "";
    recommendation_dialog_poster.alt = `${item.title} poster`;
    recommendation_dialog_type.textContent =
        type === "movie" ? "YOUR MOVIE LIBRARY" : "YOUR TV LIBRARY";
    recommendation_dialog_title.textContent = item.title;
    recommendation_dialog_meta.textContent =
        `${item.year || "Year unavailable"}${item.tmdb_rating != null ?
            ` · ⭐ ${Number(item.tmdb_rating).toFixed(1)} TMDB` : ""}`;
    let saved_plex_metadata = get_saved_plex_metadata(type, item);
    if (saved_plex_metadata && !item.tmdb_id) {
        render_saved_library_details(type, item, saved_plex_metadata);
        get_plex_poster_data_url(item.plex_thumb || saved_plex_metadata.plex_thumb)
            .then((poster_url) => {
                if (poster_url && active_library_detail?.item.id === item.id) {
                    recommendation_dialog_poster.src = poster_url;
                }
            });
    } else {
        recommendation_dialog_description.textContent = "Loading description…";
        recommendation_dialog_facts.innerHTML =
            '<span>Loading full details…</span>';
    }
    recommendation_dialog_reason.textContent =
        item.status === "watch_later"
            ? "Saved to Watch Later"
            : "In your watched library";
    recommendation_dialog_actions.innerHTML = `
        <div class="library-dialog-rating">
            <p>Your rating</p>
            <div class="rating-stars">
                ${render_library_detail_rating(item, type)}
            </div>
        </div>
        ${item.status === "watch_later" ? `
            <button class="recommendation-action primary" type="button"
                    data-library-dialog-watched="${type}"
                    data-library-dialog-id="${item.id}">
                ✓ Mark watched
            </button>` : ""}
        ${type === "show" ? `
            <button class="recommendation-action" type="button"
                    data-library-dialog-seasons="${item.id}">
                View seasons & episodes
            </button>` : ""}
    `;

    recommendation_dialog.showModal();

    if (!item.tmdb_id && !saved_plex_metadata) {
        saved_plex_metadata = await ensure_plex_metadata_for_item(type, item);
        if (saved_plex_metadata) {
            render_saved_library_details(type, item, saved_plex_metadata);
            return;
        }
    }

    try {
        if (saved_plex_metadata && !item.tmdb_id) {
            return;
        }
        const metadata_function = httpsCallable(
            functions,
            type === "movie" ? "getMovieMetadata" : "getTVShowMetadata"
        );
        const result = await metadata_function({
            title: item.title,
            year: item.year,
            ...(type === "show" && item.tmdb_id ? {tmdb_id: item.tmdb_id} : {})
        });
        const data = result.data;

        if (!active_library_detail ||
            active_library_detail.item.id !== item.id ||
            active_library_detail.type !== type) {
            return;
        }

        recommendation_dialog_description.textContent =
            data.overview || "No description available.";

        const facts = [
            data.release_date ? `Release: ${data.release_date}` : null,
            data.genres?.length ? `Genres: ${data.genres.join(", ")}` : null,
            data.runtime_minutes ?
                `Runtime: ${data.runtime_minutes} min` : null,
            data.average_episode_runtime_minutes ?
                `Episode runtime: ~${data.average_episode_runtime_minutes} min` :
                null,
            data.number_of_seasons ?
                `Seasons: ${data.number_of_seasons}` : null,
            data.number_of_episodes ?
                `Episodes: ${data.number_of_episodes}` : null,
            data.status ? `Status: ${data.status}` : null,
            data.original_title && data.original_title !== data.title ?
                `Original title: ${data.original_title}` : null
        ].filter(Boolean);

        recommendation_dialog_facts.innerHTML = facts.length
            ? facts.map((fact) => `<span>${fact}</span>`).join("")
            : "<span>No additional details available.</span>";

        if (data.backdrop_url) {
            recommendation_dialog.style.setProperty(
                "--recommendation-backdrop",
                `url("${data.backdrop_url}")`
            );
        }
    } catch (error) {
        console.error("Unable to load library details from TMDB:", error);
        try {
            let plex_item = get_saved_plex_metadata(type, item);
            if (!plex_item) {
                const plex_result = await httpsCallable(functions, "getPlexMetadataFallback")({
                    title: item.title, year: item.year, type
                });
                plex_item = plex_result.data || {};
            }
            const poster_url = item.poster_url ||
                await get_plex_poster_data_url(item.plex_thumb || plex_item.plex_thumb);
            if (poster_url) recommendation_dialog_poster.src = poster_url;
            render_saved_library_details(type, item, plex_item);
        } catch (plex_error) {
            console.error("Unable to load library details from Plex:", plex_error);
            recommendation_dialog_description.textContent = "No description available.";
            recommendation_dialog_facts.innerHTML =
                "<span>No additional details available.</span>";
        }
    }
}

movie_grid.addEventListener("click", (event) => {
    const open_button = event.target.closest(
        '[data-library-detail-type="movie"]'
    );
    if (!open_button) return;

    const movie = movie_library.find(
        (item) => item.id === Number(open_button.dataset.libraryDetailId)
    );
    if (movie) open_library_detail("movie", movie);
});

show_grid.addEventListener("click", (event) => {
    const open_button = event.target.closest(
        '[data-library-detail-type="show"]'
    );
    if (!open_button) return;

    const show = show_library.find(
        (item) => item.id === Number(open_button.dataset.libraryDetailId)
    );
    if (show) open_library_detail("show", show);
});

recommendation_dialog_actions.addEventListener("click", async (event) => {
    if (!active_library_detail) return;

    const rating_button = event.target.closest("[data-library-dialog-rating]");
    if (rating_button) {
        const type = rating_button.dataset.libraryDialogRating;
        const id = Number(rating_button.dataset.libraryDialogId);
        const rating = Number(rating_button.dataset.rating);
        const table = type === "movie" ? "movies" : "tv_shows";

        try {
            const {error} = await supabase
                .from(table)
                .update({my_rating: rating})
                .eq("id", id);
            if (error) throw error;

            const library = type === "movie" ? movie_library : show_library;
            const item = library.find((entry) => entry.id === id);
            if (item) item.my_rating = rating;

            recommendation_dialog_actions
                .querySelectorAll("[data-library-dialog-rating]")
                .forEach((button) => {
                    button.classList.toggle(
                        "selected",
                        Number(button.dataset.rating) <= rating
                    );
                });

            if (type === "movie") render_movie_library();
            else render_show_library();
        } catch (error) {
            console.error("Unable to save library rating:", error);
            alert("Unable to save your rating. Please try again.");
        }
        return;
    }

    const watched_button = event.target.closest(
        "[data-library-dialog-watched]"
    );
    if (watched_button) {
        await mark_library_item_watched(
            watched_button.dataset.libraryDialogWatched,
            Number(watched_button.dataset.libraryDialogId),
            watched_button
        );
        recommendation_dialog.close();
        return;
    }

    const seasons_button = event.target.closest(
        "[data-library-dialog-seasons]"
    );
    if (seasons_button && active_library_detail.type === "show") {
        const show = active_library_detail.item;
        recommendation_dialog.close();
        open_show_seasons(show);
    }
});

recommendation_dialog.addEventListener("close", () => {
    active_library_detail = null;
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
        const {data: added_item, error} = await supabase.from(table)
            .insert({title, year, status})
            .select()
            .single();

        if (error) {
            if (error.code === "23505") {
                throw new Error("That title is already in your library.");
            }
            throw error;
        }

        // A newly added watched TV series starts fully watched by default.
        // Populate season + episode progress so every existing entry is checked.
        if (!is_movie && status === "watched" && added_item?.id) {
            const get_seasons = httpsCallable(functions, "getTVShowSeasons");
            const result = await get_seasons({title, year});
            const seasons = (result.data.seasons || []).filter(
                (season) => Number(season.season_number) > 0
            );

            if (seasons.length) {
                const season_rows = seasons.map((season) => ({
                    tv_show_id: added_item.id,
                    season_number: Number(season.season_number),
                    watched: true
                }));
                const episode_rows = seasons.flatMap((season) =>
                    Array.from(
                        {length: Number(season.episode_count || 0)},
                        (_, index) => ({
                            tv_show_id: added_item.id,
                            season_number: Number(season.season_number),
                            episode_number: index + 1,
                            watched: true
                        })
                    )
                );

                const {error: season_error} = await supabase
                    .from("tv_season_progress")
                    .upsert(season_rows, {
                        onConflict: "user_id,tv_show_id,season_number"
                    });
                if (season_error) throw season_error;

                if (episode_rows.length) {
                    const {error: episode_error} = await supabase
                        .from("tv_episode_progress")
                        .upsert(episode_rows, {
                            onConflict:
                                "user_id,tv_show_id,season_number,episode_number"
                        });
                    if (episode_error) throw episode_error;
                }
            }
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
const anime_detail_meta = document.getElementById("anime_detail_meta");
const anime_detail_description = document.getElementById("anime_detail_description");
const anime_detail_facts = document.getElementById("anime_detail_facts");
const anime_edit_form = document.getElementById("anime_edit_form");
const anime_edit_status = document.getElementById("anime_edit_status");
const anime_episode_picker = document.getElementById("anime_episode_picker");
const anime_edit_cover = document.getElementById("anime_edit_cover");
let selected_anime_episode = 0;
const anime_edit_score = document.getElementById("anime_edit_score");
const anime_edit_close = document.getElementById("anime_edit_close");
const anime_edit_save = document.getElementById("anime_edit_save");
const anime_view_seasons = document.getElementById("anime_view_seasons");
const mal_connect_card = document.getElementById("mal_connect_card");
const mal_sync_header_button = document.getElementById("mal_sync_header_button");
const anime_add_button = document.getElementById("anime_add_button");
const anime_add_dialog = document.getElementById("anime_add_dialog");
const anime_add_close = document.getElementById("anime_add_close");
const anime_add_search_form = document.getElementById("anime_add_search_form");
const anime_add_search = document.getElementById("anime_add_search");
const anime_add_results = document.getElementById("anime_add_results");
let anime_add_candidates = [];

if (anime_add_button && anime_add_dialog && anime_add_close &&
    anime_add_search_form && anime_add_search && anime_add_results) {
    anime_add_button.addEventListener("click", () => {
        anime_add_search.value = "";
        anime_add_results.innerHTML = "";
        anime_add_candidates = [];
        anime_add_dialog.showModal();
        anime_add_search.focus();
    });

    anime_add_close.addEventListener("click", () => anime_add_dialog.close());

    anime_add_search_form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const query = anime_add_search.value.trim();
        if (query.length < 2) return;

        anime_add_results.innerHTML =
            '<p class="recommendation-loading">Searching MyAnimeList...</p>';

        try {
            const search_mal = httpsCallable(functions, "searchMALAnime");
            const result = await search_mal({query});
            anime_add_candidates = result.data.results || [];
            anime_add_results.innerHTML = anime_add_candidates.length
                ? anime_add_candidates.map((item) => `
                    <button class="anime-add-result" type="button"
                            data-mal-add-id="${item.mal_id}">
                        ${item.poster_url ? `<img src="${item.poster_url}" alt="">` : ""}
                        <span><strong>${item.title}</strong><small>${
                            item.start_date ? item.start_date.slice(0, 4) : ""
                        }${item.mal_score ? ` · ⭐ ${Number(item.mal_score).toFixed(2)}` : ""}</small></span>
                        <b>＋ Watched</b>
                    </button>`).join("")
                : '<p class="recommendation-loading">No anime found.</p>';
        } catch (error) {
            console.error("Unable to search MAL:", error);
            anime_add_results.innerHTML =
                '<p class="recommendation-loading">Unable to search MyAnimeList.</p>';
        }
    });

    anime_add_results.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-mal-add-id]");
        if (!button) return;

        const item = anime_add_candidates.find(
            (entry) => entry.mal_id === Number(button.dataset.malAddId)
        );
        if (!item) return;

        button.disabled = true;
        try {
            const update_mal =
                httpsCallable(functions, "updateMALAnimeStatus");
            const result = await update_mal({
                anime_id: item.mal_id,
                status: "completed",
                episodes_watched: Number(item.total_episodes || 0),
                total_episodes: Number(item.total_episodes || 0),
                score: null
            });
            if (result.data?.status !== "completed") {
                throw new Error("MyAnimeList did not save completed status.");
            }
            anime_add_dialog.close();
            await sync_mal_anime();
            show_toast(`${item.title} added to MyAnimeList as watched.`);
        } catch (error) {
            console.error("Unable to add MAL anime:", error);
            alert("Unable to add this anime to MyAnimeList.");
            button.disabled = false;
        }
    });
}

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
            document.getElementById("mal_connection_badge")?.removeAttribute("hidden");
            mal_connect_card.hidden = true;
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
            '<div class="movie-poster-wrap anime-edit-poster" data-anime-id="' +
            item.id + '" tabindex="0" role="button" title="Edit on MyAnimeList">' +
            poster + '</div>' +
            '<h3 class="anime-edit-title" data-anime-id="' + item.id + '" tabindex="0" role="button" title="Edit on MyAnimeList">' + item.title + '</h3><p>' +
            progress + " · " + mal_score + personal_score + '</p></article>';
    }).join("");

    const has_hidden_anime =
        visible_anime.length > get_collapsed_movie_count();
    anime_library_toggle.hidden = !has_hidden_anime;
    anime_library_toggle.textContent = "Show all anime";
}

let anime_background_timer = null;
let anime_background_posters = [];
let current_anime_background = "";
let anime_background_layer = 0;

function preload_anime_background(url) {
    const image = new Image();
    image.src = url;
}

function rotate_anime_library_background() {
    if (!anime_background_posters.length) {
        [
            "--anime-library-backdrop-1-left",
            "--anime-library-backdrop-1-right",
            "--anime-library-backdrop-2-left",
            "--anime-library-backdrop-2-right"
        ].forEach((property) =>
            document.documentElement.style.removeProperty(property)
        );
        return;
    }

    const alternatives = anime_background_posters.filter(
        (poster) => poster !== current_anime_background
    );
    const pool = alternatives.length ? alternatives : anime_background_posters;
    const left = pool[Math.floor(Math.random() * pool.length)];
    const right_pool = anime_background_posters.filter(
        (poster) => poster !== left
    );
    const right = right_pool.length
        ? right_pool[Math.floor(Math.random() * right_pool.length)]
        : left;

    current_anime_background = left;
    preload_anime_background(left);
    preload_anime_background(right);
    anime_background_layer = anime_background_layer === 1 ? 2 : 1;

    document.documentElement.style.setProperty(
        `--anime-library-backdrop-${anime_background_layer}-left`,
        `url("${left}")`
    );
    document.documentElement.style.setProperty(
        `--anime-library-backdrop-${anime_background_layer}-right`,
        `url("${right}")`
    );
    document.documentElement.style.setProperty(
        `--anime-card-backdrop-${anime_background_layer}`,
        `url("${left}")`
    );
    document.documentElement.style.setProperty(
        "--anime-library-backdrop-layer",
        String(anime_background_layer)
    );
}

async function start_anime_library_backgrounds() {
    clearInterval(anime_background_timer);

    const top_anime = anime_library
        .filter((item) => item.poster_url && Number(item.my_rating || 0) > 0)
        .sort((a, b) => Number(b.my_rating || 0) - Number(a.my_rating || 0))
        .slice(0, 10);

    const get_anime_backdrop = httpsCallable(functions, "getAnimeBackdrop");
    const resolved_backgrounds = await Promise.all(top_anime.map(async (item) => {
        try {
            const result = await get_anime_backdrop({title: item.title});
            return result.data?.backdrop_url || item.poster_url;
        } catch (error) {
            console.warn("Unable to load HD anime backdrop:", item.title, error);
            return item.poster_url;
        }
    }));

    anime_background_posters = resolved_backgrounds.filter(Boolean);
    anime_background_posters.forEach(preload_anime_background);

    current_anime_background = "";
    rotate_anime_library_background();

    if (anime_background_posters.length > 1) {
        anime_background_timer = setInterval(
            rotate_anime_library_background,
            15000
        );
    }
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
    await start_anime_library_backgrounds();

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

async function open_anime_editor(anime_id) {
    active_anime = anime_library.find((item) => item.id === anime_id);
    if (!active_anime) return;

    const opened_anime_id = active_anime.id;
    selected_anime_episode = Number(active_anime.episodes_watched || 0);
    anime_edit_title.textContent = active_anime.title;
    anime_edit_status.value = active_anime.status;
    anime_edit_score.value = active_anime.my_rating
        ? String(Math.round(Number(active_anime.my_rating)))
        : "";
    anime_edit_cover.src = active_anime.poster_url || "";
    anime_edit_cover.hidden = !active_anime.poster_url;
    anime_edit_dialog.style.setProperty(
        "--anime-backdrop",
        active_anime.poster_url
            ? `url("${active_anime.poster_url}")`
            : "none"
    );

    const media_type = active_anime.media_type
        ? active_anime.media_type.replaceAll("_", " ").toUpperCase()
        : "ANIME";
    anime_detail_meta.textContent =
        `${media_type}${active_anime.mal_score ?
            ` · ⭐ ${Number(active_anime.mal_score).toFixed(2)} MAL` : ""}`;
    anime_detail_description.textContent = "Loading description…";
    anime_detail_facts.innerHTML = [
        active_anime.total_episodes ?
            `Episodes: ${active_anime.total_episodes}` : null,
        active_anime.average_episode_duration_ms ?
            `Episode runtime: ~${Math.round(
                Number(active_anime.average_episode_duration_ms) / 60
            )} min` : null,
        active_anime.start_date ? `Started: ${active_anime.start_date}` : null,
        active_anime.finish_date ? `Finished: ${active_anime.finish_date}` : null
    ].filter(Boolean).map((fact) => `<span>${fact}</span>`).join("");

    render_anime_episode_picker();
    anime_edit_dialog.showModal();

    try {
        const get_details = httpsCallable(functions, "getMALAnimeDetails");
        const result = await get_details({anime_id: active_anime.mal_id});
        if (!active_anime || active_anime.id !== opened_anime_id) return;

        const data = result.data;
        anime_detail_description.textContent =
            data.synopsis || "No description available.";
        const facts = [
            data.media_type ? `Type: ${data.media_type}` : null,
            data.num_episodes ? `Episodes: ${data.num_episodes}` : null,
            data.average_episode_duration ?
                `Episode runtime: ~${Math.round(
                    data.average_episode_duration / 60
                )} min` : null,
            data.start_date ? `Aired: ${data.start_date}` : null,
            data.end_date ? `Ended: ${data.end_date}` : null,
            data.status ? `Status: ${data.status.replaceAll("_", " ")}` : null,
            data.source ? `Source: ${data.source.replaceAll("_", " ")}` : null,
            data.rating ? `Rating: ${data.rating.replaceAll("_", " ")}` : null,
            data.genres?.length ? `Genres: ${data.genres.join(", ")}` : null,
            data.studios?.length ? `Studios: ${data.studios.join(", ")}` : null,
            data.mean ? `MAL score: ${Number(data.mean).toFixed(2)}` : null,
            data.rank ? `Rank: #${data.rank}` : null,
            data.popularity ? `Popularity: #${data.popularity}` : null
        ].filter(Boolean);
        anime_detail_facts.innerHTML =
            facts.map((fact) => `<span>${fact}</span>`).join("");
    } catch (error) {
        console.error("Unable to load anime details:", error);
        anime_detail_description.textContent =
            "Additional anime details could not be loaded.";
    }
}

anime_grid.addEventListener("click", (event) => {
    const trigger = event.target.closest(
        ".anime-edit-title, .anime-edit-poster"
    );
    if (trigger) open_anime_editor(Number(trigger.dataset.animeId));
});

anime_grid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const trigger = event.target.closest(
        ".anime-edit-title, .anime-edit-poster"
    );
    if (!trigger) return;
    event.preventDefault();
    open_anime_editor(Number(trigger.dataset.animeId));
});

anime_edit_close.addEventListener("click", () => anime_edit_dialog.close());

anime_view_seasons.addEventListener("click", () => {
    if (!active_anime) return;

    const year = active_anime.start_date
        ? Number(String(active_anime.start_date).slice(0, 4))
        : undefined;

    anime_edit_dialog.close();
    open_show_seasons({
        id: null,
        title: active_anime.title,
        year
    }, "ANIME");
});

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
        const result = await update_mal({
            anime_id: active_anime.mal_id,
            status: anime_edit_status.value,
            episodes_watched: selected_anime_episode,
            total_episodes: Number(active_anime.total_episodes || 0),
            score: anime_edit_score.value === ""
                ? null
                : Number(anime_edit_score.value)
        });
        if (result.data?.status !== anime_edit_status.value) {
            throw new Error("MyAnimeList did not save the selected status.");
        }
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
    anime_sort.value = "score-desc";
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

//? ------------------------------
//* ----- Plex Connection --------
//? ------------------------------
//#region
const plex_connect_title = document.getElementById("plex_connect_title");
const plex_connect_description = document.getElementById("plex_connect_description");
const plex_connect_button = document.getElementById("plex_connect_button");

async function load_plex_connection_status() {
    if (!plex_connect_button) return;
    try {
        const result = await httpsCallable(functions, "getPlexConnectionStatus")();
        if (result.data.connected) {
            document.getElementById("plex_connection_badge")?.removeAttribute("hidden");
            document.getElementById("plex_import_button")?.removeAttribute("hidden");
            document.querySelector(".plex-import-button-tv")?.removeAttribute("hidden");
            sync_plex_metadata_for_library().catch((error) =>
                console.error("Unable to sync Plex library metadata:", error)
            );
            const plex_card = document.getElementById("plex_connect_card");
            if (plex_card) plex_card.hidden = true;
            plex_connect_title.textContent = "Plex Connected ✓";
            plex_connect_description.textContent =
                "Connected as " + result.data.username + ". Rating import comes next.";
            plex_connect_button.textContent = "Plex Connected";
            plex_connect_button.disabled = true;
        }
    } catch (error) { console.error("Unable to check Plex connection:", error); }
}


const plex_import_button = document.getElementById("plex_import_button");
const plex_import_dialog = document.getElementById("plex_import_dialog");
const plex_import_close = document.getElementById("plex_import_close");
const plex_import_summary = document.getElementById("plex_import_summary");
const plex_import_stats = document.getElementById("plex_import_stats");
const plex_import_confirm = document.getElementById("plex_import_confirm");
let plex_import_preview = null;

function same_library_title(a, b) {
    return String(a.title || "").trim().toLowerCase() === String(b.title || "").trim().toLowerCase() &&
        (!a.year || !b.year || Number(a.year) === Number(b.year));
}

function plex_metadata_key(type, item) {
    return `${type}:${String(item.title || "").trim().toLowerCase()}:${Number(item.year) || ""}`;
}

function read_plex_metadata_store() {
    try {
        return JSON.parse(localStorage.getItem("stellaz_plex_metadata_store") || "{}");
    } catch (_) {
        return {};
    }
}

function save_plex_metadata_store(data) {
    const store = read_plex_metadata_store();
    for (const item of data.movies || []) store[plex_metadata_key("movie", item)] = item;
    for (const item of data.shows || []) store[plex_metadata_key("show", item)] = item;
    localStorage.setItem("stellaz_plex_metadata_store", JSON.stringify(store));
}

function get_saved_plex_metadata(type, item) {
    return read_plex_metadata_store()[plex_metadata_key(type, item)] || null;
}

function render_saved_library_details(type, item, data) {
    if (!data) return false;
    recommendation_dialog_description.textContent =
        data.overview || "No description available.";
    const facts = [
        data.release_date ? `Release: ${data.release_date}` : null,
        data.genres?.length ? `Genres: ${data.genres.join(", ")}` : null,
        data.runtime_minutes ? `Runtime: ${data.runtime_minutes} min` : null,
        data.average_episode_runtime_minutes ?
            `Episode runtime: ~${data.average_episode_runtime_minutes} min` : null,
        (data.number_of_episodes || data.total_episodes) ?
            `Episodes: ${data.number_of_episodes || data.total_episodes}` : null,
        data.content_rating ? `Content rating: ${data.content_rating}` : null,
        data.studio ? `Studio: ${data.studio}` : null,
        data.original_title && data.original_title !== item.title ?
            `Original title: ${data.original_title}` : null
    ].filter(Boolean);
    recommendation_dialog_facts.innerHTML = facts.length
        ? facts.map((fact) => `<span>${fact}</span>`).join("")
        : "<span>No additional details available.</span>";
    return true;
}

let plex_library_metadata_sync = null;

async function sync_plex_metadata_for_library(force = false) {
    if (plex_library_metadata_sync && !force) return plex_library_metadata_sync;

    plex_library_metadata_sync = (async () => {
        const result = await httpsCallable(functions, "getPlexImportPreview")();
        const data = result.data || {};
        save_plex_metadata_store(data);

        const movie_by_key = new Map(
            (data.movies || []).map((item) => [plex_metadata_key("movie", item), item])
        );
        const show_by_key = new Map(
            (data.shows || []).map((item) => [plex_metadata_key("show", item), item])
        );

        for (const movie of movie_library) {
            const plex = movie_by_key.get(plex_metadata_key("movie", movie));
            if (!plex) continue;
            movie.plex_thumb = plex.plex_thumb || movie.plex_thumb;
        }
        for (const show of show_library) {
            const plex = show_by_key.get(plex_metadata_key("show", show));
            if (!plex) continue;
            show.plex_thumb = plex.plex_thumb || show.plex_thumb;
        }

        // Cache missing Plex posters in Supabase before the user opens a card.
        // Once saved in poster_url they behave exactly like the existing TMDB
        // posters: library cards and overlays can use them immediately.
        const cache_missing_posters = async (library, table, plex_by_key, type) => {
            const missing = library.filter((item) => !item.poster_url);
            for (const item of missing) {
                const plex = plex_by_key.get(plex_metadata_key(type, item));
                const thumb = item.plex_thumb || plex?.plex_thumb;
                if (!thumb) continue;
                const poster_url = await get_plex_poster_data_url(thumb);
                if (!poster_url) continue;
                const {error} = await supabase.from(table)
                    .update({poster_url}).eq("id", item.id);
                if (error) {
                    console.error("Unable to cache Plex poster:", item.title, error);
                    continue;
                }
                item.poster_url = poster_url;
            }
        };

        await cache_missing_posters(movie_library, "movies", movie_by_key, "movie");
        await cache_missing_posters(show_library, "tv_shows", show_by_key, "show");
        render_movie_library();
        render_show_library();
        return data;
    })();

    try {
        return await plex_library_metadata_sync;
    } finally {
        plex_library_metadata_sync = null;
    }
}

async function ensure_plex_metadata_for_item(type, item) {
    let saved = get_saved_plex_metadata(type, item);
    if (saved) return saved;
    try {
        await sync_plex_metadata_for_library();
        saved = get_saved_plex_metadata(type, item);
    } catch (error) {
        console.error("Unable to refresh Plex metadata:", error);
    }
    return saved;
}

async function open_plex_import_preview() {
    if (!plex_import_dialog) return;
    plex_import_preview = null;
    const plex_import_title = document.getElementById("plex_import_title");
    if (plex_import_title) plex_import_title.hidden = true;
    plex_import_confirm.hidden = true;
    plex_import_summary.innerHTML = `
        <span class="plex-loading-row">
            <span class="plex-loading-spinner" aria-hidden="true"></span>
            <span>
                <strong>Reading your Plex library.</strong>
                <small>This can take up to a minute for larger libraries.</small>
            </span>
        </span>`;
    plex_import_stats.innerHTML = "";
    plex_import_confirm.disabled = true;
    plex_import_dialog.showModal();
    try {
        const result = await httpsCallable(functions, "getPlexImportPreview")();
        const data = result.data;
        const new_movies = (data.movies || []).filter((item) =>
            !movie_library.some((existing) => same_library_title(existing, item)));
        const new_shows = (data.shows || []).filter((item) =>
            !show_library.some((existing) => same_library_title(existing, item)));
        const movie_rating_updates = (data.movies || []).filter((item) =>
            item.rating != null && movie_library.some((existing) =>
                same_library_title(existing, item) &&
                Number(existing.my_rating) !== Number(item.rating)));
        const show_rating_updates = (data.shows || []).filter((item) =>
            item.rating != null && show_library.some((existing) =>
                same_library_title(existing, item) &&
                Number(existing.my_rating) !== Number(item.rating)));
        const rating_updates = movie_rating_updates.length + show_rating_updates.length;
        const ratings_on_new_titles = [...new_movies, ...new_shows]
            .filter((item) => item.rating != null).length;
        plex_import_preview = {
            ...data, new_movies, new_shows,
            movie_rating_updates, show_rating_updates
        };
        try {
            localStorage.setItem("stellaz_plex_metadata_cache", JSON.stringify({
                movies: data.movies || [],
                shows: data.shows || []
            }));
        } catch (_) {}
        try { save_plex_metadata_store(data); } catch (_) {}
        if (plex_import_title) plex_import_title.hidden = false;
        plex_import_confirm.hidden = false;
        plex_import_summary.textContent = `Found ${data.movies.length} movies and ${data.shows.length} TV shows on ${data.server}.`;
        plex_import_stats.innerHTML = `
            <div><strong>${new_movies.length}</strong><span>new movies</span></div>
            <div><strong>${new_shows.length}</strong><span>new TV shows</span></div>
            <div><strong>${rating_updates}</strong><span>ratings to update</span></div>
            <div><strong>${ratings_on_new_titles}</strong><span>ratings on new titles</span></div>
            <div><strong>${Number(data.watched_episode_count || 0)}</strong><span>watched episodes</span></div>`;
        plex_import_confirm.disabled =
            new_movies.length + new_shows.length + rating_updates === 0;
    } catch (error) {
        console.error("Unable to preview Plex import:", error);
        if (plex_import_title) plex_import_title.hidden = false;
        plex_import_summary.textContent = error.message || "Unable to read your Plex library.";
    }
}
plex_import_button?.addEventListener("click", open_plex_import_preview);
document.querySelector(".plex-import-button-tv")?.addEventListener("click", open_plex_import_preview);
plex_import_close?.addEventListener("click", () => plex_import_dialog.close());
plex_import_confirm?.addEventListener("click", async () => {
    if (!plex_import_preview) return;

    const original_text = plex_import_confirm.textContent;
    plex_import_confirm.disabled = true;
    plex_import_confirm.textContent = "Importing…";

    try {
        const movie_rows = plex_import_preview.new_movies.map((item) => ({
            title: item.title,
            year: item.year,
            ...(item.tmdb_id ? {tmdb_id: Number(item.tmdb_id)} : {}),
            ...(item.plex_thumb ? {plex_thumb: item.plex_thumb} : {}),
            ...(item.genres?.length ? {genres: item.genres} : {}),
            ...(item.runtime_minutes ? {runtime_minutes: item.runtime_minutes} : {}),
            status: item.watched ? "watched" : "watch_later",
            ...(item.rating != null ? {my_rating: Number(item.rating)} : {})
        }));
        const show_rows = plex_import_preview.new_shows.map((item) => ({
            title: item.title,
            year: item.year,
            ...(item.tmdb_id ? {tmdb_id: Number(item.tmdb_id)} : {}),
            ...(item.plex_thumb ? {plex_thumb: item.plex_thumb} : {}),
            ...(item.genres?.length ? {genres: item.genres} : {}),
            ...(item.average_episode_runtime_minutes ? {average_episode_runtime_minutes: item.average_episode_runtime_minutes} : {}),
            status: Number(item.watched_episodes || 0) > 0 ? "watched" : "watch_later",
            ...(item.rating != null ? {my_rating: Number(item.rating)} : {})
        }));

        if (movie_rows.length) {
            const {error} = await supabase.from("movies").insert(movie_rows);
            if (error) throw error;
        }
        if (show_rows.length) {
            const {error} = await supabase.from("tv_shows").insert(show_rows);
            if (error) throw error;
        }

        for (const item of plex_import_preview.movies || []) {
            const existing = movie_library.find((movie) => same_library_title(movie, item));
            if (!existing) continue;
            const patch = {};
            if (item.plex_thumb) patch.plex_thumb = item.plex_thumb;
            if (item.tmdb_id) patch.tmdb_id = Number(item.tmdb_id);
            if (item.genres?.length && !existing.genres?.length) patch.genres = item.genres;
            if (item.runtime_minutes && !existing.runtime_minutes) patch.runtime_minutes = item.runtime_minutes;
            if (Object.keys(patch).length) {
                const {error} = await supabase.from("movies").update(patch).eq("id", existing.id);
                if (error) throw error;
                Object.assign(existing, patch);
            }
        }
        for (const item of plex_import_preview.shows || []) {
            const existing = show_library.find((show) => same_library_title(show, item));
            if (!existing) continue;
            const patch = {};
            if (item.plex_thumb) patch.plex_thumb = item.plex_thumb;
            if (item.tmdb_id) patch.tmdb_id = Number(item.tmdb_id);
            if (item.genres?.length && !existing.genres?.length) patch.genres = item.genres;
            if (item.average_episode_runtime_minutes && !existing.average_episode_runtime_minutes) {
                patch.average_episode_runtime_minutes = item.average_episode_runtime_minutes;
            }
            if (Object.keys(patch).length) {
                const {error} = await supabase.from("tv_shows").update(patch).eq("id", existing.id);
                if (error) throw error;
                Object.assign(existing, patch);
            }
        }

        for (const item of plex_import_preview.movie_rating_updates) {
            const existing = movie_library.find((movie) =>
                same_library_title(movie, item));
            if (!existing) continue;
            const {error} = await supabase.from("movies")
                .update({my_rating: Number(item.rating)})
                .eq("id", existing.id);
            if (error) throw error;
        }
        for (const item of plex_import_preview.show_rating_updates) {
            const existing = show_library.find((show) =>
                same_library_title(show, item));
            if (!existing) continue;
            const {error} = await supabase.from("tv_shows")
                .update({my_rating: Number(item.rating)})
                .eq("id", existing.id);
            if (error) throw error;
        }

        // Plex import candidates are personal watched/rated activity.
        // Mark every newly imported TV show as watched in Stellaz so an older
        // import cannot leave the user with dozens of shows to fix manually.
        if (show_rows.length) {
            const imported_titles = plex_import_preview.new_shows;
            for (const item of imported_titles) {
                const {error} = await supabase.from("tv_shows")
                    .update({status: "watched"})
                    .eq("title", item.title)
                    .eq("year", item.year);
                if (error) throw error;
            }
        }

        const imported_shows = new Map();
        await load_movie_library();
        await load_show_library();
        for (const item of plex_import_preview.new_shows) {
            const show = show_library.find((entry) => same_library_title(entry, item));
            if (show) imported_shows.set(item.title.trim().toLowerCase(), show);
        }

        const episode_rows = (plex_import_preview.episodes || []).flatMap((episode) => {
            const show = imported_shows.get(String(episode.show_title || "").trim().toLowerCase());
            if (!show || episode.season <= 0 || episode.episode <= 0) return [];
            return [{
                tv_show_id: show.id,
                season_number: Number(episode.season),
                episode_number: Number(episode.episode),
                watched: true
            }];
        });
        if (episode_rows.length) {
            const {error} = await supabase.from("tv_episode_progress")
                .upsert(episode_rows, {
                    onConflict: "user_id,tv_show_id,season_number,episode_number"
                });
            if (error) throw error;
        }

        await load_show_library();
        const added = movie_rows.length + show_rows.length;
        const updated = plex_import_preview.movie_rating_updates.length +
            plex_import_preview.show_rating_updates.length;
        plex_import_dialog.close();
        show_toast(`Plex import complete: ${added} titles added, ${updated} ratings updated.`);
    } catch (error) {
        console.error("Unable to import Plex data:", error);
        alert(error.message || "Unable to import Plex data.");
        plex_import_confirm.disabled = false;
        plex_import_confirm.textContent = original_text;
    }
});

async function finish_plex_connection() {
    if (sessionStorage.getItem("plex_connecting") !== "true") return;
    sessionStorage.removeItem("plex_connecting");
    try {
        const result = await httpsCallable(functions, "finishPlexConnection")();
        if (!result.data.connected) throw new Error("Plex authorization was not completed.");
        await load_plex_connection_status();
        show_toast("Plex connected.");
    } catch (error) {
        console.error("Unable to finish Plex connection:", error);
        alert("Unable to connect Plex. Please try again.");
    }
}

if (plex_connect_button) {
    plex_connect_button.addEventListener("click", async () => {
        plex_connect_button.disabled = true;
        plex_connect_button.textContent = "Connecting...";
        try {
            const result = await httpsCallable(functions, "beginPlexConnection")({
                forward_url: window.location.href
            });
            sessionStorage.setItem("plex_connecting", "true");
            window.location.href = result.data.authorization_url;
        } catch (error) {
            console.error("Unable to start Plex connection:", error);
            plex_connect_button.disabled = false;
            plex_connect_button.textContent = "Connect Plex";
            alert("Unable to start Plex connection.");
        }
    });
}
//#endregion

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

        await finish_plex_connection();
        await load_plex_connection_status();
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

    document.documentElement.classList.toggle(
        "anime-category-active",
        showing_anime
    );

    movie_library_panel.classList.toggle("category-panel-hidden", !showing_movies);
    show_library_panel.classList.toggle("category-panel-hidden", !showing_shows);
    anime_library_panel.classList.toggle("category-panel-hidden", !showing_anime);

    if (showing_movies) {
        load_movie_recommendations(movie_library);
        load_release_rows("movie");
    } else if (showing_shows) {
        load_show_recommendations(show_library);
        load_release_rows("show");
    } else if (showing_anime) {
        load_anime_recommendations(anime_library);
        load_release_rows("anime");
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
