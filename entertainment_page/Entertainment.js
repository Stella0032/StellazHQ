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
            ${item.tmdb_id ? `
                <span class="recommendation-action muted" data-seerr-slot>
                    Checking Seerr…
                </span>` : ""}
            <button type="button" class="recommendation-action muted"
                    data-dialog-action="not_interested">Not interested</button>`;
    recommendation_dialog.showModal();

    if (item.tmdb_id && active_recommendation_type !== "anime") {
        refresh_seerr_status_slot(
            recommendation_dialog_actions,
            item.tmdb_id,
            active_recommendation_type,
            (state) => `<button type="button" class="recommendation-action" data-seerr-slot
                     data-dialog-action="request_seerr"
                     data-seerr-french="${state.is_french}"
                     data-seerr-anime="${state.is_anime}">📥 Request</button>`,
            () => active_recommendation_detail === item
        );
    }

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

async function request_media_on_seerr(item, media_type, button) {
    let choice = "";

    if (media_type !== "show" && button.dataset.seerrFrench === "true") {
        choice = await ask_seerr_choice(
            "French media detected",
            `${item.title} appears to be a French-language title. ` +
            "Download the French audio track?",
            {label: "No", value: "default"},
            {label: "Yes", value: "fr"}
        );
        if (choice === null) return;
    } else if (media_type === "show" && button.dataset.seerrAnime === "true") {
        choice = await ask_seerr_choice(
            "Anime detected",
            `${item.title} looks like anime. Dubbed or Sub?`,
            {label: "Sub", value: "sub"},
            {label: "Dubbed", value: "dub"}
        );
        if (choice === null) return;
    }

    const original_text = button.textContent;
    button.disabled = true;
    button.textContent = "Requesting...";
    try {
        const request_media = httpsCallable(functions, "requestMediaOnSeerr");
        const result = await request_media({
            tmdb_id: Number(item.tmdb_id),
            media_type: media_type === "show" ? "tv" : "movie",
            choice
        });
        show_toast(result.data.already_requested
            ? `${item.title} was already requested on your Seerr server.`
            : `${item.title} requested on your Seerr server.`);
        button.textContent = "✓ Requested";
    } catch (error) {
        console.error("Unable to request media on Seerr:", error);
        button.disabled = false;
        button.textContent = original_text;
        if (error?.message === "Connect your Plex account first." &&
            confirm("Connect your Plex account first. Open Connected Services now?")) {
            open_connected_services_dialog();
            return;
        }
        // Covers the backend's own defense-in-depth check for a title
        // that became available on Plex while this dialog was still open,
        // and the case where Plex is connected but Seerr doesn't
        // recognize that account.
        alert(error?.message ||
            "Unable to send that request to your Seerr server.");
    }
}

// Shared by the recommendation/release dialog and the library detail
// dialog: both show a Seerr-backed action slot next to the same title
// details, they just differ in what "idle" (nothing requested/available
// yet) should offer — recommendations always offer Request, a Watch
// Later library item does too, but e.g. an already-watched item doesn't.
// idle_markup_fn receives the fetched state so the idle Request button
// can carry is_french/is_anime through as data attributes for
// request_media_on_seerr to read when it's actually clicked.
function seerr_status_slot_markup(state, idle_markup_fn) {
    if (state.watch_url) {
        return `<a class="recommendation-action primary" data-seerr-slot
                   href="${state.watch_url}" target="_blank"
                   rel="noopener">▶ Watch on Plex</a>`;
    }
    if (state.status === "processing") {
        return '<span class="recommendation-action muted" ' +
            'data-seerr-slot>⏳ Downloading on Seerr</span>';
    }
    if (state.status === "requested") {
        return '<span class="recommendation-action muted" ' +
            'data-seerr-slot>✓ Requested on Seerr</span>';
    }
    return idle_markup_fn(state);
}

async function refresh_seerr_status_slot(
    container, tmdb_id, media_type, idle_markup_fn, still_open
) {
    let state = {status: "idle", watch_url: null, is_french: false, is_anime: false};
    try {
        const get_status = httpsCallable(functions, "getSeerrMediaStatus");
        const result = await get_status({
            tmdb_id: Number(tmdb_id),
            media_type: media_type === "show" ? "tv" : "movie"
        });
        state = result.data || state;
    } catch (error) {
        console.error("Unable to check Seerr media status:", error);
    }
    if (!still_open()) return;
    const slot = container.querySelector("[data-seerr-slot]");
    if (slot) slot.outerHTML = seerr_status_slot_markup(state, idle_markup_fn);
}

async function run_recommendation_action(item, action, button) {
    if (action === "request_seerr") {
        await request_media_on_seerr(item, active_recommendation_type, button);
        return;
    }

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
let movie_library_expanded = false;

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
        ? ` · ★ ${personal_rating_value.toFixed(1)}/10`
        : " · ★ —";

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
            case "year-desc":
                return (Number(b.year) || 0) - (Number(a.year) || 0) ||
                    a.title.localeCompare(b.title);
            case "year-asc":
                return (Number(a.year) || 0) - (Number(b.year) || 0) ||
                    a.title.localeCompare(b.title);
            case "title-asc":
                return a.title.localeCompare(b.title);
            case "title-desc":
                return b.title.localeCompare(a.title);
            case "tmdb-desc":
                return (b.tmdb_rating ?? -1) - (a.tmdb_rating ?? -1);
            case "mine-desc":
                return (b.my_rating ?? -1) - (a.my_rating ?? -1);
            default:
                return (b.my_rating ?? -1) - (a.my_rating ?? -1) ||
                    a.title.localeCompare(b.title);
        }
    });
}

function render_movie_library() {
    const movies = get_filtered_movies();

    movie_grid.classList.toggle(
        "expanded",
        movie_library_expanded
    );

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
    movie_library_toggle.textContent = movie_library_expanded
        ? "Show less"
        : "Show all movies";
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

async function load_movie_library({refresh_recommendations = true} = {}) {
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
        if (refresh_recommendations) {
            await load_movie_recommendations(movies);
        }

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
    movie_sort.value = "mine-desc";
    render_movie_library();
});

movie_library_toggle.addEventListener("click", () => {
    movie_library_expanded = !movie_library_expanded;
    movie_grid.classList.toggle(
        "expanded",
        movie_library_expanded
    );

    movie_library_toggle.textContent = movie_library_expanded
        ? "Show less"
        : "Show all movies";

    if (!movie_library_expanded) {
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
let show_library_expanded = false;

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
        ? ` · ★ ${personal_rating_value.toFixed(1)}/10`
        : " · ★ —";
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
            case "franchise-asc":
                return (a.franchise || "zzzz").localeCompare(
                    b.franchise || "zzzz"
                ) || (Number(b.year) || 0) - (Number(a.year) || 0) ||
                    a.title.localeCompare(b.title);
            case "year-desc":
                return (Number(b.year) || 0) - (Number(a.year) || 0) ||
                    a.title.localeCompare(b.title);
            case "year-asc":
                return (Number(a.year) || 0) - (Number(b.year) || 0) ||
                    a.title.localeCompare(b.title);
            case "title-asc": return a.title.localeCompare(b.title);
            case "title-desc": return b.title.localeCompare(a.title);
            case "tmdb-desc":
                return (b.tmdb_rating ?? -1) - (a.tmdb_rating ?? -1);
            case "mine-desc":
                return (b.my_rating ?? -1) - (a.my_rating ?? -1);
            default:
                return (b.my_rating ?? -1) - (a.my_rating ?? -1) ||
                    a.title.localeCompare(b.title);
        }
    });
}

function render_show_library() {
    const shows = get_filtered_shows();
    show_grid.classList.toggle(
        "expanded",
        show_library_expanded
    );

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
    show_library_toggle.textContent = show_library_expanded
        ? "Show less"
        : "Show all shows";
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

async function load_all_watched_tv_episodes() {
    const page_size = 1000;
    const rows = [];

    for (let from = 0; ; from += page_size) {
        const {data, error} = await supabase
            .from("tv_episode_progress")
            .select("id,tv_show_id,season_number,episode_number,watched")
            .eq("watched", true)
            .order("id", {ascending: true})
            .range(from, from + page_size - 1);

        if (error) throw error;

        const page = data || [];
        rows.push(...page);

        if (page.length < page_size) break;
    }

    return rows;
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

        const watched_episodes =
            await load_all_watched_tv_episodes();

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
    if (event.target.closest(".library-remove-button") ||
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
    show_sort.value = "mine-desc";
    render_show_library();
});

show_library_toggle.addEventListener("click", () => {
    show_library_expanded = !show_library_expanded;
    show_grid.classList.toggle(
        "expanded",
        show_library_expanded
    );
    show_library_toggle.textContent = show_library_expanded
        ? "Show less"
        : "Show all shows";
});
//#endregion


//? ----------------------------------
//* ----- Library Detail Overlay -----
//? ----------------------------------
//#region
let active_library_detail = null;

function render_library_detail_rating(item, type) {
    const value = item.my_rating !== null ? Number(item.my_rating) : null;
    // The slider always has *some* position (range inputs can't
    // represent "no value"), so an unrated item starts at the midpoint.
    // Nothing is saved just from that starting position — native
    // "change" events only fire on real user interaction, not from
    // setting .value in markup, so viewing an unrated item's details
    // still can't accidentally write a rating.
    const slider_value = value !== null ? value : 5.5;

    return `
        <input class="rating-slider" type="range"
               min="1" max="10" step="0.1"
               value="${slider_value}"
               data-library-dialog-rating="${type}"
               data-library-dialog-id="${item.id}"
               aria-label="Rate ${item.title}, 1 to 10">
        <span class="rating-slider-value" data-rating-slider-value>${
            value !== null ? value.toFixed(1) : "—"
        }</span>`;
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
            <div class="rating-slider-row">
                ${render_library_detail_rating(item, type)}
            </div>
        </div>
        ${item.status === "watch_later" ? `
            <button class="recommendation-action primary" type="button"
                    data-library-dialog-watched="${type}"
                    data-library-dialog-id="${item.id}">
                ✓ Mark watched
            </button>` : ""}
        ${item.tmdb_id ? `
            <span class="recommendation-action muted" data-seerr-slot>
                Checking Seerr…
            </span>` : ""}
        ${type === "show" ? `
            <button class="recommendation-action" type="button"
                    data-library-dialog-seasons="${item.id}">
                View seasons & episodes
            </button>` : ""}
    `;

    recommendation_dialog.showModal();

    if (item.tmdb_id) {
        refresh_seerr_status_slot(
            recommendation_dialog_actions,
            item.tmdb_id,
            type,
            // Only offer to request something not yet on Plex if it's
            // sitting in Watch Later — an already-watched item you added
            // manually isn't necessarily something to re-request.
            (state) => item.status === "watch_later" ? `
                <button class="recommendation-action" type="button" data-seerr-slot
                        data-library-dialog-request="${type}"
                        data-library-dialog-id="${item.id}"
                        data-seerr-french="${state.is_french}"
                        data-seerr-anime="${state.is_anime}">
                    📥 Request
                </button>` : "",
            () => active_library_detail?.item.id === item.id &&
                active_library_detail?.type === type
        );
    }

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

// Live-updates the numeric label while dragging — "input" fires on every
// tick of the drag, well before the rating is actually saved.
recommendation_dialog_actions.addEventListener("input", (event) => {
    const slider = event.target.closest("[data-library-dialog-rating]");
    if (!slider) return;
    const value_label =
        recommendation_dialog_actions.querySelector("[data-rating-slider-value]");
    if (value_label) value_label.textContent = Number(slider.value).toFixed(1);
});

// Saves once the slider is released/committed — "change" only fires on
// real user interaction, never from setting .value in markup, so
// rendering the dialog can't itself trigger a save.
recommendation_dialog_actions.addEventListener("change", async (event) => {
    const slider = event.target.closest("[data-library-dialog-rating]");
    if (!slider) return;

    const type = slider.dataset.libraryDialogRating;
    const id = Number(slider.dataset.libraryDialogId);
    const rating = Math.round(Number(slider.value) * 10) / 10;
    const table = type === "movie" ? "movies" : "tv_shows";
    const library = type === "movie" ? movie_library : show_library;
    const item = library.find((entry) => entry.id === id);
    const previous_rating = item?.my_rating ?? null;

    try {
        const {error} = await supabase
            .from(table)
            .update({my_rating: rating})
            .eq("id", id);
        if (error) throw error;

        if (item) item.my_rating = rating;

        if (type === "movie") render_movie_library();
        else render_show_library();
    } catch (error) {
        console.error("Unable to save library rating:", error);
        alert("Unable to save your rating. Please try again.");
        slider.value = previous_rating ?? 5.5;
        const value_label =
            recommendation_dialog_actions.querySelector("[data-rating-slider-value]");
        if (value_label) {
            value_label.textContent =
                previous_rating !== null ? previous_rating.toFixed(1) : "—";
        }
    }
});

recommendation_dialog_actions.addEventListener("click", async (event) => {
    if (!active_library_detail) return;

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

    const request_button = event.target.closest(
        "[data-library-dialog-request]"
    );
    if (request_button) {
        await request_media_on_seerr(
            active_library_detail.item,
            request_button.dataset.libraryDialogRequest,
            request_button
        );
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
            const show = show_library.find((item) => item.id === id);

            if (show) {
                try {
                    const get_seasons =
                        httpsCallable(functions, "getTVShowSeasons");
                    const result = await get_seasons({
                        title: show.title,
                        year: show.year
                    });

                    const seasons = (result.data.seasons || []).filter(
                        (season) =>
                            Number(season.season_number) > 0
                    );

                    if (seasons.length) {
                        const season_rows = seasons.map((season) => ({
                            tv_show_id: id,
                            season_number:
                                Number(season.season_number),
                            watched: true
                        }));

                        const episode_rows = seasons.flatMap(
                            (season) =>
                                Array.from(
                                    {
                                        length: Number(
                                            season.episode_count || 0
                                        )
                                    },
                                    (_, index) => ({
                                        tv_show_id: id,
                                        season_number:
                                            Number(
                                                season.season_number
                                            ),
                                        episode_number: index + 1,
                                        watched: true
                                    })
                                )
                        );

                        const {error: season_error} =
                            await supabase
                                .from("tv_season_progress")
                                .upsert(season_rows, {
                                    onConflict:
                                        "user_id,tv_show_id,season_number"
                                });
                        if (season_error) throw season_error;

                        for (let start = 0;
                            start < episode_rows.length;
                            start += 400) {
                            const chunk =
                                episode_rows.slice(start, start + 400);
                            const {error: episode_error} =
                                await supabase
                                    .from("tv_episode_progress")
                                    .upsert(chunk, {
                                        onConflict:
                                            "user_id,tv_show_id,season_number,episode_number"
                                    });
                            if (episode_error) throw episode_error;
                        }
                    }
                } catch (progress_error) {
                    console.error(
                        "Unable to populate watched TV progress:",
                        show.title,
                        progress_error
                    );
                }
            }

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
            // Removing a title doesn't change anything the recommendation
            // engine should react to — skip the TMDB round trip that
            // reloading recommendations would otherwise trigger.
            await load_movie_library({refresh_recommendations: false});
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
//* ----- Connected Services --------
//? ---------------------------------
//#region
const connected_services_dialog =
    document.getElementById("connected_services_dialog");
const connected_services_close =
    document.getElementById("connected_services_close");
const anilist_connection_label =
    document.getElementById("anilist_connection_label");

function open_connected_services_dialog() {
    if (!connected_services_dialog?.open) {
        connected_services_dialog?.showModal();
    }
}

function remember_connected_services_return() {
    sessionStorage.setItem("stellaz_open_connected_services", "true");
}

function reopen_connected_services_if_requested() {
    const params = new URLSearchParams(window.location.search);
    const requested_by_url = params.get("services") === "1";
    const requested_by_oauth =
        sessionStorage.getItem("stellaz_open_connected_services") === "true";

    if (requested_by_url) {
        params.delete("services");
        const query = params.toString();
        history.replaceState(
            {},
            document.title,
            window.location.pathname + (query ? "?" + query : "")
        );
    }

    if (requested_by_oauth) {
        sessionStorage.removeItem("stellaz_open_connected_services");
    }

    if (requested_by_url || requested_by_oauth) {
        open_connected_services_dialog();
    }
}

connected_services_close?.addEventListener("click", () =>
    connected_services_dialog.close()
);

const service_import_confirm_dialog =
    document.getElementById("service_import_confirm_dialog");
const service_import_confirm_title =
    document.getElementById("service_import_confirm_title");
const service_import_confirm_message =
    document.getElementById("service_import_confirm_message");
const service_import_cancel =
    document.getElementById("service_import_cancel");
const service_import_approve =
    document.getElementById("service_import_approve");

let service_import_confirm_resolve = null;

function settle_service_import_confirmation(approved) {
    const resolve = service_import_confirm_resolve;
    service_import_confirm_resolve = null;

    if (service_import_confirm_dialog.open) {
        service_import_confirm_dialog.close();
    }

    if (resolve) resolve(approved);
}

function request_service_import_approval(service, media_label, count) {
    if (count <= 0) {
        show_toast("No " + media_label + " entries were found on " + service + ".");
        return Promise.resolve(false);
    }

    const noun = count === 1 ? "entry" : "entries";
    service_import_confirm_title.textContent =
        "Import " + media_label + " from " + service + "?";
    service_import_confirm_message.textContent =
        service + " found " + count + " " + media_label + " " + noun +
        ". Approve to import them into Stellaz.";

    service_import_confirm_dialog.showModal();

    return new Promise((resolve) => {
        service_import_confirm_resolve = resolve;
    });
}

service_import_cancel.addEventListener("click", () =>
    settle_service_import_confirmation(false)
);

service_import_approve.addEventListener("click", () =>
    settle_service_import_confirmation(true)
);

// Generic two-option prompt, reused for the French-audio and anime
// Dub/Sub choices before a Seerr request goes out. Resolves with
// whichever option's `value` was picked, or null if the dialog was
// dismissed (Escape, clicking outside) without choosing either —
// callers should treat null as "cancel the request".
const seerr_choice_dialog = document.getElementById("seerr_choice_dialog");
const seerr_choice_title = document.getElementById("seerr_choice_title");
const seerr_choice_message = document.getElementById("seerr_choice_message");
const seerr_choice_option_a = document.getElementById("seerr_choice_option_a");
const seerr_choice_option_b = document.getElementById("seerr_choice_option_b");

let seerr_choice_resolve = null;

function settle_seerr_choice(value) {
    const resolve = seerr_choice_resolve;
    seerr_choice_resolve = null;

    if (seerr_choice_dialog.open) seerr_choice_dialog.close();

    if (resolve) resolve(value);
}

function ask_seerr_choice(title, message, option_a, option_b) {
    seerr_choice_title.textContent = title;
    seerr_choice_message.textContent = message;
    seerr_choice_option_a.textContent = option_a.label;
    seerr_choice_option_a.dataset.value = option_a.value;
    seerr_choice_option_b.textContent = option_b.label;
    seerr_choice_option_b.dataset.value = option_b.value;

    seerr_choice_dialog.showModal();

    return new Promise((resolve) => {
        seerr_choice_resolve = resolve;
    });
}

seerr_choice_option_a.addEventListener("click", () =>
    settle_seerr_choice(seerr_choice_option_a.dataset.value)
);

seerr_choice_option_b.addEventListener("click", () =>
    settle_seerr_choice(seerr_choice_option_b.dataset.value)
);

seerr_choice_dialog.addEventListener("close", () => {
    if (seerr_choice_resolve) settle_seerr_choice(null);
});

service_import_confirm_dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    settle_service_import_confirmation(false);
});
//#endregion


//? ---------------------------------
//* ----- TMDB Connection -----------
//? ---------------------------------
//#region
const tmdb_connection_label =
    document.getElementById("tmdb_connection_label");
const tmdb_connect_description =
    document.getElementById("tmdb_connect_description");
const tmdb_connect_button =
    document.getElementById("tmdb_connect_button");
const tmdb_movie_sync_button =
    document.getElementById("tmdb_movie_sync_button");
const tmdb_show_sync_button =
    document.getElementById("tmdb_show_sync_button");

async function load_tmdb_connection_status() {
    try {
        const get_status =
            httpsCallable(functions, "getTMDBConnectionStatus");
        const result = await get_status();

        if (result.data.connected) {
            document.getElementById("tmdb_connection_badge")
                ?.removeAttribute("hidden");
            tmdb_connection_label.textContent =
                result.data.username
                    ? "Connected as " + result.data.username
                    : "Connected";
            tmdb_connect_description.textContent =
                "Connected to Stellaz. Import ratings and watchlist entries for movies or TV shows.";
            tmdb_connect_button.textContent = "Connected";
            tmdb_connect_button.disabled = true;
            tmdb_movie_sync_button.hidden = false;
            tmdb_show_sync_button.hidden = false;
            return;
        }

        document.getElementById("tmdb_connection_badge")
            ?.setAttribute("hidden", "");
        tmdb_connection_label.textContent =
            result.data.needs_reconnect
                ? "Reconnect required"
                : "Not connected";
        tmdb_connect_description.textContent =
            result.data.needs_reconnect
                ? "Your TMDB session is no longer valid. Reconnect before importing."
                : "Import your TMDB movie and TV ratings plus your watchlists.";
        tmdb_connect_button.textContent =
            result.data.needs_reconnect
                ? "Reconnect TMDB"
                : "Connect TMDB";
        tmdb_connect_button.disabled = false;
        tmdb_movie_sync_button.hidden = true;
        tmdb_show_sync_button.hidden = true;
    } catch (error) {
        console.error("Unable to check TMDB connection:", error);
    }
}

async function begin_tmdb_connection() {
    remember_connected_services_return();
    sessionStorage.setItem("tmdb_connection_pending", "true");

    tmdb_connect_button.disabled = true;
    tmdb_connect_button.textContent = "Connecting...";

    try {
        const get_url =
            httpsCallable(functions, "getTMDBAuthorizationUrl");
        const result = await get_url();
        window.location.href = result.data.authorization_url;
    } catch (error) {
        sessionStorage.removeItem("tmdb_connection_pending");
        console.error("Unable to start TMDB connection:", error);
        tmdb_connect_button.disabled = false;
        tmdb_connect_button.textContent = "Connect TMDB";
        alert("Unable to start the TMDB connection.");
    }
}

async function finish_tmdb_connection() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") !== "tmdb") return false;

    const pending =
        sessionStorage.getItem("tmdb_connection_pending") === "true";

    history.replaceState({}, document.title, window.location.pathname);

    if (!pending) {
        alert("The TMDB connection could not be verified. Please try again.");
        return true;
    }

    try {
        const complete =
            httpsCallable(functions, "completeTMDBConnection");
        const result = await complete();

        sessionStorage.removeItem("tmdb_connection_pending");
        await load_tmdb_connection_status();

        show_toast(
            "TMDB connected" +
            (result.data?.username
                ? " as " + result.data.username
                : "") +
            "."
        );
    } catch (error) {
        sessionStorage.removeItem("tmdb_connection_pending");
        console.error("Unable to finish TMDB connection:", error);
        alert("Unable to connect TMDB. Please try again.");
    }

    return true;
}

tmdb_connect_button.addEventListener("click", begin_tmdb_connection);
//#endregion


//? ---------------------------------
//* ----- Kitsu Connection ----------
//? ---------------------------------
//#region
const kitsu_connection_label =
    document.getElementById("kitsu_connection_label");
const kitsu_connect_description =
    document.getElementById("kitsu_connect_description");
const kitsu_connect_button =
    document.getElementById("kitsu_connect_button");
const kitsu_username_input =
    document.getElementById("kitsu_username_input");
const kitsu_anime_sync_button =
    document.getElementById("kitsu_anime_sync_button");
const kitsu_manga_sync_button =
    document.getElementById("kitsu_manga_sync_button");

async function load_kitsu_connection_status() {
    try {
        const get_status =
            httpsCallable(functions, "getKitsuConnectionStatus");
        const result = await get_status();

        if (result.data.connected) {
            document.getElementById("kitsu_connection_badge")
                ?.removeAttribute("hidden");
            kitsu_connection_label.textContent =
                result.data.username
                    ? "Connected as " + result.data.username
                    : "Connected";
            kitsu_connect_description.textContent =
                "Connected to Stellaz. Import anime or manga to refresh your Kitsu progress, statuses, and ratings.";
            kitsu_username_input.hidden = true;
            kitsu_connect_button.hidden = true;
            kitsu_anime_sync_button.hidden = false;
            kitsu_manga_sync_button.hidden = false;
            return;
        }

        document.getElementById("kitsu_connection_badge")
            ?.setAttribute("hidden", "");
        kitsu_connection_label.textContent = "Not connected";
        kitsu_connect_description.textContent =
            "Link your public Kitsu profile to import anime and manga progress, statuses, and ratings.";
        kitsu_username_input.hidden = false;
        kitsu_connect_button.hidden = false;
        kitsu_anime_sync_button.hidden = true;
        kitsu_manga_sync_button.hidden = true;
    } catch (error) {
        console.error("Unable to check Kitsu connection:", error);
    }
}

async function connect_kitsu_profile() {
    const username = kitsu_username_input.value.trim();
    if (!username) {
        kitsu_username_input.focus();
        return;
    }

    kitsu_connect_button.disabled = true;
    kitsu_connect_button.textContent = "Connecting...";

    try {
        const connect = httpsCallable(functions, "connectKitsuProfile");
        const result = await connect({username});

        await load_kitsu_connection_status();
        show_toast(
            "Kitsu connected as " +
            (result.data.username || username) + "."
        );
    } catch (error) {
        console.error("Unable to connect Kitsu:", error);
        alert(
            error?.message ||
            "Unable to find that public Kitsu profile."
        );
    } finally {
        kitsu_connect_button.disabled = false;
        kitsu_connect_button.textContent = "Connect Kitsu";
    }
}

kitsu_connect_button.addEventListener("click", connect_kitsu_profile);
kitsu_username_input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        connect_kitsu_profile();
    }
});
//#endregion


//? ---------------------------------
//* ----- Manga / Manhwa Library ----
//? ---------------------------------
//#region
const manga_count = document.getElementById("manga_count");
const manga_library_count = document.getElementById("manga_library_count");
const manga_grid = document.getElementById("manga_grid");
const manga_filters = document.getElementById("manga_filters");
const manga_type_filter = document.getElementById("manga_type_filter");
const manga_status_filter = document.getElementById("manga_status_filter");
const manga_sort = document.getElementById("manga_sort");
const manga_search = document.getElementById("manga_search");
const manga_filter_clear = document.getElementById("manga_filter_clear");
const manga_library_toggle = document.getElementById("manga_library_toggle");
const manga_add_button = document.getElementById("manga_add_button");
const anilist_connect_card = document.getElementById("anilist_connect_card");
const anilist_connect_title = document.getElementById("anilist_connect_title");
const anilist_connect_description = document.getElementById("anilist_connect_description");
const anilist_connect_button = document.getElementById("anilist_connect_button");
const anilist_sync_header_button = document.getElementById("anilist_sync_header_button");
const anilist_anime_sync_button = document.getElementById("anilist_anime_sync_button");
const manga_add_dialog = document.getElementById("manga_add_dialog");
const manga_add_close = document.getElementById("manga_add_close");
const manga_add_search_form = document.getElementById("manga_add_search_form");
const manga_add_search = document.getElementById("manga_add_search");
const manga_add_results = document.getElementById("manga_add_results");
const manga_edit_dialog = document.getElementById("manga_edit_dialog");
const manga_edit_close = document.getElementById("manga_edit_close");
const manga_edit_cover = document.getElementById("manga_edit_cover");
const manga_edit_title = document.getElementById("manga_edit_title");
const manga_detail_type = document.getElementById("manga_detail_type");
const manga_detail_meta = document.getElementById("manga_detail_meta");
const manga_detail_description = document.getElementById("manga_detail_description");
const manga_detail_facts = document.getElementById("manga_detail_facts");
const manga_edit_form = document.getElementById("manga_edit_form");
const manga_edit_status = document.getElementById("manga_edit_status");
const manga_edit_chapters = document.getElementById("manga_edit_chapters");
const manga_edit_score = document.getElementById("manga_edit_score");
const manga_edit_save = document.getElementById("manga_edit_save");
const manga_remove_button = document.getElementById("manga_remove_button");

let manga_library = [];
let manga_add_candidates = [];
let active_manga = null;

function manga_escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function manga_status_label(status) {
    return ({
        reading: "Reading",
        completed: "Completed",
        on_hold: "On hold",
        dropped: "Dropped",
        plan_to_read: "Plan to read"
    })[status] || status || "Reading";
}

async function load_anilist_connection_status() {
    try {
        const get_status =
            httpsCallable(functions, "getAniListConnectionStatus");
        const result = await get_status();

        if (result.data.connected) {
            document.getElementById("anilist_connection_badge")
                ?.removeAttribute("hidden");
            anilist_connection_label.textContent =
                result.data.username
                    ? "Connected as " + result.data.username
                    : "Connected";
            anilist_sync_header_button.hidden = false;
            anilist_anime_sync_button.hidden = false;
            anilist_connect_button.textContent = "Connected";
            anilist_connect_button.disabled = true;
            anilist_connect_button.dataset.connected = "true";
            anilist_connect_title.textContent = "AniList";
            anilist_connect_description.textContent =
                "Connected to Stellaz. Import anime or manga/manhwa to refresh your ratings, statuses, and progress.";
            return;
        }

        document.getElementById("anilist_connection_badge")
            ?.setAttribute("hidden", "");
        anilist_connection_label.textContent = result.data.needs_reconnect
            ? "Reconnect required"
            : "Not connected";
        anilist_sync_header_button.hidden = true;
        anilist_anime_sync_button.hidden = true;
        anilist_connect_button.disabled = false;
        anilist_connect_button.dataset.connected = "false";
        anilist_connect_title.textContent = "AniList";

        if (result.data.needs_reconnect) {
            anilist_connect_description.textContent =
                "Your AniList authorization expired. Reconnect to import your latest anime and manga progress and ratings.";
            anilist_connect_button.textContent = "Reconnect AniList";
        } else {
            anilist_connect_description.textContent =
                "Import both your anime and manga/manhwa lists, including ratings, statuses, and progress.";
            anilist_connect_button.textContent = "Connect AniList";
        }
    } catch (error) {
        console.error("Unable to check AniList connection:", error);
    }
}

async function begin_anilist_connection() {
    remember_connected_services_return();
    anilist_connect_button.disabled = true;
    anilist_connect_button.textContent = "Connecting...";

    try {
        const get_url =
            httpsCallable(functions, "getAniListAuthorizationUrl");
        const result = await get_url();
        window.location.href = result.data.authorization_url;
    } catch (error) {
        console.error("Unable to start AniList connection:", error);
        anilist_connect_button.disabled = false;
        anilist_connect_button.textContent = "Connect AniList";
        alert("Unable to start the AniList connection.");
    }
}

function map_anilist_import_row(item) {
    return {
        anilist_id: item.anilist_id,
        title: item.title,
        title_romaji: item.title_romaji,
        title_native: item.title_native,
        synonyms: item.synonyms || [],
        country_of_origin: item.country_of_origin,
        media_kind: item.media_kind,
        format: item.format,
        publication_status: item.publication_status,
        user_status: item.user_status,
        chapters_read: Number(item.chapters_read || 0),
        total_chapters: item.total_chapters,
        volumes_read: Number(item.volumes_read || 0),
        total_volumes: item.total_volumes,
        my_rating: item.my_rating,
        anilist_score: item.anilist_score,
        poster_url: item.poster_url,
        banner_url: item.banner_url,
        description: item.description,
        genres: item.genres || [],
        site_url: item.site_url,
        start_date: item.start_date,
        end_date: item.end_date,
        updated_at: new Date().toISOString()
    };
}

function normalize_manga_import_title(value) {
    return String(value || "")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function manga_import_aliases(item) {
    return [
        item.title,
        item.title_romaji,
        item.title_native,
        ...(item.synonyms || [])
    ]
        .map(normalize_manga_import_title)
        .filter(Boolean);
}

function find_existing_manga_for_import(row) {
    if (row.anilist_id) {
        const by_anilist = manga_library.find(
            (item) => Number(item.anilist_id) === Number(row.anilist_id)
        );
        if (by_anilist) return by_anilist;
    }

    if (row.mal_id) {
        const by_mal = manga_library.find(
            (item) => Number(item.mal_id) === Number(row.mal_id)
        );
        if (by_mal) return by_mal;
    }

    if (row.kitsu_id) {
        const by_kitsu = manga_library.find(
            (item) => Number(item.kitsu_id) === Number(row.kitsu_id)
        );
        if (by_kitsu) return by_kitsu;
    }

    const incoming_aliases = new Set(manga_import_aliases(row));
    if (!incoming_aliases.size) return null;

    return manga_library.find((item) =>
        manga_import_aliases(item).some(
            (alias) => incoming_aliases.has(alias)
        )
    ) || null;
}

function manga_import_patch(existing, row) {
    const patch = {
        user_status: row.user_status || existing.user_status,
        chapters_read: Number(row.chapters_read || 0),
        volumes_read: Number(row.volumes_read || 0),
        my_rating: row.my_rating ?? existing.my_rating ?? null,
        updated_at: new Date().toISOString()
    };

    [
        "anilist_id", "mal_id", "kitsu_id",
        "anilist_score", "mal_score", "kitsu_score",
        "total_chapters", "total_volumes", "publication_status",
        "start_date", "end_date"
    ].forEach((field) => {
        if (row[field] !== null && row[field] !== undefined &&
            row[field] !== "") {
            patch[field] = row[field];
        }
    });

    if ((!existing.media_kind || existing.media_kind === "Other") &&
        row.media_kind) {
        patch.media_kind = row.media_kind;
    }

    [
        "title_romaji", "title_native", "country_of_origin", "format",
        "poster_url", "banner_url", "description", "site_url"
    ].forEach((field) => {
        if (!existing[field] && row[field]) patch[field] = row[field];
    });

    const merged_synonyms = [
        ...(existing.synonyms || []),
        ...(row.synonyms || [])
    ].filter(Boolean);
    if (merged_synonyms.length) {
        patch.synonyms = [...new Set(merged_synonyms)].slice(0, 40);
    }

    const merged_genres = [
        ...(existing.genres || []),
        ...(row.genres || [])
    ].filter(Boolean);
    if (merged_genres.length) {
        patch.genres = [...new Set(merged_genres)];
    }

    return patch;
}

async function merge_manga_import_rows(rows) {
    if (!rows.length) return {added: 0, updated: 0};

    await load_manga_library();

    let added = 0;
    let updated = 0;

    for (const row of rows) {
        const existing = find_existing_manga_for_import(row);

        if (existing) {
            const patch = manga_import_patch(existing, row);
            const {error} = await supabase
                .from("manga_library")
                .update(patch)
                .eq("id", existing.id);
            if (error) throw error;
            Object.assign(existing, patch);
            updated += 1;
            continue;
        }

        const {data, error} = await supabase
            .from("manga_library")
            .insert(row)
            .select("*")
            .single();
        if (error) throw error;
        manga_library.push(data);
        added += 1;
    }

    await load_manga_library();
    return {added, updated};
}

async function sync_anilist_manga() {
    const buttons = [anilist_sync_header_button, anilist_connect_button]
        .filter(Boolean);
    buttons.forEach((button) => {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = "Importing...";
    });

    try {
        const sync = httpsCallable(functions, "syncAniListMangaList");
        const result = await sync();
        const manga = result.data.manga || [];
        const rows = manga.map(map_anilist_import_row);

        const approved = await request_service_import_approval(
            "AniList",
            "manga",
            rows.length
        );
        if (!approved) return;

        const merged = await merge_manga_import_rows(rows);

        await load_anilist_connection_status();

        const username = result.data.username
            ? " from " + result.data.username
            : "";
        show_toast(
            manga.length + " AniList title" +
            (manga.length === 1 ? "" : "s") +
            " imported" + username +
            " · " + merged.added + " added, " +
            merged.updated + " updated."
        );
    } catch (error) {
        console.error("Unable to import AniList manga:", error);
        const code = error?.code || "";
        if (code.includes("failed-precondition") ||
            code.includes("unauthenticated")) {
            await load_anilist_connection_status();
        }
        alert("Unable to import your AniList manga list. Please try again.");
    } finally {
        buttons.forEach((button) => {
            button.disabled = false;
            button.textContent =
                button.dataset.originalText || "Import AniList";
            delete button.dataset.originalText;
        });
    }
}

async function finish_anilist_connection() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") !== "anilist") return false;

    const code = params.get("code");
    history.replaceState({}, document.title, window.location.pathname);

    if (!code) {
        alert("AniList did not return an authorization code.");
        return true;
    }

    try {
        const exchange =
            httpsCallable(functions, "exchangeAniListAuthorizationCode");
        const result = await exchange({code});

        await load_anilist_connection_status();

        if (result.data?.username) {
            show_toast(
                "AniList connected as " + result.data.username + "."
            );
        }
    } catch (error) {
        console.error("Unable to finish AniList connection:", error);
        alert("Unable to connect AniList. Please try again.");
    }

    return true;
}

anilist_connect_button.addEventListener("click", async () => {
    await begin_anilist_connection();
});

anilist_anime_sync_button.addEventListener("click", sync_anilist_anime);
anilist_sync_header_button.addEventListener("click", sync_anilist_manga);

async function sync_kitsu_anime() {
    const original_text = kitsu_anime_sync_button.textContent;
    kitsu_anime_sync_button.disabled = true;
    kitsu_anime_sync_button.textContent = "Importing...";

    try {
        const sync = httpsCallable(functions, "syncKitsuAnimeList");
        const result = await sync();
        const rows = result.data.anime || [];

        const approved = await request_service_import_approval(
            "Kitsu",
            "anime",
            rows.length
        );
        if (!approved) return;

        const merged = await merge_anime_import_rows(rows);

        show_toast(
            rows.length + " Kitsu anime title" +
            (rows.length === 1 ? "" : "s") +
            " imported · " + merged.added + " added, " +
            merged.updated + " updated."
        );
    } catch (error) {
        console.error("Unable to import Kitsu anime:", error);
        alert("Unable to import your Kitsu anime list. Please try again.");
    } finally {
        kitsu_anime_sync_button.disabled = false;
        kitsu_anime_sync_button.textContent = original_text;
    }
}

async function sync_kitsu_manga() {
    const original_text = kitsu_manga_sync_button.textContent;
    kitsu_manga_sync_button.disabled = true;
    kitsu_manga_sync_button.textContent = "Importing...";

    try {
        const sync = httpsCallable(functions, "syncKitsuMangaList");
        const result = await sync();
        const rows = result.data.manga || [];

        const approved = await request_service_import_approval(
            "Kitsu",
            "manga",
            rows.length
        );
        if (!approved) return;

        const merged = await merge_manga_import_rows(rows);

        show_toast(
            rows.length + " Kitsu manga title" +
            (rows.length === 1 ? "" : "s") +
            " imported · " + merged.added + " added, " +
            merged.updated + " updated."
        );
    } catch (error) {
        console.error("Unable to import Kitsu manga:", error);
        alert("Unable to import your Kitsu manga list. Please try again.");
    } finally {
        kitsu_manga_sync_button.disabled = false;
        kitsu_manga_sync_button.textContent = original_text;
    }
}

kitsu_anime_sync_button.addEventListener("click", sync_kitsu_anime);
kitsu_manga_sync_button.addEventListener("click", sync_kitsu_manga);


function render_manga_library() {
    const query = manga_search.value.trim().toLowerCase();
    const type = manga_type_filter.value;
    const status = manga_status_filter.value;

    let visible = manga_library.filter((item) => {
        const aliases = [
            item.title,
            item.title_romaji,
            item.title_native,
            ...(item.synonyms || [])
        ].filter(Boolean).join(" ").toLowerCase();

        return (!query || aliases.includes(query)) &&
            (!type || item.media_kind === type) &&
            (!status || item.user_status === status);
    });

    if (manga_sort.value === "title-desc") {
        visible.sort((a, b) => b.title.localeCompare(a.title));
    } else if (manga_sort.value === "title-asc") {
        visible.sort((a, b) => a.title.localeCompare(b.title));
    } else if (manga_sort.value === "external-desc") {
        const external_score = (item) =>
            item.anilist_score != null
                ? Number(item.anilist_score)
                : item.mal_score != null
                    ? Number(item.mal_score) * 10
                    : Number(item.kitsu_score || 0);
        visible.sort((a, b) =>
            external_score(b) - external_score(a) ||
            a.title.localeCompare(b.title));
    } else if (manga_sort.value === "newest-desc") {
        visible.sort((a, b) =>
            String(b.start_date || "").localeCompare(String(a.start_date || "")) ||
            a.title.localeCompare(b.title));
    } else {
        visible.sort((a, b) =>
            Number(b.my_rating || 0) - Number(a.my_rating || 0) ||
            Number(b.anilist_score || 0) - Number(a.anilist_score || 0) ||
            a.title.localeCompare(b.title));
    }

    manga_grid.classList.remove("expanded");
    manga_grid.innerHTML = visible.length ? visible.map((item, index) => {
        const title = manga_escape(item.title);
        const poster = item.poster_url
            ? '<img class="movie-poster" src="' + manga_escape(item.poster_url) +
                '" alt="" loading="lazy">'
            : '<div class="movie-poster-placeholder">READ</div>';
        const chapters = item.total_chapters
            ? Number(item.chapters_read || 0) + "/" + Number(item.total_chapters) + " ch"
            : Number(item.chapters_read || 0) + " ch";
        const external_score = item.anilist_score != null
            ? "AniList: " + Number(item.anilist_score) + "%"
            : item.mal_score != null
                ? "MAL: " + Number(item.mal_score).toFixed(2)
                : item.kitsu_score != null
                    ? "Kitsu: " + Number(item.kitsu_score).toFixed(1) + "%"
                    : "Rating: —";
        const personal_score = item.my_rating
            ? " · ★ " + Number(item.my_rating).toFixed(1) + "/10"
            : " · ★ —";
        const extra_class = index >= get_collapsed_movie_count()
            ? " library-extra"
            : "";

        return '<article class="movie-card manga-card' + extra_class + '">' +
            '<div class="movie-poster-wrap manga-open" data-manga-id="' +
            item.id + '" tabindex="0" role="button" title="Open ' + title + '">' +
            poster +
            '<span class="manga-type-badge">' + manga_escape(item.media_kind) + '</span>' +
            '</div>' +
            '<h3 class="manga-open" data-manga-id="' + item.id +
            '" tabindex="0" role="button" title="Open ' + title + '">' +
            title + '</h3>' +
            '<p>' + chapters + " · " + external_score + personal_score + '</p>' +
            '</article>';
    }).join("") : '<p class="library-loading">No matching manga or manhwa.</p>';

    const has_hidden = visible.length > get_collapsed_movie_count();
    manga_library_toggle.hidden = !has_hidden;
    manga_library_toggle.textContent = "Show all manga";
}

async function load_manga_library() {
    try {
        const {data, error} = await supabase
            .from("manga_library")
            .select("*")
            .order("title");
        if (error) throw error;

        manga_library = data || [];
        const completed = manga_library.filter(
            (item) => item.user_status === "completed"
        );

        manga_count.textContent = completed.length;
        manga_library_count.textContent =
            manga_library.length + (manga_library.length === 1 ? " TITLE" : " TITLES");
        manga_filters.hidden = manga_library.length === 0;

        if (manga_library.length === 0) {
            manga_grid.innerHTML =
                '<p class="library-loading">No manga or manhwa added yet. Use “Add manga / manhwa” to search AniList.</p>';
            manga_library_toggle.hidden = true;
            return;
        }

        render_manga_library();
    } catch (error) {
        console.error("Unable to load manga / manhwa library:", error);
        manga_count.textContent = "Error";
        manga_library_count.textContent = "ERROR";
        manga_grid.innerHTML =
            '<p class="library-loading">Unable to load your manga and manhwa.</p>';
    }
}

function open_manga_editor(manga_id) {
    active_manga = manga_library.find((item) => item.id === manga_id);
    if (!active_manga) return;

    manga_edit_title.textContent = active_manga.title;
    manga_detail_type.textContent = active_manga.media_kind || "MANGA";
    manga_detail_meta.textContent = [
        active_manga.publication_status
            ? active_manga.publication_status.replaceAll("_", " ")
            : null,
        active_manga.anilist_score != null
            ? "★ " + Number(active_manga.anilist_score) + "% AniList"
            : active_manga.mal_score != null
                ? "★ " + Number(active_manga.mal_score).toFixed(2) + " MAL"
                : active_manga.kitsu_score != null
                    ? "★ " + Number(active_manga.kitsu_score).toFixed(1) + "% Kitsu"
                    : null
    ].filter(Boolean).join(" · ");
    manga_detail_description.textContent =
        active_manga.description || "No description available.";

    const facts = [
        active_manga.total_chapters
            ? "Chapters: " + active_manga.total_chapters
            : "Chapters: ongoing / unknown",
        active_manga.total_volumes
            ? "Volumes: " + active_manga.total_volumes
            : null,
        active_manga.start_date
            ? "Started: " + active_manga.start_date
            : null,
        active_manga.genres?.length
            ? active_manga.genres.slice(0, 5).join(" · ")
            : null
    ].filter(Boolean);
    manga_detail_facts.innerHTML =
        facts.map((fact) => "<span>" + manga_escape(fact) + "</span>").join("");

    manga_edit_cover.src = active_manga.poster_url || "";
    manga_edit_cover.hidden = !active_manga.poster_url;
    manga_edit_status.value = active_manga.user_status || "reading";
    manga_edit_chapters.value = Number(active_manga.chapters_read || 0);

    if (Number(active_manga.total_chapters || 0) > 0) {
        manga_edit_chapters.max = String(active_manga.total_chapters);
    } else {
        manga_edit_chapters.removeAttribute("max");
    }

    manga_edit_score.value = active_manga.my_rating
        ? String(Math.round(Number(active_manga.my_rating)))
        : "";
    manga_edit_dialog.showModal();
}

manga_grid.addEventListener("click", (event) => {
    const target = event.target.closest("[data-manga-id]");
    if (!target) return;
    open_manga_editor(Number(target.dataset.mangaId));
});

manga_grid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest("[data-manga-id]");
    if (!target) return;
    event.preventDefault();
    open_manga_editor(Number(target.dataset.mangaId));
});

manga_edit_close.addEventListener("click", () => manga_edit_dialog.close());

manga_edit_form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!active_manga) return;

    manga_edit_save.disabled = true;
    manga_edit_save.textContent = "Saving...";

    try {
        let chapters_read = Math.max(
            0,
            Math.floor(Number(manga_edit_chapters.value || 0))
        );
        const total_chapters = Number(active_manga.total_chapters || 0);
        const user_status = manga_edit_status.value;

        if (total_chapters > 0) {
            chapters_read = Math.min(chapters_read, total_chapters);
            if (user_status === "completed") chapters_read = total_chapters;
        }

        const rating_value = manga_edit_score.value === ""
            ? null
            : Number(manga_edit_score.value);

        const {error} = await supabase
            .from("manga_library")
            .update({
                user_status,
                chapters_read,
                my_rating: rating_value,
                updated_at: new Date().toISOString()
            })
            .eq("id", active_manga.id);
        if (error) throw error;

        manga_edit_dialog.close();
        await load_manga_library();
        show_toast("Reading progress saved.");
    } catch (error) {
        console.error("Unable to save manga progress:", error);
        alert("Unable to save your reading progress. Please try again.");
    } finally {
        manga_edit_save.disabled = false;
        manga_edit_save.textContent = "Save progress";
    }
});

manga_remove_button.addEventListener("click", async () => {
    if (!active_manga) return;
    if (!window.confirm("Remove " + active_manga.title + " from your library?")) return;

    manga_remove_button.disabled = true;
    try {
        const title = active_manga.title;
        const {error} = await supabase
            .from("manga_library")
            .delete()
            .eq("id", active_manga.id);
        if (error) throw error;

        manga_edit_dialog.close();
        active_manga = null;
        await load_manga_library();
        show_toast(title + " removed.");
    } catch (error) {
        console.error("Unable to remove manga:", error);
        alert("Unable to remove that title. Please try again.");
    } finally {
        manga_remove_button.disabled = false;
    }
});

manga_add_button.addEventListener("click", () => {
    manga_add_search.value = "";
    manga_add_results.innerHTML = "";
    manga_add_candidates = [];
    manga_add_dialog.showModal();
    manga_add_search.focus();
});

manga_add_close.addEventListener("click", () => manga_add_dialog.close());

manga_add_search_form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = manga_add_search.value.trim();
    if (query.length < 2) return;

    manga_add_results.innerHTML =
        '<p class="recommendation-loading">Searching AniList...</p>';

    try {
        const search_anilist = httpsCallable(functions, "searchAniListManga");
        const result = await search_anilist({query});
        manga_add_candidates = result.data.results || [];

        manga_add_results.innerHTML = manga_add_candidates.length
            ? manga_add_candidates.map((item) => {
                const meta = [
                    item.media_kind,
                    item.total_chapters
                        ? item.total_chapters + " chapters"
                        : "chapter count unknown",
                    item.anilist_score
                        ? "★ " + item.anilist_score + "%"
                        : null
                ].filter(Boolean).join(" · ");

                return '<button class="anime-add-result" type="button" ' +
                    'data-anilist-add-id="' + item.anilist_id + '">' +
                    (item.poster_url
                        ? '<img src="' + manga_escape(item.poster_url) + '" alt="">'
                        : "") +
                    '<span><strong>' + manga_escape(item.title) + '</strong>' +
                    '<small>' + manga_escape(meta) + '</small></span>' +
                    '<b>＋ Add</b></button>';
            }).join("")
            : '<p class="recommendation-loading">No manga or manhwa found.</p>';
    } catch (error) {
        console.error("Unable to search AniList:", error);
        manga_add_results.innerHTML =
            '<p class="recommendation-loading">Unable to search AniList.</p>';
    }
});

manga_add_results.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-anilist-add-id]");
    if (!button) return;

    const item = manga_add_candidates.find(
        (entry) => entry.anilist_id === Number(button.dataset.anilistAddId)
    );
    if (!item) return;

    button.disabled = true;
    try {
        const {data: existing, error: existing_error} = await supabase
            .from("manga_library")
            .select("id")
            .eq("anilist_id", item.anilist_id)
            .limit(1);
        if (existing_error) throw existing_error;

        if (existing?.length) {
            show_toast(item.title + " is already in your library.");
            button.disabled = false;
            return;
        }

        const {error} = await supabase.from("manga_library").insert({
            anilist_id: item.anilist_id,
            title: item.title,
            title_romaji: item.title_romaji,
            title_native: item.title_native,
            synonyms: item.synonyms || [],
            country_of_origin: item.country_of_origin,
            media_kind: item.media_kind,
            format: item.format,
            publication_status: item.publication_status,
            user_status: "reading",
            chapters_read: 0,
            total_chapters: item.total_chapters,
            volumes_read: 0,
            total_volumes: item.total_volumes,
            anilist_score: item.anilist_score,
            poster_url: item.poster_url,
            banner_url: item.banner_url,
            description: item.description,
            genres: item.genres || [],
            site_url: item.site_url,
            start_date: item.start_date,
            end_date: item.end_date
        });
        if (error) throw error;

        manga_add_dialog.close();
        await load_manga_library();
        show_toast(item.title + " added to your reading library.");
    } catch (error) {
        console.error("Unable to add AniList manga:", error);
        alert("Unable to add this title. Please try again.");
        button.disabled = false;
    }
});

manga_search.addEventListener("input", render_manga_library);
manga_type_filter.addEventListener("change", render_manga_library);
manga_status_filter.addEventListener("change", render_manga_library);
manga_sort.addEventListener("change", render_manga_library);

manga_filter_clear.addEventListener("click", () => {
    manga_search.value = "";
    manga_type_filter.value = "";
    manga_status_filter.value = "";
    manga_sort.value = "mine-desc";
    render_manga_library();
});

manga_library_toggle.addEventListener("click", () => {
    const expanded = manga_grid.classList.toggle("expanded");
    manga_library_toggle.textContent = expanded
        ? "Show less"
        : "Show all manga";

    if (!expanded) {
        document.getElementById("manga_library").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
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
const mal_manga_sync_button = document.getElementById("mal_manga_sync_button");
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
            '<p class="recommendation-loading">Searching anime...</p>';

        try {
            const search_anilist =
                httpsCallable(functions, "searchAniListAnime");
            const result = await search_anilist({query});
            anime_add_candidates = result.data.results || [];

            anime_add_results.innerHTML = anime_add_candidates.length
                ? anime_add_candidates.map((item) => `
                    <button class="anime-add-result" type="button"
                            data-anilist-add-id="${item.anilist_id}">
                        ${item.poster_url ? `<img src="${item.poster_url}" alt="">` : ""}
                        <span><strong>${item.title}</strong><small>${
                            item.start_date ? item.start_date.slice(0, 4) : ""
                        }${item.anilist_score != null
                            ? ` · ⭐ ${Number(item.anilist_score)}%`
                            : ""}</small></span>
                        <b>＋ Watched</b>
                    </button>`).join("")
                : '<p class="recommendation-loading">No anime found.</p>';
        } catch (error) {
            console.error("Unable to search anime:", error);
            anime_add_results.innerHTML =
                '<p class="recommendation-loading">Unable to search anime.</p>';
        }
    });

    anime_add_results.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-anilist-add-id]");
        if (!button) return;

        const item = anime_add_candidates.find(
            (entry) =>
                entry.anilist_id ===
                Number(button.dataset.anilistAddId)
        );
        if (!item) return;

        button.disabled = true;

        try {
            const total_episodes =
                Number(item.total_episodes || 0);

            const row = {
                mal_id: null,
                anilist_id: item.anilist_id,
                kitsu_id: null,
                title: item.title,
                title_romaji: item.title_romaji,
                title_native: item.title_native,
                synonyms: item.synonyms || [],
                status: "completed",
                episodes_watched: total_episodes,
                total_episodes:
                    total_episodes || null,
                my_rating: null,
                poster_url: item.poster_url,
                media_type: item.media_type,
                start_date: item.start_date,
                finish_date: item.finish_date,
                average_episode_duration_ms:
                    Number(item.average_episode_duration_seconds || 0) ||
                    null,
                mal_score: null,
                anilist_score: item.anilist_score,
                kitsu_score: null,
                description: item.description,
                genres: item.genres || [],
                site_url: item.site_url,
                synced_at: new Date().toISOString()
            };

            const merged =
                await merge_anime_import_rows([row]);

            anime_add_dialog.close();

            const action = merged.added
                ? "added"
                : "updated";
            show_toast(
                item.title +
                " " + action +
                " in Stellaz as watched."
            );
        } catch (error) {
            console.error("Unable to add anime:", error);
            alert("Unable to add this anime to Stellaz.");
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
            mal_connection_label.textContent = "Connected";
            mal_connect_title.textContent = "MyAnimeList";
            mal_connect_description.textContent =
                "Connected to Stellaz. Sync anime or import manga/manhwa from your MyAnimeList account.";
            mal_connect_button.textContent = "Connected";
            mal_connect_button.disabled = true;
            mal_connect_button.dataset.connected = "true";
            mal_sync_header_button.hidden = false;
            mal_manga_sync_button.hidden = false;
            return;
        }

        document.getElementById("mal_connection_badge")?.setAttribute("hidden", "");
        mal_connection_label.textContent = "Not connected";
        mal_connect_title.textContent = "MyAnimeList";
        mal_connect_description.textContent =
            "Import both your anime and manga/manhwa lists, including ratings, statuses, and progress.";
        mal_connect_button.textContent = "Connect MyAnimeList";
        mal_connect_button.disabled = false;
        mal_connect_button.dataset.connected = "false";
        mal_sync_header_button.hidden = true;
        mal_manga_sync_button.hidden = true;
    } catch (error) {
        console.error("Unable to check MAL connection:", error);
    }
}


function normalize_anime_import_title(value) {
    return String(value || "")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function anime_import_aliases(item) {
    return [
        item.title,
        item.title_romaji,
        item.title_native,
        ...(item.synonyms || [])
    ]
        .map(normalize_anime_import_title)
        .filter(Boolean);
}

function anime_import_year(item) {
    const value = String(item.start_date || "");
    return /^\d{4}/.test(value) ? Number(value.slice(0, 4)) : null;
}

function find_existing_anime_for_import(row) {
    if (row.anilist_id) {
        const by_anilist = anime_library.find(
            (item) => Number(item.anilist_id) === Number(row.anilist_id)
        );
        if (by_anilist) return by_anilist;
    }

    if (row.mal_id) {
        const by_mal = anime_library.find(
            (item) => Number(item.mal_id) === Number(row.mal_id)
        );
        if (by_mal) return by_mal;
    }

    if (row.kitsu_id) {
        const by_kitsu = anime_library.find(
            (item) => Number(item.kitsu_id) === Number(row.kitsu_id)
        );
        if (by_kitsu) return by_kitsu;
    }

    const incoming_aliases = new Set(anime_import_aliases(row));
    if (!incoming_aliases.size) return null;
    const incoming_year = anime_import_year(row);

    return anime_library.find((item) => {
        const existing_year = anime_import_year(item);
        if (incoming_year && existing_year && incoming_year !== existing_year) {
            return false;
        }

        return anime_import_aliases(item).some(
            (alias) => incoming_aliases.has(alias)
        );
    }) || null;
}

function anime_import_patch(existing, row) {
    const patch = {
        status: row.status || existing.status,
        episodes_watched: Number(row.episodes_watched || 0),
        my_rating: row.my_rating ?? existing.my_rating ?? null,
        synced_at: new Date().toISOString()
    };

    [
        "mal_id", "anilist_id", "kitsu_id",
        "mal_score", "anilist_score", "kitsu_score",
        "total_episodes", "start_date", "finish_date",
        "average_episode_duration_ms"
    ].forEach((field) => {
        if (row[field] !== null && row[field] !== undefined &&
            row[field] !== "") {
            patch[field] = row[field];
        }
    });

    [
        "title_romaji", "title_native", "media_type", "poster_url",
        "description", "site_url"
    ].forEach((field) => {
        if (!existing[field] && row[field]) patch[field] = row[field];
    });

    const merged_synonyms = [
        ...(existing.synonyms || []),
        ...(row.synonyms || [])
    ].filter(Boolean);
    if (merged_synonyms.length) {
        patch.synonyms = [...new Set(merged_synonyms)].slice(0, 40);
    }

    const merged_genres = [
        ...(existing.genres || []),
        ...(row.genres || [])
    ].filter(Boolean);
    if (merged_genres.length) {
        patch.genres = [...new Set(merged_genres)];
    }

    return patch;
}

async function merge_anime_import_rows(rows) {
    if (!rows.length) return {added: 0, updated: 0};

    await load_anime_library();

    let added = 0;
    let updated = 0;

    for (const row of rows) {
        const existing = find_existing_anime_for_import(row);

        if (existing) {
            const patch = anime_import_patch(existing, row);
            const {error} = await supabase
                .from("anime")
                .update(patch)
                .eq("id", existing.id);
            if (error) throw error;
            Object.assign(existing, patch);
            updated += 1;
            continue;
        }

        const {data, error} = await supabase
            .from("anime")
            .insert(row)
            .select("*")
            .single();
        if (error) throw error;
        anime_library.push(data);
        added += 1;
    }

    await load_anime_library();
    return {added, updated};
}

function map_anilist_anime_import_row(item) {
    return {
        mal_id: null,
        anilist_id: item.anilist_id,
        title: item.title,
        title_romaji: item.title_romaji,
        title_native: item.title_native,
        synonyms: item.synonyms || [],
        status: item.status,
        episodes_watched: Number(item.episodes_watched || 0),
        total_episodes: item.total_episodes,
        my_rating: item.my_rating,
        poster_url: item.poster_url,
        media_type: item.media_type,
        start_date: item.start_date,
        finish_date: item.finish_date,
        average_episode_duration_ms:
            Number(item.average_episode_duration_ms || 0) || null,
        mal_score: null,
        anilist_score: item.anilist_score,
        description: item.description,
        genres: item.genres || [],
        site_url: item.site_url,
        synced_at: new Date().toISOString()
    };
}

async function sync_anilist_anime() {
    const original_text = anilist_anime_sync_button.textContent;
    anilist_anime_sync_button.disabled = true;
    anilist_anime_sync_button.textContent = "Importing...";

    try {
        const sync = httpsCallable(functions, "syncAniListAnimeList");
        const result = await sync();
        const anime = result.data.anime || [];
        const rows = anime.map(map_anilist_anime_import_row);

        const approved = await request_service_import_approval(
            "AniList",
            "anime",
            rows.length
        );
        if (!approved) return;

        const merged = await merge_anime_import_rows(rows);

        show_toast(
            anime.length + " AniList anime title" +
            (anime.length === 1 ? "" : "s") +
            " imported · " + merged.added + " added, " +
            merged.updated + " updated."
        );
    } catch (error) {
        console.error("Unable to import AniList anime:", error);
        const code = error?.code || "";
        if (code.includes("failed-precondition") ||
            code.includes("unauthenticated")) {
            await load_anilist_connection_status();
        }
        alert("Unable to import your AniList anime list. Please try again.");
    } finally {
        anilist_anime_sync_button.disabled = false;
        anilist_anime_sync_button.textContent = original_text;
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
        const external_score = item.mal_score != null
            ? "MAL: " + Number(item.mal_score).toFixed(2)
            : item.anilist_score != null
                ? "AniList: " + Number(item.anilist_score) + "%"
                : item.kitsu_score != null
                    ? "Kitsu: " + Number(item.kitsu_score).toFixed(1) + "%"
                    : "Rating: —";
        const personal_score = item.my_rating
            ? " · ★ " + Number(item.my_rating).toFixed(1) + "/10"
            : " · ★ —";
        const extra_class = index >= get_collapsed_movie_count()
            ? " library-extra"
            : "";

        return '<article class="movie-card anime-card' + extra_class + '">' +
            '<div class="movie-poster-wrap anime-edit-poster" data-anime-id="' +
            item.id + '" tabindex="0" role="button" title="Open anime">' +
            poster + '</div>' +
            '<h3 class="anime-edit-title" data-anime-id="' + item.id + '" tabindex="0" role="button" title="Open anime">' + item.title + '</h3><p>' +
            progress + " · " + external_score + personal_score + '</p></article>';
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

function anime_episode_duration_seconds(item) {
    const raw = Number(item?.average_episode_duration_ms || 0);
    if (raw <= 0) return 0;

    // The original MAL implementation stored seconds in this legacy column.
    // Older AniList/Kitsu imports briefly stored milliseconds instead.
    // Values above 100,000 cannot be a realistic episode duration in seconds,
    // so normalize those legacy millisecond rows defensively.
    return raw >= 100000 ? raw / 1000 : raw;
}

async function load_anime_library() {
    const {data, error} = await supabase.from("anime").select("*").order("title");
    if (error) throw error;

    anime_library = data || [];
    const watched_anime =
        anime_library.filter((item) => item.status === "completed");
    const watched_seconds = anime_library.reduce((total, item) => {
        const episode_seconds = anime_episode_duration_seconds(item);
        const watched_episodes = Number(item.episodes_watched || 0);
        return total + (episode_seconds * watched_episodes);
    }, 0);

    anime_count.textContent = watched_anime.length;
    anime_watch_time.textContent = watched_seconds > 0
        ? Math.round(watched_seconds / 3600) + "h"
        : "—";

    render_anime_library();
    await start_anime_library_backgrounds();

    const has_synced_anime = anime_library.length > 0;
    anime_sync_summary.hidden = !has_synced_anime;
    anime_sync_summary.textContent =
        watched_anime.length + " watched · " +
        anime_library.length + " total in library";
    anime_filters.hidden = !has_synced_anime;
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
    const source_score = active_anime.mal_score != null
        ? ` · ⭐ ${Number(active_anime.mal_score).toFixed(2)} MAL`
        : active_anime.anilist_score != null
            ? ` · ⭐ ${Number(active_anime.anilist_score)}% AniList`
            : active_anime.kitsu_score != null
                ? ` · ⭐ ${Number(active_anime.kitsu_score).toFixed(1)}% Kitsu`
                : "";
    anime_detail_meta.textContent = `${media_type}${source_score}`;
    const can_write_to_mal =
        Boolean(active_anime.mal_id) &&
        mal_connect_button?.dataset.connected === "true";

    anime_edit_save.textContent = can_write_to_mal
        ? "Save to MyAnimeList"
        : "Save in Stellaz";
    anime_detail_description.textContent =
        active_anime.description || "Loading description…";
    anime_detail_facts.innerHTML = [
        active_anime.total_episodes ?
            `Episodes: ${active_anime.total_episodes}` : null,
        active_anime.average_episode_duration_ms ?
            `Episode runtime: ~${Math.round(
                anime_episode_duration_seconds(active_anime) / 60
            )} min` : null,
        active_anime.start_date ? `Started: ${active_anime.start_date}` : null,
        active_anime.finish_date ? `Finished: ${active_anime.finish_date}` : null
    ].filter(Boolean).map((fact) => `<span>${fact}</span>`).join("");

    render_anime_episode_picker();
    anime_edit_dialog.showModal();

    if (active_anime.mal_id &&
        mal_connect_button?.dataset.connected === "true") {
        try {
            const get_details = httpsCallable(functions, "getMALAnimeDetails");
            const result = await get_details({anime_id: active_anime.mal_id});
            if (!active_anime || active_anime.id !== opened_anime_id) return;

            const data = result.data;
            anime_detail_description.textContent =
                data.synopsis || active_anime.description ||
                "No description available.";
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
                active_anime.description ||
                "Additional anime details could not be loaded.";
        }
    } else {
        const facts = [
            active_anime.media_type ? `Type: ${active_anime.media_type.replaceAll("_", " ")}` : null,
            active_anime.total_episodes ? `Episodes: ${active_anime.total_episodes}` : null,
            active_anime.start_date ? `Aired: ${active_anime.start_date}` : null,
            active_anime.finish_date ? `Ended: ${active_anime.finish_date}` : null,
            active_anime.genres?.length ? `Genres: ${active_anime.genres.join(", ")}` : null,
            active_anime.anilist_score != null ?
                `AniList score: ${Number(active_anime.anilist_score)}%` : null
        ].filter(Boolean);
        anime_detail_description.textContent =
            active_anime.description || "No description available.";
        anime_detail_facts.innerHTML =
            facts.map((fact) => `<span>${fact}</span>`).join("");
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
        const score = anime_edit_score.value === ""
            ? null
            : Number(anime_edit_score.value);

        const can_write_to_mal =
            Boolean(active_anime.mal_id) &&
            mal_connect_button?.dataset.connected === "true";

        if (can_write_to_mal) {
            const update_mal = httpsCallable(
                functions,
                "updateMALAnimeStatus"
            );
            const result = await update_mal({
                anime_id: active_anime.mal_id,
                status: anime_edit_status.value,
                episodes_watched: selected_anime_episode,
                total_episodes: Number(active_anime.total_episodes || 0),
                score
            });
            if (result.data?.status !== anime_edit_status.value) {
                throw new Error(
                    "MyAnimeList did not save the selected status."
                );
            }

            anime_edit_dialog.close();
            await sync_mal_anime();
            show_toast("Updated on MyAnimeList.");
        } else {
            let watched = selected_anime_episode;
            const total = Number(active_anime.total_episodes || 0);
            if (anime_edit_status.value === "completed" && total > 0) {
                watched = total;
            }

            const {error} = await supabase
                .from("anime")
                .update({
                    status: anime_edit_status.value,
                    episodes_watched: watched,
                    my_rating: score,
                    synced_at: new Date().toISOString()
                })
                .eq("id", active_anime.id);
            if (error) throw error;

            anime_edit_dialog.close();
            await load_anime_library();
            show_toast("Anime progress saved in Stellaz.");
        }
    } catch (error) {
        console.error("Unable to update anime:", error);
        alert("Unable to save this anime. Please try again.");
    } finally {
        anime_edit_save.disabled = false;
        anime_edit_save.textContent =
            active_anime?.mal_id &&
            mal_connect_button?.dataset.connected === "true"
                ? "Save to MyAnimeList"
                : "Save in Stellaz";
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

async function sync_mal_anime({confirm_import = true} = {}) {
    const original_text = mal_sync_header_button.textContent;
    mal_sync_header_button.disabled = true;
    mal_sync_header_button.textContent = "Syncing...";

    try {
        const sync = httpsCallable(functions, "syncMALAnimeList");
        const result = await sync();
        const anime = result.data.anime || [];
        const rows = anime.map((item) => ({
            mal_id: item.mal_id,
            anilist_id: null,
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
            average_episode_duration_ms:
                item.average_episode_duration_ms,
            mal_score: item.mal_score,
            anilist_score: null,
            synced_at: new Date().toISOString()
        }));

        if (confirm_import) {
            const approved = await request_service_import_approval(
                "MyAnimeList",
                "anime",
                rows.length
            );
            if (!approved) return;
        }

        const merged = await merge_anime_import_rows(rows);

        show_toast(
            anime.length + " MyAnimeList anime title" +
            (anime.length === 1 ? "" : "s") +
            " synced · " + merged.added + " added, " +
            merged.updated + " updated."
        );
    } catch (error) {
        console.error("Unable to sync MAL anime:", error);
        alert("Unable to sync your MyAnimeList anime. Please try again.");
    } finally {
        mal_sync_header_button.disabled = false;
        mal_sync_header_button.textContent = original_text;
    }
}

async function begin_mal_connection() {
    remember_connected_services_return();
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
    if (params.get("oauth") === "anilist" ||
        params.get("oauth") === "tmdb") return;

    const code = params.get("code");
    const returned_state = params.get("state");
    if (!code) return;

    const expected_state = sessionStorage.getItem("mal_oauth_state");
    const code_verifier = sessionStorage.getItem("mal_code_verifier");

    // Ignore OAuth callbacks that do not belong to the MAL flow.
    if (!expected_state || !code_verifier) return;

    history.replaceState({}, document.title, window.location.pathname);

    if (returned_state !== expected_state) {
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

mal_sync_header_button.addEventListener("click", () =>
    sync_mal_anime()
);

async function sync_mal_manga() {
    mal_manga_sync_button.disabled = true;
    const original_text = mal_manga_sync_button.textContent;
    mal_manga_sync_button.textContent = "Importing...";

    try {
        const sync = httpsCallable(functions, "syncMALMangaList");
        const result = await sync();
        const rows = result.data.manga || [];

        const approved = await request_service_import_approval(
            "MyAnimeList",
            "manga",
            rows.length
        );
        if (!approved) return;

        const merged = await merge_manga_import_rows(rows);

        show_toast(
            rows.length + " MyAnimeList manga title" +
            (rows.length === 1 ? "" : "s") +
            " imported · " + merged.added + " added, " +
            merged.updated + " updated."
        );
    } catch (error) {
        console.error("Unable to import MAL manga:", error);
        alert("Unable to import your MyAnimeList manga list. Please try again.");
    } finally {
        mal_manga_sync_button.disabled = false;
        mal_manga_sync_button.textContent = original_text;
    }
}

mal_manga_sync_button.addEventListener("click", sync_mal_manga);

mal_connect_button.addEventListener("click", async () => {
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

//? ---------------------------------
//* ----- TMDB Imports -------------
//? ---------------------------------
//#region
function find_existing_movie_for_tmdb(item) {
    if (item.tmdb_id) {
        const by_tmdb = movie_library.find(
            (movie) =>
                Number(movie.tmdb_id) === Number(item.tmdb_id)
        );
        if (by_tmdb) return by_tmdb;
    }

    return movie_library.find((movie) =>
        same_library_title(movie, item)
    ) || null;
}

function find_existing_show_for_tmdb(item) {
    if (item.tmdb_id) {
        const by_tmdb = show_library.find(
            (show) =>
                Number(show.tmdb_id) === Number(item.tmdb_id)
        );
        if (by_tmdb) return by_tmdb;
    }

    return show_library.find((show) =>
        same_library_title(show, item)
    ) || null;
}

async function merge_tmdb_movies(rows) {
    await load_movie_library();

    let added = 0;
    let updated = 0;

    for (const item of rows) {
        const existing = find_existing_movie_for_tmdb(item);

        if (existing) {
            const patch = {};

            if (item.tmdb_id) {
                patch.tmdb_id = Number(item.tmdb_id);
            }
            if (item.my_rating != null) {
                patch.my_rating = Number(item.my_rating);
            }
            if (item.tmdb_rating != null) {
                patch.tmdb_rating = Number(item.tmdb_rating);
            }
            if (!existing.poster_url && item.poster_url) {
                patch.poster_url = item.poster_url;
            }

            if (item.status === "watched") {
                patch.status = "watched";
            } else if (existing.status !== "watched") {
                patch.status = "watch_later";
            }

            if (Object.keys(patch).length) {
                const {error} = await supabase
                    .from("movies")
                    .update(patch)
                    .eq("id", existing.id);
                if (error) throw error;

                Object.assign(existing, patch);
                updated += 1;
            }
            continue;
        }

        if (!item.title || !Number(item.year)) continue;

        const row = {
            title: item.title,
            year: Number(item.year),
            status: item.status === "watched"
                ? "watched"
                : "watch_later",
            ...(item.tmdb_id
                ? {tmdb_id: Number(item.tmdb_id)}
                : {}),
            ...(item.my_rating != null
                ? {my_rating: Number(item.my_rating)}
                : {}),
            ...(item.tmdb_rating != null
                ? {tmdb_rating: Number(item.tmdb_rating)}
                : {}),
            ...(item.poster_url
                ? {poster_url: item.poster_url}
                : {})
        };

        const {error} = await supabase
            .from("movies")
            .insert(row);
        if (error) throw error;
        added += 1;
    }

    await load_movie_library();
    return {added, updated};
}

async function merge_tmdb_shows(rows) {
    await load_show_library();

    let added = 0;
    let updated = 0;

    for (const item of rows) {
        const existing = find_existing_show_for_tmdb(item);

        if (existing) {
            const patch = {};

            if (item.tmdb_id) {
                patch.tmdb_id = Number(item.tmdb_id);
            }
            if (item.my_rating != null) {
                patch.my_rating = Number(item.my_rating);
            }
            if (item.tmdb_rating != null) {
                patch.tmdb_rating = Number(item.tmdb_rating);
            }
            if (!existing.poster_url && item.poster_url) {
                patch.poster_url = item.poster_url;
            }

            if (item.status === "watched") {
                patch.status = "watched";
            } else if (existing.status !== "watched") {
                patch.status = "watch_later";
            }

            if (Object.keys(patch).length) {
                const {error} = await supabase
                    .from("tv_shows")
                    .update(patch)
                    .eq("id", existing.id);
                if (error) throw error;

                Object.assign(existing, patch);
                updated += 1;
            }
            continue;
        }

        if (!item.title || !Number(item.year)) continue;

        const row = {
            title: item.title,
            year: Number(item.year),
            status: item.status === "watched"
                ? "watched"
                : "watch_later",
            ...(item.tmdb_id
                ? {tmdb_id: Number(item.tmdb_id)}
                : {}),
            ...(item.my_rating != null
                ? {my_rating: Number(item.my_rating)}
                : {}),
            ...(item.tmdb_rating != null
                ? {tmdb_rating: Number(item.tmdb_rating)}
                : {}),
            ...(item.poster_url
                ? {poster_url: item.poster_url}
                : {})
        };

        const {error} = await supabase
            .from("tv_shows")
            .insert(row);
        if (error) throw error;
        added += 1;
    }

    await load_show_library();
    return {added, updated};
}

async function sync_tmdb_movies() {
    const original_text = tmdb_movie_sync_button.textContent;
    tmdb_movie_sync_button.disabled = true;
    tmdb_movie_sync_button.textContent = "Checking...";

    try {
        const sync = httpsCallable(functions, "syncTMDBMovies");
        const result = await sync();
        const rows = result.data.movies || [];

        const approved = await request_service_import_approval(
            "TMDB",
            "movie",
            rows.length
        );
        if (!approved) return;

        tmdb_movie_sync_button.textContent = "Importing...";
        const merged = await merge_tmdb_movies(rows);

        show_toast(
            rows.length + " TMDB movie " +
            (rows.length === 1 ? "entry" : "entries") +
            " imported · " + merged.added + " added, " +
            merged.updated + " updated."
        );
    } catch (error) {
        console.error("Unable to import TMDB movies:", error);
        const code = error?.code || "";
        if (code.includes("failed-precondition")) {
            await load_tmdb_connection_status();
        }
        alert("Unable to import your TMDB movies. Please try again.");
    } finally {
        tmdb_movie_sync_button.disabled = false;
        tmdb_movie_sync_button.textContent = original_text;
    }
}

async function sync_tmdb_shows() {
    const original_text = tmdb_show_sync_button.textContent;
    tmdb_show_sync_button.disabled = true;
    tmdb_show_sync_button.textContent = "Checking...";

    try {
        const sync = httpsCallable(functions, "syncTMDBShows");
        const result = await sync();
        const rows = result.data.shows || [];

        const approved = await request_service_import_approval(
            "TMDB",
            "TV show",
            rows.length
        );
        if (!approved) return;

        tmdb_show_sync_button.textContent = "Importing...";
        const merged = await merge_tmdb_shows(rows);

        show_toast(
            rows.length + " TMDB TV show " +
            (rows.length === 1 ? "entry" : "entries") +
            " imported · " + merged.added + " added, " +
            merged.updated + " updated."
        );
    } catch (error) {
        console.error("Unable to import TMDB shows:", error);
        const code = error?.code || "";
        if (code.includes("failed-precondition")) {
            await load_tmdb_connection_status();
        }
        alert("Unable to import your TMDB TV shows. Please try again.");
    } finally {
        tmdb_show_sync_button.disabled = false;
        tmdb_show_sync_button.textContent = original_text;
    }
}

tmdb_movie_sync_button.addEventListener("click", sync_tmdb_movies);
tmdb_show_sync_button.addEventListener("click", sync_tmdb_shows);
//#endregion


//? ------------------------------
//* ----- Plex Connection --------
//? ------------------------------
//#region
const plex_connect_title = document.getElementById("plex_connect_title");
const plex_connect_description = document.getElementById("plex_connect_description");
const plex_connect_button = document.getElementById("plex_connect_button");

async function load_plex_connection_status() {
    if (!plex_connect_button) return;

    const plex_connection_label =
        document.getElementById("plex_connection_label");

    try {
        const result = await httpsCallable(functions, "getPlexConnectionStatus")();

        if (result.data.connected) {
            document.getElementById("plex_connection_badge")?.removeAttribute("hidden");
            document.getElementById("plex_import_button")?.removeAttribute("hidden");
            plex_connect_title.textContent = "Plex";
            plex_connection_label.textContent =
                result.data.username
                    ? "Connected as " + result.data.username
                    : "Connected";
            plex_connect_description.textContent =
                "Connected to Stellaz. Import to refresh movie and TV ratings, watched titles, and episode progress.";
            plex_connect_button.textContent = "Connected";
            plex_connect_button.disabled = true;
            return;
        }

        document.getElementById("plex_connection_badge")?.setAttribute("hidden", "");
        document.getElementById("plex_import_button")?.setAttribute("hidden", "");
        plex_connect_title.textContent = "Plex";
        plex_connection_label.textContent = "Not connected";
        plex_connect_description.textContent =
            "Import movie and TV ratings, watched titles, and episode progress from Plex.";
        plex_connect_button.textContent = "Connect Plex";
        plex_connect_button.disabled = false;
    } catch (error) {
        console.error("Unable to check Plex connection:", error);
    }
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

async function auto_sync_plex_activity() {
    try {
        // Use the exact same Plex snapshot as the manual Import Plex dialog.
        const result = await httpsCallable(functions, "getPlexRatedTitles")();
        const data = result.data || {};
        const rated_movies = (data.movies || []).filter((item) =>
            item.rating != null && Number(item.rating) > 0);
        const rated_shows = (data.shows || []).filter((item) =>
            item.rating != null && Number(item.rating) > 0);

        const added_titles = [];
        const failed_titles = [];

        // Insert rated missing titles one at a time. One bad Plex item must not
        // prevent another rated title (for example Mad Men) from being added.
        for (const item of rated_movies) {
            const existing = movie_library.find((movie) => same_library_title(movie, item));
            if (existing) {
                const patch = {my_rating: Number(item.rating)};
                const {error} = await supabase.from("movies").update(patch).eq("id", existing.id);
                if (error) failed_titles.push(item.title);
                continue;
            }
            const row = {
                title: item.title,
                year: item.year,
                ...(item.genres?.length ? {genres: item.genres} : {}),
                ...(item.runtime_minutes ? {runtime_minutes: item.runtime_minutes} : {}),
                status: "watched",
                my_rating: Number(item.rating)
            };
            const {error} = await supabase.from("movies").insert(row);
            if (error) {
                failed_titles.push(item.title);
                console.error("Unable to auto-add rated Plex movie:", item.title, error);
            } else {
                added_titles.push(item.title);
            }
        }

        for (const item of rated_shows) {
            const existing = show_library.find((show) => same_library_title(show, item));
            if (existing) {
                const patch = {my_rating: Number(item.rating)};
                const {error} = await supabase.from("tv_shows").update(patch).eq("id", existing.id);
                if (error) failed_titles.push(item.title);
                continue;
            }
            const row = {
                title: item.title,
                year: item.year,
                ...(item.genres?.length ? {genres: item.genres} : {}),
                ...(item.average_episode_runtime_minutes ?
                    {average_episode_runtime_minutes: item.average_episode_runtime_minutes} : {}),
                status: "watched",
                my_rating: Number(item.rating)
            };
            const {error} = await supabase.from("tv_shows").insert(row);
            if (error) {
                failed_titles.push(item.title);
                console.error("Unable to auto-add rated Plex show:", item.title, error);
            } else {
                added_titles.push(item.title);
            }
        }

        console.log("Plex rated titles:", {
            movies: rated_movies.map((item) => [item.title, item.rating]),
            shows: rated_shows.map((item) => [item.title, item.rating]),
            added: added_titles,
            failed: failed_titles
        });

        if (added_titles.length || rated_movies.length || rated_shows.length) {
            await Promise.all([load_movie_library(), load_show_library()]);
        }
        if (added_titles.length) {
            show_toast(`Added from Plex ratings: ${added_titles.join(", ")}`);
        }
    } catch (error) {
        console.error("Unable to auto-sync Plex ratings:", error);
    }
}

async function sync_plex_episode_progress() {
    try {
        if (!show_library.length) return;

        const result = await httpsCallable(functions, "getPlexWatchedEpisodes")({
            shows: show_library.map((show) => ({
                title: show.title,
                year: show.year
            }))
        });
        const episodes = result.data?.episodes || [];
        if (!episodes.length) return;

        const shows_by_title = new Map(
            show_library.map((show) => [
                String(show.title || "").trim().toLowerCase(),
                show
            ])
        );
        const rows = episodes.flatMap((episode) => {
            const show = shows_by_title.get(
                String(episode.show_title || "").trim().toLowerCase()
            );
            if (!show) return [];
            return [{
                tv_show_id: show.id,
                season_number: Number(episode.season),
                episode_number: Number(episode.episode),
                watched: true
            }];
        });
        if (!rows.length) return;

        const {error} = await supabase.from("tv_episode_progress")
            .upsert(rows, {
                onConflict: "user_id,tv_show_id,season_number,episode_number"
            });
        if (error) throw error;

        // Mark a season complete only when every episode returned by TMDB for
        // that season is watched. Episode progress itself is always synced.
        const touched = new Map();
        for (const row of rows) {
            const key = `${row.tv_show_id}:${row.season_number}`;
            if (!touched.has(key)) touched.set(key, {
                show_id: row.tv_show_id,
                season: row.season_number
            });
        }
        for (const item of touched.values()) {
            const show = show_library.find((entry) => entry.id === item.show_id);
            if (!show) continue;
            try {
                const seasons = await httpsCallable(functions, "getTVShowSeasons")({
                    title: show.title,
                    year: show.year
                });
                const season = (seasons.data?.seasons || []).find(
                    (entry) => Number(entry.season_number) === item.season
                );
                if (!season?.episode_count) continue;
                const watched_count = rows.filter((row) =>
                    row.tv_show_id === item.show_id &&
                    row.season_number === item.season
                ).length;
                if (watched_count >= Number(season.episode_count)) {
                    const {error: season_error} = await supabase
                        .from("tv_season_progress")
                        .upsert({
                            tv_show_id: item.show_id,
                            season_number: item.season,
                            watched: true
                        }, {
                            onConflict: "user_id,tv_show_id,season_number"
                        });
                    if (season_error) throw season_error;
                }
            } catch (error) {
                console.warn("Unable to update Plex season completion:", show.title, error);
            }
        }

        console.log(`Synced ${rows.length} watched Plex episodes to Stellaz.`);
        await load_show_library();
    } catch (error) {
        console.error("Unable to sync Plex episode progress:", error);
    }
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
        const rated_new_titles = [...new_movies, ...new_shows]
            .filter((item) => item.rating != null && Number(item.rating) > 0);
        const ratings_on_new_titles = rated_new_titles.length;
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
        plex_import_summary.textContent = `Found ${data.movies.length} movies and ${data.shows.length} TV shows on ${data.server}.` + (rated_new_titles.length ? ` Rated missing: ${rated_new_titles.map((item) => item.title).join(", ")}.` : "");
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
plex_import_button?.addEventListener("click", () => {
    connected_services_dialog?.close();
    open_plex_import_preview();
});
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
        remember_connected_services_return();
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

        // setSupabaseRole changes Firebase custom claims. Force-refresh the
        // Firebase token before Supabase is allowed to make its first request.
        // On a brand-new login the old token can otherwise briefly remain
        // cached and Supabase sees the first library request as unauthorized.
        await user.getIdToken(true);
        await user.getIdToken(false);

        console.log("Supabase role added successfully!");
        console.log(result.data.message);
        console.log("Firebase UID:", user.uid);

        await finish_plex_connection();
        await load_plex_connection_status();
        // Plex auto-import depends only on the Stellaz movie/show libraries.
        // Start it as soon as those are ready. Anime/MAL/background failures
        // must never prevent rated Plex titles from being imported.
        await Promise.all([
            load_movie_library(),
            load_show_library()
        ]);
        auto_sync_plex_activity().catch((error) =>
            console.error("Unable to auto-sync Plex ratings:", error)
        );
        sync_plex_episode_progress().catch((error) =>
            console.error("Unable to auto-sync Plex episode progress:", error)
        );

        // Anime/MAL startup is independent from Plex.
        await Promise.allSettled([
            load_mal_connection_status(),
            load_anilist_connection_status(),
            load_kitsu_connection_status(),
            load_tmdb_connection_status(),
            load_anime_library(),
            load_manga_library()
        ]);
        await finish_mal_connection();
        await finish_anilist_connection();
        await finish_tmdb_connection();
        reopen_connected_services_if_requested();

        const requested_library =
            new URLSearchParams(window.location.search).get("library");
        const allowed_libraries = [
            "Movies",
            "TV Shows",
            "Anime",
            "Manga / Manhwa"
        ];

        if (allowed_libraries.includes(requested_library)) {
            show_entertainment_category(requested_library);
        } else {
            // Movies are the default visible category on first load.
            load_movie_recommendations(movie_library);
            load_release_rows("movie");
        }
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
const manga_library_panel = document.getElementById("manga_library");
const recommendations_panel = document.getElementById("recommendations_panel");
const new_release_panel = document.getElementById("new_release_panel");
const upcoming_release_panel = document.getElementById("upcoming_release_panel");

function show_entertainment_category(category) {
    const showing_movies = category === "Movies";
    const showing_shows = category === "TV Shows";
    const showing_anime = category === "Anime";
    const showing_manga = category === "Manga / Manhwa";

    document.documentElement.classList.toggle(
        "anime-category-active",
        showing_anime
    );

    movie_library_panel.classList.toggle("category-panel-hidden", !showing_movies);
    show_library_panel.classList.toggle("category-panel-hidden", !showing_shows);
    anime_library_panel.classList.toggle("category-panel-hidden", !showing_anime);
    manga_library_panel.classList.toggle("category-panel-hidden", !showing_manga);

    [recommendations_panel, new_release_panel, upcoming_release_panel]
        .forEach((panel) =>
            panel.classList.toggle("category-panel-hidden", showing_manga)
        );

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
            card.dataset.library === "Anime" ||
            card.dataset.library === "Manga / Manhwa") {
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
