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


// Supabase uses the Firebase ID token supplied by firebase_config.js.
// A cold page load can briefly race Firebase token restoration/refresh,
// which previously made the first PostgREST request fail with 401 even
// though a normal reload immediately worked.
function supabase_auth_error(error) {
    const value = [
        error?.code,
        error?.message,
        error?.details,
        error?.hint
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return value.includes("401") ||
        value.includes("unauthorized") ||
        value.includes("jwt") ||
        value.includes("pgrst301") ||
        value.includes("pgrst303");
}

function wait(milliseconds) {
    return new Promise((resolve) =>
        window.setTimeout(resolve, milliseconds)
    );
}

async function supabase_read_with_auth_retry(query) {
    let result = await query();

    if (!result?.error ||
        !auth.currentUser ||
        !supabase_auth_error(result.error)) {
        return result;
    }

    console.warn(
        "Supabase authentication was not ready on the first request. Retrying."
    );

    await auth.currentUser.getIdToken(true);
    await wait(180);

    result = await query();

    if (result?.error &&
        supabase_auth_error(result.error)) {
        await auth.currentUser.getIdToken(true);
        await wait(420);
        result = await query();
    }

    return result;
}

async function prepare_supabase_access(user) {
    let token_result =
        await user.getIdTokenResult(false);

    if (token_result.claims.role !== "authenticated") {
        const set_supabase_role =
            httpsCallable(
                functions,
                "setSupabaseRole"
            );
        const result =
            await set_supabase_role();

        token_result =
            await user.getIdTokenResult(true);

        if (token_result.claims.role !== "authenticated") {
            throw new Error(
                "Supabase authentication claim was not available after refresh."
            );
        }

        console.log(
            "Supabase role added successfully!"
        );
        console.log(
            result.data.message
        );
    } else {
        // Ensure Firebase has a usable token before any Supabase query.
        await user.getIdToken(false);
        console.log(
            "Supabase authentication already ready."
        );
    }

    console.log(
        "Firebase UID:",
        user.uid
    );
}



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
    return Number(
        item.tmdb_id ||
        item.mal_id ||
        item.anilist_id ||
        item.id
    );
}

function create_release_card(item) {
    const date = item.release_date
        ? new Date(`${item.release_date}T00:00:00`).toLocaleDateString(
            undefined,
            {year: "numeric", month: "short", day: "numeric"}
        )
        : "Date TBA";
    const rating =
        release_rows_type === "manga" &&
        item.anilist_score != null
            ? ` · ⭐ ${Number(item.anilist_score)}%`
            : item.rating
                ? ` · ⭐ ${Number(item.rating).toFixed(1)}`
                : "";
    const controls =
        release_rows_type === "anime"
            ? `
        <button class="recommendation-watched" type="button"
                data-release-action="watched" title="Add as watched"
                aria-label="Add ${item.title} as watched">✓</button>`
            : release_rows_type === "manga"
                ? `
        <button class="recommendation-watch-later" type="button"
                data-release-action="manga_reading" title="Start reading"
                aria-label="Add ${item.title} to your reading library">＋</button>`
                : `
        <button class="recommendation-watched" type="button"
                data-release-action="watched" title="Add as watched"
                aria-label="Add ${item.title} as watched">✓</button>
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
                         loading="lazy" decoding="async" fetchpriority="low">
                </button>
                <div class="explore-card-overlay">
                    <strong>${item.title}</strong>
                    <span>${date}${rating}</span>
                </div>
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
            : type === "manga"
                ? [
                    "Newly Released Manga / Manhwa",
                    "Upcoming Manga / Manhwa"
                ]
                : [
                    "Newly Released Movies",
                    "Upcoming Movie Releases"
                ];

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

        const visible_new_releases =
            newly_released;
        const visible_upcoming =
            upcoming;

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
    if (release_rows_type === "manga" &&
        action === "manga_reading") {
        await add_global_manga_reading(
            item,
            button
        );
        return;
    }

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
const recommendation_count =
    document.querySelector("#recommendations_panel .recommendation-count");
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
    return Number(
        active_recommendation_type === "anime"
            ? (item.mal_id || item.anilist_id)
            : active_recommendation_type === "manga"
                ? item.anilist_id
                : item.tmdb_id
    );
}

function populate_recommendation_genres() {
    if (active_recommendation_type === "anime" ||
        active_recommendation_type === "manga") {
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
    const recommendation_limit = 30;
    visible_recommendations = filtered.slice(0, recommendation_limit);
    render_recommendations();
}

const recommendation_dialog = document.getElementById("recommendation_dialog");
const recommendation_dialog_close = document.getElementById("recommendation_dialog_close");
const recommendation_dialog_poster = document.getElementById("recommendation_dialog_poster");
const recommendation_dialog_watch = document.getElementById("recommendation_dialog_watch");
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
        return item.because_of?.length
            ? `Because you liked ${item.because_of.join(" and ")}`
            : "Recommended from your anime history";
    }

    if (active_recommendation_type === "manga") {
        return item.because_of?.length
            ? `Because you liked ${item.because_of.join(" and ")}`
            : "Recommended from your manga / manhwa history";
    }

    return item.because_of?.length
        ? `Because you liked ${item.because_of.join(" and ")}`
        : `Picked from your ${active_recommendation_type} history`;
}

function create_recommendation_card(item) {
    const rating =
        active_recommendation_type === "manga" &&
        item.anilist_score != null
            ? ` · ⭐ ${Number(item.anilist_score)}%`
            : item.tmdb_rating !== null &&
                item.tmdb_rating !== undefined
                ? ` · ⭐ ${Number(item.tmdb_rating).toFixed(1)}`
                : "";
    const controls =
        active_recommendation_type === "anime"
            ? `
        <button class="recommendation-watched" type="button"
                data-rec-action="watched" title="Add as watched"
                aria-label="Add ${item.title} as watched">✓</button>`
            : active_recommendation_type === "manga"
                ? `
        <button class="recommendation-watch-later" type="button"
                data-rec-action="manga_reading" title="Start reading"
                aria-label="Add ${item.title} to your reading library">＋</button>`
                : `
        <button class="recommendation-watched" type="button"
                data-rec-action="watched" title="Add as watched"
                aria-label="Add ${item.title} as watched">✓</button>
        <button class="recommendation-dismiss" type="button"
                data-rec-action="not_interested" title="Not interested"
                aria-label="Not interested in ${item.title}">×</button>
        <button class="recommendation-watch-later" type="button"
                data-rec-action="watch_later" title="Add to Watch Later"
                aria-label="Add ${item.title} to Watch Later">＋</button>`;

    const display_year =
        item.year ||
        (item.start_date
            ? String(item.start_date).slice(0, 4)
            : "");

    return `
        <article class="recommendation-card"
                 data-recommendation-id="${recommendation_id(item)}">
            <div class="recommendation-poster-wrap">
                <button class="recommendation-open" type="button"
                        data-rec-open aria-label="View details for ${item.title}">
                    <img class="recommendation-poster" src="${item.poster_url}"
                         alt="${item.title} poster" loading="lazy" decoding="async" fetchpriority="low">
                </button>
                <div class="explore-card-overlay">
                    <strong>${item.title}</strong>
                    <span>${display_year}${rating}</span>
                    <small>${recommendation_reason(item)}</small>
                </div>
                ${controls}
                <button class="recommendation-refresh" type="button"
                        title="Show me something else"
                        aria-label="Replace ${item.title} with another suggestion">↻</button>
            </div>
            <button class="recommendation-title-button" type="button"
                    data-rec-open title="${item.title}">${item.title}</button>
            <p>${display_year}${rating}</p>
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
    if (type === "anime" ||
        type === "manga") return;

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
    const library =
        active_recommendation_type === "movie"
            ? movie_library
            : active_recommendation_type === "show"
                ? show_library
                : active_recommendation_type === "anime"
                    ? anime_library
                    : active_recommendation_type === "manga"
                        ? manga_library
                        : [];

    recommendation_pool = items.filter((item) =>
        !library.some((entry) => {
            if (active_recommendation_type === "anime") {
                if (item.anilist_id &&
                    entry.anilist_id &&
                    Number(entry.anilist_id) ===
                    Number(item.anilist_id)) {
                    return true;
                }

                if (item.mal_id &&
                    entry.mal_id &&
                    Number(entry.mal_id) ===
                    Number(item.mal_id)) {
                    return true;
                }

                if (item.kitsu_id &&
                    entry.kitsu_id &&
                    Number(entry.kitsu_id) ===
                    Number(item.kitsu_id)) {
                    return true;
                }
            }

            if (active_recommendation_type === "manga" &&
                item.anilist_id &&
                entry.anilist_id) {
                return Number(entry.anilist_id) ===
                    Number(item.anilist_id);
            }

            const same_title =
                String(entry.title || "")
                    .toLowerCase() ===
                String(item.title || "")
                    .toLowerCase();

            if (active_recommendation_type === "movie" ||
                active_recommendation_type === "show") {
                return same_title &&
                    Number(entry.year) ===
                    Number(item.year);
            }

            return same_title;
        })
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
            httpsCallable(functions, "getAnimeRecommendations");
        const result = await get_recommendations({
            seeds: seeds.map((item) => ({
                mal_id: item.mal_id,
                anilist_id: item.anilist_id,
                title: item.title,
                my_rating: item.my_rating
            })),
            library_mal_ids: anime
                .map((item) => item.mal_id)
                .filter(Boolean),
            library_anilist_ids: anime
                .map((item) => item.anilist_id)
                .filter(Boolean),
            library_titles: anime
                .map((item) => item.title)
        });
        await finish_recommendation_load(result.data.recommendations || []);
    } catch (error) {
        console.error("Unable to load anime recommendations:", error);
        recommendation_count.textContent = "—";
        recommendation_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load anime recommendations.</p>';
    }
}


async function load_manga_recommendations(manga) {
    active_recommendation_type = "manga";
    recommendation_title.textContent =
        "Recommended Manga / Manhwa For You";
    recommendation_grid.innerHTML =
        '<p class="recommendation-loading">Finding manga and manhwa for you...</p>';

    const candidates = [...manga]
        .filter((item) =>
            item.user_status === "reading" ||
            item.user_status === "completed" ||
            Number(item.my_rating || 0) > 0
        )
        .sort((a, b) =>
            Number(b.my_rating || 0) -
            Number(a.my_rating || 0)
        );

    const seeds = candidates.slice(0, 8);

    if (!seeds.length) {
        recommendation_count.textContent = "0 PICKS";
        recommendation_grid.innerHTML =
            '<p class="recommendation-loading">Read or rate some manga or manhwa to get recommendations.</p>';
        return;
    }

    try {
        const get_recommendations =
            httpsCallable(
                functions,
                "getAniListMangaRecommendations"
            );
        const result =
            await get_recommendations({
                seeds: seeds.map((item) => ({
                    anilist_id:
                        item.anilist_id,
                    mal_id:
                        item.mal_id,
                    title:
                        item.title,
                    my_rating:
                        item.my_rating
                })),
                library_ids:
                    manga
                        .map(
                            (item) =>
                                item.anilist_id
                        )
                        .filter(Boolean),
                library_mal_ids:
                    manga
                        .map(
                            (item) =>
                                item.mal_id
                        )
                        .filter(Boolean),
                library_titles:
                    manga.map(
                        (item) =>
                            item.title
                    )
            });

        await finish_recommendation_load(
            result.data.recommendations ||
            []
        );
    } catch (error) {
        console.error(
            "Unable to load manga recommendations:",
            error
        );
        recommendation_count.textContent = "—";
        recommendation_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load manga recommendations.</p>';
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
                active_recommendation_type === "manga"
                    ? "MANGA / MANHWA RECOMMENDATION"
                    : "MOVIE RECOMMENDATION";
    recommendation_dialog_title.textContent = item.title;

    const recommendation_year =
        item.year ||
        (item.start_date
            ? Number(
                String(item.start_date)
                    .slice(0, 4)
            )
            : null);

    recommendation_dialog_meta.textContent =
        active_recommendation_type === "manga"
            ? `${recommendation_year || "Year unavailable"}${item.anilist_score != null ?
                ` · ⭐ ${Number(item.anilist_score)}% AniList` : ""}`
            : active_recommendation_type === "anime"
                ? [
                    recommendation_year || "Year unavailable",
                    item.anilist_score != null
                        ? `⭐ ${Number(item.anilist_score)}% AniList`
                        : null,
                    item.mal_score != null
                        ? `⭐ ${Number(item.mal_score).toFixed(2)} MAL`
                        : null,
                    item.kitsu_score != null
                        ? `⭐ ${Number(item.kitsu_score).toFixed(1)}% Kitsu`
                        : null
                ].filter(Boolean).join(" · ")
                : `${item.year || "Year unavailable"}${item.tmdb_rating != null ?
                    ` · ⭐ ${Number(item.tmdb_rating).toFixed(1)} TMDB` : ""}`;
    recommendation_dialog_description.textContent =
        item.overview || "No description available.";
    recommendation_dialog_reason.textContent = recommendation_reason(item);
    recommendation_dialog_facts.innerHTML =
        '<span>Loading full details…</span>';
    recommendation_dialog_actions.innerHTML =
        active_recommendation_type === "anime"
            ? `
            <button type="button" class="recommendation-action primary"
                    data-dialog-action="watched">✓ Add as watched</button>`
            : active_recommendation_type === "manga"
                ? `
            <button type="button" class="recommendation-action primary"
                    data-dialog-action="manga_reading">＋ Start reading</button>`
                : `
            <button type="button" class="recommendation-action primary"
                    data-dialog-action="watched">✓ I've seen it</button>
            <button type="button" class="recommendation-action"
                    data-dialog-action="watch_later">＋ Watch later</button>
            <button type="button" class="recommendation-action muted"
                    data-dialog-action="not_interested">Not interested</button>`;

    recommendation_dialog_watch.innerHTML =
        item.tmdb_id && active_recommendation_type !== "anime"
            ? watch_area_loading_markup() : "";

    recommendation_dialog.showModal();

    if (active_recommendation_type === "manga") {
        const facts = [
            item.media_kind
                ? `Type: ${item.media_kind}`
                : null,
            item.total_chapters
                ? `Chapters: ${item.total_chapters}`
                : null,
            item.total_volumes
                ? `Volumes: ${item.total_volumes}`
                : null,
            item.publication_status
                ? `Status: ${String(item.publication_status)
                    .replaceAll("_", " ")}`
                : null,
            item.genres?.length
                ? `Genres: ${item.genres.join(", ")}`
                : null
        ].filter(Boolean);

        recommendation_dialog_description.textContent =
            item.description ||
            "No description available.";
        recommendation_dialog_facts.innerHTML =
            facts.length
                ? facts.map(
                    (fact) =>
                        `<span>${fact}</span>`
                ).join("")
                : "<span>No additional details available.</span>";
        return;
    }

    if (item.tmdb_id && active_recommendation_type !== "anime") {
        refresh_seerr_status_slot(
            recommendation_dialog_watch,
            item.tmdb_id,
            active_recommendation_type,
            (state) => `data-dialog-action="request_seerr"
                     data-seerr-french="${state.is_french}"
                     data-seerr-anime="${state.is_anime}"`,
            () => active_recommendation_detail === item
        );
        refresh_watch_providers_slot(
            recommendation_dialog_watch,
            item.tmdb_id,
            active_recommendation_type,
            () => active_recommendation_detail === item
        );
    }

    if (active_recommendation_type === "anime") {
        recommendation_dialog_description.textContent =
            item.description ||
            item.overview ||
            "No description available.";

        const facts = [
            item.media_type
                ? `Type: ${String(item.media_type).replaceAll("_", " ")}`
                : null,
            item.total_episodes
                ? `Episodes: ${item.total_episodes}`
                : null,
            item.average_episode_duration_seconds
                ? `Episode runtime: ~${Math.round(
                    Number(item.average_episode_duration_seconds) / 60
                )} min`
                : null,
            item.start_date
                ? `Aired: ${item.start_date}`
                : null,
            item.finish_date
                ? `Ended: ${item.finish_date}`
                : null,
            item.status
                ? `Status: ${String(item.status).replaceAll("_", " ")}`
                : null,
            item.genres?.length
                ? `Genres: ${item.genres.join(", ")}`
                : null,
            item.sources?.length
                ? `Data: ${item.sources.join(" · ")}`
                : "Data: AniList public catalog"
        ].filter(Boolean);

        recommendation_dialog_facts.innerHTML =
            facts.map((fact) => `<span>${fact}</span>`).join("");
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

// `refresh` re-runs the same refresh_seerr_status_slot call that
// originally rendered this box, re-fetching the real state from Seerr
// rather than guessing what to show — used on both success (a fresh
// request usually isn't "available" yet, but might now read "requested"
// or show updated season counts) and failure (nothing actually changed,
// so this just puts the idle/count box back). Leftover from before this
// button was icon-only: it used to set button.textContent directly
// ("Requesting…"/"✓ Requested"), which — now that the button is a small
// fixed-size icon box — replaced the icon with a text run that overflowed
// right out of the box. Swapping in the same spinner markup everything
// else uses for "loading" keeps this visually consistent instead.
async function request_media_on_seerr(item, media_type, button, refresh) {
    let choice = "";
    let seasons = null;

    // TV always goes through the season picker first — both for a fresh
    // Request click and for re-opening from an "X/Y downloaded" button to
    // request more. Seasons already available/requested are Seerr's own
    // problem to no-op on server-side; nothing here needs to know which
    // ones those are.
    if (media_type === "show") {
        seasons = await ask_seerr_seasons(item);
        if (!seasons || seasons.length === 0) return;
    }

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

    button.disabled = true;
    button.innerHTML = watch_box_spinner_markup();
    try {
        const request_media = httpsCallable(functions, "requestMediaOnSeerr");
        const result = await request_media({
            tmdb_id: Number(item.tmdb_id),
            media_type: media_type === "show" ? "tv" : "movie",
            choice,
            ...(seasons ? {seasons} : {})
        });
        show_toast(result.data.already_requested
            ? `${item.title} was already requested on your Seerr server.`
            : `${item.title} requested on your Seerr server.`);
        refresh();
    } catch (error) {
        console.error("Unable to request media on Seerr:", error);
        refresh();
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

// One small, visually consistent box that cycles through every Seerr
// state (loading/idle/requested/downloading/available) instead of a mix
// of differently-shaped buttons and text pills — that inconsistency was
// the actual complaint. Lives under the poster now, not in the actions
// list. `clickable` picks <button> vs plain <div> — a passive state
// (requested/downloading) has nothing to click.
function watch_box_markup(inner_html, {
    clickable = false, click_attrs = "", extra_class = "", title = ""
} = {}) {
    const tag = clickable ? "button" : "div";
    return `<${tag} class="watch-box ${extra_class}"
               ${clickable ? 'type="button"' : ""} ${click_attrs}
               ${title ? `title="${title}" aria-label="${title}"` : ""}>
               ${inner_html}
            </${tag}>`;
}

function watch_box_spinner_markup() {
    return '<span class="watch-box-spinner" aria-hidden="true"></span>';
}

// Same simple stroke-icon style for both — "to download" (idle, static)
// and "downloading with no known percent yet" (pulsing) are the same
// glyph, since the download destination is identical either way.
function watch_box_download_icon_markup(pulsing) {
    return `<svg class="watch-box-icon${pulsing ? " watch-box-icon-pulse" : ""}"
                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                aria-hidden="true">
              <path d="M12 3v12m0 0l-5-5m5 5l5-5M5 19h14"/>
            </svg>`;
}

function watch_box_clock_icon_markup() {
    return `<svg class="watch-box-icon" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
            </svg>`;
}

function watch_box_plex_markup(state) {
    return watch_box_markup(
        '<img src="../images/plex.svg" alt="" class="watch-box-plex-icon">',
        {
            clickable: true,
            click_attrs: `data-app-open data-app-web-url="${state.watch_url}" ` +
                `data-app-mobile-url="${state.mobile_watch_url || ""}"`,
            extra_class: "watch-box-plex",
            title: "Watch on Plex"
        }
    );
}

// request_click_attrs(state) returns the data-attributes string for
// whatever should handle the click (routed to request_media_on_seerr by
// one of the existing delegated listeners, same as before), or null to
// suppress the idle/count box entirely — e.g. the library detail dialog
// only offers a request for a Watch Later item, never an already-watched
// one, same gate that existed before this redesign.
//
// TV/anime only splits into a second "X/Y" box once at least one season
// is actually on Plex but not all of them are — before that point (0
// available), it behaves exactly like a movie: one box, idle/requested/
// downloading. Once every season is available, this collapses back to
// just the Plex box, same as a movie.
function watch_box_row_markup(state, media_type, request_click_attrs) {
    const is_tv_partial = media_type === "show" &&
        state.total_season_count &&
        state.available_season_count > 0 &&
        state.available_season_count < state.total_season_count;

    if (is_tv_partial) {
        const count_attrs = request_click_attrs(state);
        const plex_box = watch_box_plex_markup(state);
        if (count_attrs == null) return plex_box;

        const count_box = watch_box_markup(
            `${state.available_season_count}/${state.total_season_count}`,
            {
                clickable: true,
                click_attrs: count_attrs,
                extra_class: "watch-box-count",
                title: "Request more seasons"
            }
        );
        return count_box + plex_box;
    }

    if (state.status === "available") return watch_box_plex_markup(state);

    if (state.status === "downloading") {
        const content = state.progress_percent != null
            ? `<span class="watch-box-percent">${state.progress_percent}%</span>`
            : watch_box_download_icon_markup(true);
        return watch_box_markup(
            content, {extra_class: "watch-box-downloading", title: "Downloading"}
        );
    }

    if (state.status === "requested") {
        return watch_box_markup(
            watch_box_clock_icon_markup(),
            {extra_class: "watch-box-requested", title: "Requested"}
        );
    }

    const idle_attrs = request_click_attrs(state);
    if (idle_attrs == null) return "";
    return watch_box_markup(
        watch_box_download_icon_markup(false),
        {
            clickable: true,
            click_attrs: idle_attrs,
            extra_class: "watch-box-idle",
            title: "Request"
        }
    );
}

// Sets the whole "under the poster" area to a loading placeholder —
// called synchronously when a dialog opens, before either async refresh
// below resolves. One tile, one row: Plex/Request box(es) first, then
// streaming-provider icons, all as equal icon boxes side by side —
// data-watch-box-row and data-watch-providers-slot are both `display:
// contents` (see CSS), so their contents join the same flex row instead
// of forming two separately-bordered stacks.
function watch_area_loading_markup() {
    return `<p class="eyebrow watch-tile-label">Watch here</p>
            <div class="watch-tile-row">
                <span data-watch-box-row>
                    ${watch_box_markup(
                        watch_box_spinner_markup(),
                        {extra_class: "watch-box-loading", title: "Checking Seerr…"}
                    )}
                </span>
                <span data-watch-providers-slot></span>
            </div>`;
}

// Curated to just the mainstream subscription platforms actually wanted
// here — TMDB/JustWatch's raw `flatrate` list also includes "with Ads"
// tiers and channel add-ons (e.g. "Starz Amazon Channel"), which would
// otherwise show up as extra, confusing icons next to the real ones.
// Matching against this fixed list, in this order, taking at most one
// hit per entry, is what gives "one Netflix icon" instead of two or
// three near-duplicates — and drops anything not on the list entirely.
//
// `app_url` tries that platform's own app on a phone first, same
// mechanism as the Plex button (open_app_or_web below) — confidence
// on the scheme varies a lot by platform and is noted per entry.
// `logo` is a locally-hosted asset when one's been supplied; falls back
// to TMDB's own logo for anything without one (currently Disney+).
const watch_provider_catalog = [
    {
        match: /netflix/i,
        name: "Netflix",
        logo: "../images/netflix-logo-icon.svg",
        // nflx:// is Netflix's real, long-documented scheme — though
        // Netflix's own current guidance favors Universal Links to a
        // specific title, which isn't usable here since TMDB doesn't
        // give us Netflix's own internal id for this title, only that
        // Netflix has it. This just opens the app, not the title itself.
        app_url: "nflx://www.netflix.com",
        web_url: "https://www.netflix.com"
    },
    {
        match: /prime video/i,
        name: "Prime Video",
        logo: "../images/amazon-prime.svg",
        // No app_url: multiple developers have publicly documented
        // trying many schemes for the Prime Video app and failing —
        // going straight to the website rather than guess with zero
        // basis for a guess.
        app_url: null,
        web_url: "https://www.primevideo.com"
    },
    {
        match: /disney/i,
        name: "Disney+",
        logo: null,
        // Unverified — commonly cited across community deep-link
        // references, no primary-source confirmation found.
        app_url: "disneyplus://",
        web_url: "https://www.disneyplus.com"
    },
    {
        match: /^crave/i,
        name: "Crave",
        logo: "../images/crave.png",
        // No public documentation found at all for a Crave app scheme.
        app_url: null,
        web_url: "https://www.crave.ca"
    },
    {
        match: /paramount/i,
        name: "Paramount+",
        logo: "../images/paramount-plus.svg",
        // Unverified guess following the same sluggified-name
        // convention as Disney+'s.
        app_url: "paramountplus://",
        web_url: "https://www.paramountplus.com"
    },
    {
        match: /crunchyroll/i,
        name: "Crunchyroll",
        logo: "../images/crunchyroll.svg",
        // Unverified guess, same convention.
        app_url: "crunchyroll://",
        web_url: "https://www.crunchyroll.com"
    },
];

function watch_provider_button_markup(provider, catalog_entry) {
    const logo_src = catalog_entry.logo || provider.logo_url;
    const logo = `<img src="${logo_src}" alt="" class="watch-provider-logo">`;

    return `<button type="button" class="watch-provider-icon" data-app-open
               data-app-web-url="${catalog_entry.web_url}"
               data-app-mobile-url="${catalog_entry.app_url || ""}"
               title="${catalog_entry.name}"
               aria-label="Open ${catalog_entry.name}">
               ${logo}</button>`;
}

async function refresh_watch_providers_slot(
    container, tmdb_id, media_type, still_open
) {
    let providers = [];
    try {
        const get_providers = httpsCallable(functions, "getWatchProviders");
        const result = await get_providers({
            tmdb_id: Number(tmdb_id),
            media_type: media_type === "show" ? "tv" : "movie"
        });
        providers = result.data?.providers || [];
    } catch (error) {
        console.error("Unable to load watch providers:", error);
    }
    if (!still_open()) return;

    // The slot IS the .watch-provider-row tile itself — innerHTML, not
    // outerHTML, so the tile's own border/background survives being
    // populated instead of getting replaced along with it.
    const slot = container.querySelector("[data-watch-providers-slot]");
    if (!slot) return;

    // Walking the catalog (not the raw provider list) is what guarantees
    // at most one button per platform and drops anything uncurated.
    const markup = watch_provider_catalog
        .map((entry) => ({
            entry,
            provider: providers.find(
                (provider) => entry.match.test(provider.name)
            )
        }))
        .filter(({provider}) => provider)
        .map(({entry, provider}) => watch_provider_button_markup(provider, entry))
        .join("");
    slot.innerHTML = markup;
}

// Shared by the recommendation/release dialog, the library detail
// dialog, and the anime library dialog — all show the same box(es)
// under the poster, just differing in what request_click_attrs offers
// for the idle/count state (recommendations and the anime library
// always offer a request; a movie/show library item only does for a
// Watch Later entry, never an already-watched one).
async function refresh_seerr_status_slot(
    container, tmdb_id, media_type, request_click_attrs, still_open
) {
    let state = {
        status: "idle", watch_url: null, mobile_watch_url: null,
        is_french: false, is_anime: false,
        progress_percent: null, available_season_count: null,
        total_season_count: null
    };
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

    const box_row = container.querySelector("[data-watch-box-row]");
    if (box_row) {
        box_row.innerHTML =
            watch_box_row_markup(state, media_type, request_click_attrs);
    }
}

function is_mobile_device() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Try an app's own scheme first on a phone — Plex, Netflix, and several
// other platforms register one — navigating the current tab there hands
// off to the app if it's installed (the page backgrounds, firing `blur`,
// which cancels the fallback below). If nothing intercepts it within a
// short window — no app installed, an unregistered/wrong scheme, or
// desktop, where there's no app to try at all — falls back to opening
// the plain web link instead. This is a standard, if imperfect, pattern:
// something else legitimately stealing focus in that same window (a
// notification, a manual tab switch) would also cancel the fallback,
// same trade-off every site using this trick accepts. Also means a
// wrong scheme guess degrades safely to "just opens the website" rather
// than actually breaking anything.
function open_app_or_web(mobile_url, web_url) {
    if (!is_mobile_device() || !mobile_url) {
        window.open(web_url, "_blank", "noopener");
        return;
    }

    const fallback_timer = setTimeout(() => {
        window.open(web_url, "_blank", "noopener");
    }, 1500);
    window.addEventListener(
        "blur", () => clearTimeout(fallback_timer), {once: true}
    );
    window.location.href = mobile_url;
}

// Delegated on <body> rather than any one dialog's action container —
// every "open the app, else the website" button anywhere in the app
// (Plex, and every streaming-provider icon) shares this same handler and
// only needs its own data attributes read off the clicked button.
document.body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-app-open]");
    if (!button) return;
    open_app_or_web(button.dataset.appMobileUrl, button.dataset.appWebUrl);
});

async function run_recommendation_action(item, action, button) {
    if (active_recommendation_type === "anime" &&
        action === "watched") {
        await add_global_anime_watched(
            item,
            button
        );
        ignored_recommendation_ids.add(
            recommendation_id(item)
        );
        apply_recommendation_filter();
        if (recommendation_dialog.open) {
            recommendation_dialog.close();
        }
        return;
    }

    if (active_recommendation_type === "manga" &&
        action === "manga_reading") {
        await add_global_manga_reading(
            item,
            button
        );
        if (recommendation_dialog.open) {
            recommendation_dialog.close();
        }
        return;
    }

    if (action === "request_seerr") {
        await request_media_on_seerr(item, active_recommendation_type, button, () =>
            refresh_seerr_status_slot(
                recommendation_dialog_watch,
                item.tmdb_id,
                active_recommendation_type,
                (state) => `data-dialog-action="request_seerr"
                         data-seerr-french="${state.is_french}"
                         data-seerr-anime="${state.is_anime}"`,
                () => active_recommendation_detail === item
            ));
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

// Delegated on the whole dialog, not just the actions list — the watch
// box (Request/season-count button included) now lives under the
// poster, a sibling of the actions container, not inside it.
recommendation_dialog.addEventListener("click", async (event) => {
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


//? ------------------------------------
//* ----- Collection Poster Reveal -----
//? ------------------------------------
//#region
let collection_poster_observer = null;

function get_collection_poster_observer() {
    if (collection_poster_observer) {
        return collection_poster_observer;
    }

    if (!("IntersectionObserver" in window)) {
        return null;
    }

    collection_poster_observer =
        new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) {
                        return;
                    }

                    entry.target.classList.add(
                        "is-visible"
                    );
                    collection_poster_observer
                        .unobserve(
                            entry.target
                        );
                });
            },
            {
                threshold: 0.01,
                rootMargin:
                    "0px 0px 80px 0px"
            }
        );

    return collection_poster_observer;
}

function observe_collection_posters(grid) {
    if (!grid) return;

    const posters =
        grid.querySelectorAll(
            ".movie-card .movie-poster-wrap"
        );
    const reduced_motion =
        window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        ).matches;
    const observer =
        get_collection_poster_observer();

    posters.forEach((poster) => {
        if (poster.dataset
            .collectionRevealReady ===
            "true") {
            return;
        }

        poster.dataset
            .collectionRevealReady =
            "true";
        poster.classList.add(
            "collection-poster-reveal"
        );

        if (reduced_motion ||
            !observer) {
            poster.classList.add(
                "is-visible"
            );
            return;
        }

        observer.observe(poster);
    });
}
//#endregion


//? ------------------------------
//* ----- Supabase Library -------
//? ------------------------------
//#region
const movie_count = document.getElementById("movie_count");
const movie_watch_time = document.getElementById("movie_watch_time");
const movie_library_count = document.getElementById("movie_library_count");
const movie_grid = document.getElementById("movie_grid");
const movie_search = document.getElementById("movie_search");
const genre_filter = document.getElementById("genre_filter");
const franchise_filter = document.getElementById("franchise_filter");
const movie_status_filter = document.getElementById("movie_status_filter");
const movie_sort = document.getElementById("movie_sort");
const movie_filter_clear = document.getElementById("movie_filter_clear");

let movie_library = [];

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

    return `
        <article class="movie-card" data-library-item="movie" data-item-id="${movie.id}">
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

    if (movies.length === 0) {
        movie_grid.innerHTML =
            '<p class="library-loading">No movies match these filters.</p>';
        movie_library_count.textContent = "0 MATCHES";
        return;
    }

    movie_grid.innerHTML = movies.map(create_movie_card).join("");
    observe_collection_posters(
        movie_grid
    );

    const filters_active = movie_search.value.trim() ||
        genre_filter.value ||
        franchise_filter.value ||
        movie_status_filter.value;

    movie_library_count.textContent = filters_active
        ? `${movies.length} OF ${movie_library.length} MOVIES`
        : `${movie_library.length} MOVIES`;

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
        const {data: movies, error} =
            await supabase_read_with_auth_retry(
                () =>
                    supabase
                        .from("movies")
                        .select("*")
                        .order(
                            "year",
                            {ascending: false}
                        )
            );

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

//#endregion


//? ------------------------------
//* ----- TV Show Library --------
//? ------------------------------
//#region
const show_count = document.getElementById("show_count");
const show_watch_time = document.getElementById("show_watch_time");
const show_library_count = document.getElementById("show_library_count");
const show_grid = document.getElementById("show_grid");
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
    return `
        <article class="movie-card" data-library-item="show" data-item-id="${show.id}">
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
    if (shows.length === 0) {
        show_grid.innerHTML =
            '<p class="library-loading">No TV shows match these filters.</p>';
        show_library_count.textContent = "0 MATCHES";
        return;
    }

    show_grid.innerHTML = shows.map(create_show_card).join("");
    observe_collection_posters(
        show_grid
    );

    const filters_active = show_search.value.trim() ||
        show_genre_filter.value || show_status_filter.value;
    show_library_count.textContent = filters_active
        ? `${shows.length} OF ${show_library.length} SHOWS`
        : `${show_library.length} SHOWS`;
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
        const {data, error} =
            await supabase_read_with_auth_retry(
                () =>
                    supabase
                        .from("tv_episode_progress")
                        .select(
                            "id,tv_show_id,season_number,episode_number,watched"
                        )
                        .eq("watched", true)
                        .order(
                            "id",
                            {ascending: true}
                        )
                        .range(
                            from,
                            from + page_size - 1
                        )
            );

        if (error) throw error;

        const page = data || [];
        rows.push(...page);

        if (page.length < page_size) break;
    }

    return rows;
}

async function load_show_library() {
    try {
        const {data: shows, error} =
            await supabase_read_with_auth_retry(
                () =>
                    supabase
                        .from("tv_shows")
                        .select("*")
                        .order(
                            "year",
                            {ascending: false}
                        )
            );

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

async function open_show_seasons(
    show,
    media_label = "TV SHOW",
    open_first_season = false
) {
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

        if (open_first_season &&
            result.data.seasons.length) {
            const first_season =
                result.data.seasons.find(
                    (season) =>
                        Number(
                            season.season_number
                        ) > 0
                ) ||
                result.data.seasons[0];

            await open_season_episodes(
                Number(
                    first_season.season_number
                )
            );
        }
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
                    <button class="episode-watch-image" type="button"
                            ${active_show_id !== null ? `
                                data-episode-watched="${episode.episode_number}"
                                aria-label="${watched ?
                                    "Mark episode not watched" :
                                    "Mark episode watched"}"
                            ` : "disabled"}>
                        ${still}
                        ${active_show_id !== null ? `
                            <span class="episode-watch-overlay">
                                <span>✓</span>
                                ${watched ? "Watched" : "Mark watched"}
                            </span>
                        ` : ""}
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
        ${type === "show" && (item.genres || []).some((genre) =>
            String(genre).toLowerCase() === "animation") ? `
            <button class="recommendation-action" type="button"
                    data-library-dialog-move-to-anime="${item.id}">
                Move to Anime library
            </button>` : ""}
    `;

    recommendation_dialog_watch.innerHTML = watch_area_loading_markup();

    recommendation_dialog.showModal();

    // A tmdb_id isn't always stored — Plex-imported items that were
    // never matched to TMDB at import time don't have one, even though
    // they're perfectly checkable on Seerr once we know one. Resolves it
    // via title search when missing, same fallback anime titles use
    // (resolveTmdbId), just without that path's Animation-genre
    // requirement — not appropriate for general movies/shows. Setting it
    // on `item` (the actual library-array object, not a copy) means the
    // Request click handler and any later reopen of this same item just
    // see it as if it always had one; deliberately not persisted to
    // Supabase, since without the anime path's safety check a wrong
    // title match is more likely here.
    (async () => {
        let watch_tmdb_id = item.tmdb_id || null;
        if (!watch_tmdb_id) {
            try {
                const resolve = httpsCallable(functions, "resolveTmdbId");
                const result = await resolve({
                    title: item.title,
                    year: item.year,
                    media_type: type === "movie" ? "movie" : "tv",
                    require_animation_genre: false
                });
                watch_tmdb_id = result.data?.tmdb_id || null;
                if (watch_tmdb_id) item.tmdb_id = watch_tmdb_id;
            } catch (error) {
                console.error(
                    "Unable to resolve a TMDB id for this library item:",
                    error
                );
            }
        }

        const still_open = () =>
            active_library_detail?.item.id === item.id &&
            active_library_detail?.type === type;

        if (!watch_tmdb_id) {
            if (still_open()) recommendation_dialog_watch.innerHTML = "";
            return;
        }
        if (!still_open()) return;

        refresh_seerr_status_slot(
            recommendation_dialog_watch,
            watch_tmdb_id,
            type,
            // Only offer to request something not yet on Plex if it's
            // sitting in Watch Later — an already-watched item you added
            // manually isn't necessarily something to re-request.
            (state) => item.status === "watch_later"
                ? `data-library-dialog-request="${type}"
                   data-library-dialog-id="${item.id}"
                   data-seerr-french="${state.is_french}"
                   data-seerr-anime="${state.is_anime}"`
                : null,
            still_open
        );
        refresh_watch_providers_slot(
            recommendation_dialog_watch, watch_tmdb_id, type, still_open
        );
    })();

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

// Remediation for shows imported before Plex anime detection existed (or
// any TV show whose genres suggest it's actually anime): a manual, one-item
// move rather than an automatic bulk reclassification, since Stellaz can't
// safely infer this with certainty from stored genres alone.
async function move_show_to_anime(show) {
    if (!window.confirm(
        `Move "${show.title}" to your Anime library? It will be removed from TV Shows.`
    )) {
        return;
    }

    try {
        const {count: episodes_watched} = await supabase
            .from("tv_episode_progress")
            .select("*", {count: "exact", head: true})
            .eq("tv_show_id", show.id)
            .eq("watched", true);

        const poster_url = show.poster_url ||
            await get_plex_poster_data_url(show.plex_thumb);

        const {error: insert_error} = await supabase.from("anime").insert({
            title: show.title,
            media_type: "tv",
            status: show.status === "watched" ? "completed" : "plan_to_watch",
            episodes_watched: episodes_watched || 0,
            ...(show.status === "watched"
                ? {activity_at: new Date().toISOString()}
                : {}),
            ...(poster_url ? {poster_url} : {}),
            ...(show.genres?.length ? {genres: show.genres} : {}),
            ...(show.my_rating != null ? {my_rating: Number(show.my_rating)} : {})
        });
        if (insert_error) throw insert_error;

        const {error: delete_error} = await supabase
            .from("tv_shows")
            .delete()
            .eq("id", show.id);
        if (delete_error) throw delete_error;

        recommendation_dialog.close();
        await Promise.all([load_show_library(), load_anime_library()]);
        show_toast(`${show.title} moved to your Anime library.`);
    } catch (error) {
        console.error("Unable to move show to anime:", error);
        alert("Unable to move this title to Anime. Please try again.");
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

// Delegated on the whole dialog, not just the actions list — the watch
// box (Request/season-count button included) now lives under the
// poster, a sibling of the actions container, not inside it.
recommendation_dialog.addEventListener("click", async (event) => {
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

    const request_button = event.target.closest(
        "[data-library-dialog-request]"
    );
    if (request_button) {
        const request_item = active_library_detail.item;
        const request_type = request_button.dataset.libraryDialogRequest;
        await request_media_on_seerr(
            request_item, request_type, request_button, () =>
                refresh_seerr_status_slot(
                    recommendation_dialog_watch,
                    request_item.tmdb_id,
                    request_type,
                    (state) => request_item.status === "watch_later"
                        ? `data-library-dialog-request="${request_type}"
                           data-library-dialog-id="${request_item.id}"
                           data-seerr-french="${state.is_french}"
                           data-seerr-anime="${state.is_anime}"`
                        : null,
                    () => active_library_detail?.item.id === request_item.id &&
                        active_library_detail?.type === request_type
                )
        );
        return;
    }

    const seasons_button = event.target.closest(
        "[data-library-dialog-seasons]"
    );
    if (seasons_button && active_library_detail.type === "show") {
        const show = active_library_detail.item;
        recommendation_dialog.close();
        await open_show_seasons(
            show,
            "TV SHOW",
            true
        );
        return;
    }

    const move_to_anime_button = event.target.closest(
        "[data-library-dialog-move-to-anime]"
    );
    if (move_to_anime_button && active_library_detail.type === "show") {
        await move_show_to_anime(active_library_detail.item);
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
        const new_item = {
            title,
            year,
            status,
            ...(is_movie && status === "watched"
                ? {watched_at: new Date().toISOString()}
                : {})
        };

        const {data: added_item, error} = await supabase.from(table)
            .insert(new_item)
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
        const watched_patch =
            type === "movie"
                ? {
                    status: "watched",
                    watched_at: new Date().toISOString()
                }
                : {status: "watched"};

        const {error} = await supabase.from(table)
            .update(watched_patch)
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

// Season picker for TV Seerr requests — reuses getTVShowSeasons (same
// TMDB-backed call open_show_seasons already uses for the personal
// watch-tracking grid) purely for the season list; Seerr's own request
// handler is what actually skips seasons that are available or already
// requested, so this dialog doesn't need to know which ones those are.
// Resolves with an array of selected season numbers, or null if
// cancelled/dismissed — same convention as ask_seerr_choice.
const seerr_season_dialog = document.getElementById("seerr_season_dialog");
const seerr_season_list = document.getElementById("seerr_season_list");
const seerr_season_confirm = document.getElementById("seerr_season_confirm");
const seerr_season_cancel = document.getElementById("seerr_season_cancel");
const seerr_season_max = 2;

let seerr_season_resolve = null;

function settle_seerr_seasons(value) {
    const resolve = seerr_season_resolve;
    seerr_season_resolve = null;

    if (seerr_season_dialog.open) seerr_season_dialog.close();

    if (resolve) resolve(value);
}

function update_seerr_season_checkbox_limits() {
    const checked_count =
        seerr_season_list.querySelectorAll("input:checked").length;
    seerr_season_list.querySelectorAll('input[type="checkbox"]')
        .forEach((box) => {
            box.disabled = !box.checked && checked_count >= seerr_season_max;
        });
    seerr_season_confirm.disabled = checked_count === 0;
}

async function ask_seerr_seasons(item) {
    seerr_season_list.innerHTML =
        '<p class="library-loading">Loading seasons...</p>';
    seerr_season_confirm.disabled = true;
    seerr_season_dialog.showModal();

    try {
        const get_seasons = httpsCallable(functions, "getTVShowSeasons");
        const result = await get_seasons({title: item.title, year: item.year});
        seerr_season_list.innerHTML = result.data.seasons.length
            ? result.data.seasons.map((season) => `
                <label class="seerr-season-option">
                    <input type="checkbox" value="${season.season_number}">
                    ${season.name} · ${season.episode_count} episodes
                </label>`).join("")
            : '<p class="library-loading">No seasons found.</p>';
    } catch (error) {
        console.error("Unable to load seasons for request:", error);
        seerr_season_list.innerHTML =
            '<p class="season-error">Unable to load seasons. Check the browser console for details.</p>';
    }

    return new Promise((resolve) => {
        seerr_season_resolve = resolve;
    });
}

seerr_season_list.addEventListener("change", (event) => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    update_seerr_season_checkbox_limits();
});

seerr_season_confirm.addEventListener("click", () => {
    const seasons = [...seerr_season_list.querySelectorAll("input:checked")]
        .map((box) => Number(box.value));
    settle_seerr_seasons(seasons);
});

seerr_season_cancel.addEventListener("click", () => settle_seerr_seasons(null));

seerr_season_dialog.addEventListener("close", () => {
    if (seerr_season_resolve) settle_seerr_seasons(null);
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
const manga_chapter_count = document.getElementById("manga_chapter_count");
const manga_library_count = document.getElementById("manga_library_count");
const manga_grid = document.getElementById("manga_grid");
const manga_filters = document.getElementById("manga_filters");
const manga_type_filter = document.getElementById("manga_type_filter");
const manga_status_filter = document.getElementById("manga_status_filter");
const manga_sort = document.getElementById("manga_sort");
const manga_search = document.getElementById("manga_search");
const manga_filter_clear = document.getElementById("manga_filter_clear");
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
let manga_add_search_timeout = null;
let manga_add_search_request = 0;
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
        return '<article class="movie-card manga-card">' +
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

    observe_collection_posters(
        manga_grid
    );
}

async function load_manga_library() {
    try {
        const {data, error} =
            await supabase_read_with_auth_retry(
                () =>
                    supabase
                        .from("manga_library")
                        .select("*")
                        .order("title")
            );
        if (error) throw error;

        manga_library = data || [];
        const completed = manga_library.filter(
            (item) => item.user_status === "completed"
        );
        const chapters_read = manga_library.reduce(
            (total, item) =>
                total +
                Math.max(
                    0,
                    Number(item.chapters_read || 0)
                ),
            0
        );

        manga_count.textContent = completed.length;
        manga_chapter_count.textContent =
            chapters_read.toLocaleString();
        manga_library_count.textContent =
            manga_library.length + (manga_library.length === 1 ? " TITLE" : " TITLES");
        manga_filters.hidden = manga_library.length === 0;

        if (manga_library.length === 0) {
            manga_grid.innerHTML =
                '<p class="library-loading">No manga or manhwa added yet. Use “Add manga / manhwa” to search AniList.</p>';
            return;
        }

        render_manga_library();
    } catch (error) {
        console.error("Unable to load manga / manhwa library:", error);
        manga_count.textContent = "Error";
        manga_chapter_count.textContent = "Error";
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

async function search_manga_add_catalog(query) {
    const normalized_query = String(query || "").trim();
    if (normalized_query.length < 2) return;

    const request_number =
        ++manga_add_search_request;

    manga_add_results.innerHTML =
        '<p class="recommendation-loading">Searching manga catalogs...</p>';

    try {
        const search_anilist =
            httpsCallable(
                functions,
                "searchAniListManga"
            );
        const result =
            await search_anilist({
                query: normalized_query
            });

        if (request_number !==
            manga_add_search_request) {
            return;
        }

        manga_add_candidates =
            result.data.results || [];

        manga_add_results.innerHTML =
            manga_add_candidates.length
                ? manga_add_candidates
                    .map((item) => {
                        const meta = [
                            item.media_kind,
                            item.total_chapters
                                ? item.total_chapters +
                                    " chapters"
                                : "chapter count unknown",
                            item.anilist_score
                                ? "★ " +
                                    item.anilist_score +
                                    "% AniList"
                                : item.kitsu_score
                                    ? "★ " +
                                        item.kitsu_score +
                                        "% Kitsu"
                                    : null,
                            item.sources?.length
                                ? item.sources.join(" + ")
                                : null
                        ]
                            .filter(Boolean)
                            .join(" · ");

                        return (
                            '<button class="anime-add-result" type="button" ' +
                            'data-manga-add-index="' +
                            manga_add_candidates.indexOf(item) +
                            '">' +
                            (item.poster_url
                                ? '<img src="' +
                                    manga_escape(
                                        item.poster_url
                                    ) +
                                    '" alt="">'
                                : "") +
                            '<span><strong>' +
                            manga_escape(
                                item.title
                            ) +
                            '</strong><small>' +
                            manga_escape(
                                meta
                            ) +
                            '</small></span>' +
                            '<b>＋ Add</b></button>'
                        );
                    })
                    .join("")
                : '<p class="recommendation-loading">No manga or manhwa found.</p>';
    } catch (error) {
        if (request_number !==
            manga_add_search_request) {
            return;
        }

        console.error(
            "Unable to search manga catalogs:",
            error
        );
        manga_add_results.innerHTML =
            '<p class="recommendation-loading">Unable to search manga catalogs.</p>';
    }
}

manga_add_button.addEventListener("click", () => {
    clearTimeout(
        manga_add_search_timeout
    );
    manga_add_search_request += 1;
    manga_add_search.value = "";
    manga_add_results.innerHTML = "";
    manga_add_candidates = [];
    manga_add_dialog.showModal();
    manga_add_search.focus();
});

manga_add_close.addEventListener(
    "click",
    () => manga_add_dialog.close()
);

manga_add_search_form.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();
        event.stopPropagation();

        clearTimeout(
            manga_add_search_timeout
        );

        const query =
            manga_add_search.value.trim();
        if (query.length < 2) return;

        await search_manga_add_catalog(
            query
        );
    }
);

manga_add_search.addEventListener(
    "keydown",
    (event) => {
        if (event.key !== "Enter") return;

        event.preventDefault();
        event.stopPropagation();

        clearTimeout(
            manga_add_search_timeout
        );

        const query =
            manga_add_search.value.trim();
        if (query.length < 2) return;

        search_manga_add_catalog(
            query
        );
    }
);

manga_add_search.addEventListener(
    "input",
    () => {
        clearTimeout(
            manga_add_search_timeout
        );

        const query =
            manga_add_search.value.trim();

        if (query.length < 3) {
            manga_add_search_request += 1;
            manga_add_candidates = [];
            manga_add_results.innerHTML = "";
            return;
        }

        manga_add_search_timeout =
            setTimeout(
                () =>
                    search_manga_add_catalog(
                        query
                    ),
                300
            );
    }
);

manga_add_results.addEventListener("click", async (event) => {
    const button =
        event.target.closest(
            "[data-manga-add-index]"
        );
    if (!button) return;

    const item =
        manga_add_candidates[
            Number(button.dataset.mangaAddIndex)
        ];
    if (!item) return;

    button.disabled = true;

    try {
        const result =
            await add_manga_catalog_item(
                item
            );

        if (!result.added) {
            show_toast(
                item.title +
                " is already in your library."
            );
            button.disabled = false;
            return;
        }

        manga_add_dialog.close();
        show_toast(
            item.title +
            " added to your reading library."
        );
    } catch (error) {
        console.error(
            "Unable to add AniList manga:",
            error
        );
        alert(
            "Unable to add this title. Please try again."
        );
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
const anime_watch_section = document.getElementById("anime_watch_section");
let active_anime_watch_tmdb_id = null;
const anime_edit_form = document.getElementById("anime_edit_form");
const anime_edit_status = document.getElementById("anime_edit_status");
const anime_episode_picker = document.getElementById("anime_episode_picker");
const anime_edit_cover = document.getElementById("anime_edit_cover");
let selected_anime_episode = 0;
const anime_edit_score = document.getElementById("anime_edit_score");
const anime_edit_close = document.getElementById("anime_edit_close");
const anime_edit_save = document.getElementById("anime_edit_save");
const anime_edit_delete = document.getElementById("anime_edit_delete");
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
let anime_add_search_timeout = null;
let anime_add_search_request = 0;

if (anime_add_button && anime_add_dialog && anime_add_close &&
    anime_add_search_form && anime_add_search && anime_add_results) {
    async function search_anime_add_catalog(query) {
        const normalized_query =
            String(query || "").trim();
        if (normalized_query.length < 2) return;

        const request_number =
            ++anime_add_search_request;

        anime_add_results.innerHTML =
            '<p class="recommendation-loading">Searching anime...</p>';

        try {
            const search_catalog =
                httpsCallable(
                    functions,
                    "searchAnimeCatalog"
                );
            const result =
                await search_catalog({
                    query:
                        normalized_query
                });

            if (request_number !==
                anime_add_search_request) {
                return;
            }

            anime_add_candidates =
                result.data.results || [];

            anime_add_results.innerHTML =
                anime_add_candidates.length
                    ? anime_add_candidates
                        .map(
                            (item, index) => {
                                const source_label =
                                    (
                                        item.sources ||
                                        []
                                    ).join(
                                        " · "
                                    );
                                const score =
                                    item.anilist_score !=
                                    null
                                        ? "⭐ " +
                                            Number(
                                                item.anilist_score
                                            ) +
                                            "% AniList"
                                        : item.mal_score !=
                                            null
                                            ? "⭐ " +
                                                Number(
                                                    item.mal_score
                                                ).toFixed(
                                                    2
                                                ) +
                                                " MAL"
                                            : item.kitsu_score !=
                                                null
                                                ? "⭐ " +
                                                    Number(
                                                        item.kitsu_score
                                                    ).toFixed(
                                                        1
                                                    ) +
                                                    "% Kitsu"
                                                : "";
                                const meta = [
                                    item.start_date
                                        ? item.start_date
                                            .slice(
                                                0,
                                                4
                                            )
                                        : "",
                                    source_label,
                                    score
                                ]
                                    .filter(
                                        Boolean
                                    )
                                    .join(
                                        " · "
                                    );

                                return `
                    <button class="anime-add-result" type="button"
                            data-anime-add-index="${index}">
                        ${item.poster_url ? `<img src="${item.poster_url}" alt="">` : ""}
                        <span><strong>${item.title}</strong><small>${meta}</small></span>
                        <b>＋ Watched</b>
                    </button>`;
                            }
                        )
                        .join("")
                    : '<p class="recommendation-loading">No anime found.</p>';
        } catch (error) {
            if (request_number !==
                anime_add_search_request) {
                return;
            }

            console.error(
                "Unable to search anime catalog:",
                error
            );
            anime_add_results.innerHTML =
                '<p class="recommendation-loading">Unable to search anime right now.</p>';
        }
    }

    anime_add_button.addEventListener("click", () => {
        clearTimeout(
            anime_add_search_timeout
        );
        anime_add_search_request += 1;
        anime_add_search.value = "";
        anime_add_results.innerHTML = "";
        anime_add_candidates = [];
        anime_add_dialog.showModal();
        anime_add_search.focus();
    });

    anime_add_close.addEventListener(
        "click",
        () => anime_add_dialog.close()
    );

    anime_add_search_form.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();
            event.stopPropagation();

            clearTimeout(
                anime_add_search_timeout
            );

            const query =
                anime_add_search.value.trim();
            if (query.length < 2) return;

            await search_anime_add_catalog(
                query
            );
        }
    );

    anime_add_search.addEventListener(
        "keydown",
        (event) => {
            if (event.key !== "Enter") return;

            event.preventDefault();
            event.stopPropagation();

            clearTimeout(
                anime_add_search_timeout
            );

            const query =
                anime_add_search.value.trim();
            if (query.length < 2) return;

            search_anime_add_catalog(
                query
            );
        }
    );

    anime_add_search.addEventListener(
        "input",
        () => {
            clearTimeout(
                anime_add_search_timeout
            );

            const query =
                anime_add_search.value.trim();

            if (query.length < 3) {
                anime_add_search_request += 1;
                anime_add_candidates = [];
                anime_add_results.innerHTML = "";
                return;
            }

            anime_add_search_timeout =
                setTimeout(
                    () =>
                        search_anime_add_catalog(
                            query
                        ),
                    300
                );
        }
    );

    anime_add_results.addEventListener("click", async (event) => {
        const button =
            event.target.closest(
                "[data-anime-add-index]"
            );
        if (!button) return;

        const item =
            anime_add_candidates[
                Number(
                    button.dataset.animeAddIndex
                )
            ];
        if (!item) return;

        button.disabled = true;

        try {
            const merged =
                await add_anime_catalog_item_as_watched(
                    item
                );

            anime_add_dialog.close();

            const action =
                merged.added
                    ? "added"
                    : "updated";
            show_toast(
                item.title +
                " " +
                action +
                " in Stellaz as watched."
            );
        } catch (error) {
            console.error(
                "Unable to add anime:",
                error
            );
            alert(
                "Unable to add this anime to Stellaz."
            );
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
        "mal_updated_at", "activity_at",
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
        activity_at: item.activity_at || null,
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
        return '<article class="movie-card anime-card">' +
            '<div class="movie-poster-wrap anime-edit-poster" data-anime-id="' +
            item.id + '" tabindex="0" role="button" title="Open anime">' +
            poster + '</div>' +
            '<h3 class="anime-edit-title" data-anime-id="' + item.id + '" tabindex="0" role="button" title="Open anime">' + item.title + '</h3><p>' +
            progress + " · " + external_score + personal_score + '</p></article>';
    }).join("");

    observe_collection_posters(
        anime_grid
    );
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
    const {data, error} =
        await supabase_read_with_auth_retry(
            () =>
                supabase
                    .from("anime")
                    .select("*")
                    .order("title")
        );
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
    active_anime_watch_tmdb_id = null;
    anime_watch_section.hidden = true;
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
    anime_edit_save.textContent = "Save changes";
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

    // Anime here is sourced from AniList/MAL/Kitsu, none of which carry
    // a TMDB id, but Seerr/Plex/watch-provider data is all keyed by one
    // — resolveTmdbId does a best-effort title search (backend rejects
    // the match if it isn't actually tagged Animation, to avoid an
    // unrelated live-action show with the same title). Hidden until a
    // match is found rather than shown empty while resolving, and
    // dropped entirely if nothing matches.
    (async () => {
        const anime_year = active_anime.start_date
            ? Number(String(active_anime.start_date).slice(0, 4)) || null
            : null;
        let tmdb_id = null;
        try {
            const resolve = httpsCallable(functions, "resolveTmdbId");
            const result = await resolve({
                title: active_anime.title, year: anime_year
            });
            tmdb_id = result.data?.tmdb_id || null;
        } catch (error) {
            console.error("Unable to resolve a TMDB id for anime:", error);
        }
        if (!tmdb_id || active_anime?.id !== opened_anime_id) return;

        active_anime_watch_tmdb_id = tmdb_id;
        anime_watch_section.hidden = false;
        anime_watch_section.innerHTML = watch_area_loading_markup();
        const still_open = () =>
            active_anime?.id === opened_anime_id && anime_edit_dialog.open;

        refresh_seerr_status_slot(
            anime_watch_section,
            tmdb_id,
            "show",
            (state) => `data-anime-watch-request
                     data-seerr-french="${state.is_french}"
                     data-seerr-anime="${state.is_anime}"`,
            still_open
        );
        refresh_watch_providers_slot(
            anime_watch_section, tmdb_id, "show", still_open
        );
    })();

    try {
        const get_details =
            httpsCallable(
                functions,
                "getAnimeCatalogDetails"
            );
        const result =
            await get_details({
                title:
                    active_anime.title,
                anilist_id:
                    active_anime.anilist_id ||
                    null,
                mal_id:
                    active_anime.mal_id ||
                    null,
                kitsu_id:
                    active_anime.kitsu_id ||
                    null
            });

        if (!active_anime ||
            active_anime.id !==
                opened_anime_id) {
            return;
        }

        const data =
            result.data || {};

        const score_parts = [
            data.anilist_score != null
                ? "⭐ " +
                    Number(
                        data.anilist_score
                    ) +
                    "% AniList"
                : null,
            data.mal_score != null
                ? "⭐ " +
                    Number(
                        data.mal_score
                    ).toFixed(2) +
                    " MAL"
                : null,
            data.kitsu_score != null
                ? "⭐ " +
                    Number(
                        data.kitsu_score
                    ).toFixed(1) +
                    "% Kitsu"
                : null
        ].filter(Boolean);

        const detail_type =
            data.media_type
                ? String(
                    data.media_type
                )
                    .replaceAll(
                        "_",
                        " "
                    )
                    .toUpperCase()
                : media_type;

        anime_detail_meta.textContent =
            [
                detail_type,
                ...score_parts
            ].join(" · ");

        anime_detail_description.textContent =
            data.description ||
            active_anime.description ||
            "No description available.";

        const facts = [
            data.sources?.length
                ? "Data: " +
                    data.sources.join(
                        " · "
                    )
                : null,
            data.total_episodes
                ? "Episodes: " +
                    data.total_episodes
                : null,
            data.average_episode_duration_seconds
                ? "Episode runtime: ~" +
                    Math.round(
                        Number(
                            data.average_episode_duration_seconds
                        ) / 60
                    ) +
                    " min"
                : null,
            data.start_date
                ? "Aired: " +
                    data.start_date
                : null,
            data.finish_date
                ? "Ended: " +
                    data.finish_date
                : null,
            data.status
                ? "Status: " +
                    String(
                        data.status
                    ).replaceAll(
                        "_",
                        " "
                    )
                : null,
            data.genres?.length
                ? "Genres: " +
                    data.genres.join(", ")
                : null
        ].filter(Boolean);

        anime_detail_facts.innerHTML =
            facts.map(
                (fact) =>
                    `<span>${fact}</span>`
            ).join("");

        const patch = {};
        [
            "mal_id",
            "anilist_id",
            "kitsu_id",
            "mal_score",
            "anilist_score",
            "kitsu_score",
            "total_episodes",
            "media_type",
            "start_date",
            "finish_date",
            "poster_url",
            "description",
            "site_url"
        ].forEach((field) => {
            if ((active_anime[field] === null ||
                 active_anime[field] === undefined ||
                 active_anime[field] === "") &&
                data[field] !== null &&
                data[field] !== undefined &&
                data[field] !== "") {
                patch[field] =
                    data[field];
            }
        });

        if ((!active_anime.genres ||
             !active_anime.genres.length) &&
            data.genres?.length) {
            patch.genres =
                data.genres;
        }

        if ((!active_anime.synonyms ||
             !active_anime.synonyms.length) &&
            data.synonyms?.length) {
            patch.synonyms =
                data.synonyms;
        }

        if (!active_anime
            .average_episode_duration_ms &&
            data.average_episode_duration_seconds) {
            patch.average_episode_duration_ms =
                Number(
                    data.average_episode_duration_seconds
                );
        }

        if (Object.keys(patch).length) {
            const {error} =
                await supabase
                    .from("anime")
                    .update(patch)
                    .eq(
                        "id",
                        active_anime.id
                    );

            if (!error) {
                Object.assign(
                    active_anime,
                    patch
                );
                if (patch.poster_url) {
                    anime_edit_cover.src =
                        patch.poster_url;
                    anime_edit_cover.hidden =
                        false;
                }
            }
        }
    } catch (error) {
        console.warn(
            "Unable to enrich anime details from public catalogs:",
            error
        );

        const facts = [
            active_anime.media_type
                ? "Type: " +
                    active_anime.media_type
                        .replaceAll("_", " ")
                : null,
            active_anime.total_episodes
                ? "Episodes: " +
                    active_anime.total_episodes
                : null,
            active_anime.start_date
                ? "Aired: " +
                    active_anime.start_date
                : null,
            active_anime.finish_date
                ? "Ended: " +
                    active_anime.finish_date
                : null,
            active_anime.genres?.length
                ? "Genres: " +
                    active_anime.genres.join(", ")
                : null
        ].filter(Boolean);

        anime_detail_description.textContent =
            active_anime.description ||
            "No description available.";
        anime_detail_facts.innerHTML =
            facts.map(
                (fact) =>
                    `<span>${fact}</span>`
            ).join("");
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

anime_watch_section.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-anime-watch-request]");
    if (!button || !active_anime || !active_anime_watch_tmdb_id) return;

    const requested_anime_id = active_anime.id;
    const requested_tmdb_id = active_anime_watch_tmdb_id;
    await request_media_on_seerr(
        {tmdb_id: requested_tmdb_id, title: active_anime.title},
        "show",
        button,
        () => refresh_seerr_status_slot(
            anime_watch_section,
            requested_tmdb_id,
            "show",
            (state) => `data-anime-watch-request
                     data-seerr-french="${state.is_french}"
                     data-seerr-anime="${state.is_anime}"`,
            () => active_anime?.id === requested_anime_id &&
                anime_edit_dialog.open
        )
    );
});

anime_edit_delete?.addEventListener("click", async () => {
    if (!active_anime) return;

    const title = active_anime.title;
    const confirmed = confirm(
        "Remove " + title + " from your Stellaz anime library? " +
        "This does not remove it from MyAnimeList, AniList, or Kitsu."
    );
    if (!confirmed) return;

    const original_text = anime_edit_delete.textContent;
    anime_edit_delete.disabled = true;
    anime_edit_delete.textContent = "Removing...";

    try {
        const {error} = await supabase
            .from("anime")
            .delete()
            .eq("id", active_anime.id);
        if (error) throw error;

        anime_edit_dialog.close();
        active_anime = null;
        await load_anime_library();
        show_toast(title + " removed from your anime library.");
    } catch (error) {
        console.error("Unable to remove anime:", error);
        alert("Unable to remove this anime. Please try again.");
    } finally {
        anime_edit_delete.disabled = false;
        anime_edit_delete.textContent = original_text;
    }
});

anime_view_seasons.addEventListener("click", () => {
    if (!active_anime) return;

    const year = active_anime.start_date
        ? Number(String(active_anime.start_date).slice(0, 4))
        : undefined;

    anime_edit_dialog.close();
    open_show_seasons(
        {
            id: null,
            title: active_anime.title,
            year
        },
        "ANIME",
        true
    );
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
        const score =
            anime_edit_score.value === ""
                ? null
                : Number(
                    anime_edit_score.value
                );

        let watched =
            selected_anime_episode;
        const total =
            Number(
                active_anime.total_episodes ||
                0
            );

        if (anime_edit_status.value ===
                "completed" &&
            total > 0) {
            watched = total;
        }

        const {error} =
            await supabase
                .from("anime")
                .update({
                    status:
                        anime_edit_status.value,
                    episodes_watched:
                        watched,
                    my_rating:
                        score,
                    synced_at:
                        new Date().toISOString(),
                    activity_at:
                        new Date().toISOString()
                })
                .eq(
                    "id",
                    active_anime.id
                );

        if (error) throw error;

        const should_sync_mal =
            Boolean(
                active_anime.mal_id
            ) &&
            mal_connect_button
                ?.dataset.connected ===
                "true";

        let mal_sync_failed = false;

        if (should_sync_mal) {
            try {
                const update_mal =
                    httpsCallable(
                        functions,
                        "updateMALAnimeStatus"
                    );

                await update_mal({
                    anime_id:
                        active_anime.mal_id,
                    status:
                        anime_edit_status.value,
                    episodes_watched:
                        watched,
                    total_episodes:
                        total,
                    score
                });
            } catch (mal_error) {
                mal_sync_failed = true;
                console.warn(
                    "Saved in Stellaz, but MAL sync failed:",
                    mal_error
                );
            }
        }

        anime_edit_dialog.close();
        await load_anime_library();

        show_toast(
            mal_sync_failed
                ? "Saved in Stellaz. MyAnimeList sync failed."
                : should_sync_mal
                    ? "Saved in Stellaz and synced to MyAnimeList."
                    : "Anime progress saved in Stellaz."
        );
    } catch (error) {
        console.error(
            "Unable to update anime:",
            error
        );
        alert(
            "Unable to save this anime. Please try again."
        );
    } finally {
        anime_edit_save.disabled = false;
        anime_edit_save.textContent =
            "Save changes";
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
            activity_at: item.mal_updated_at || null,
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
                if (existing.status !== "watched") {
                    patch.watched_at =
                        new Date().toISOString();
                }
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
            ...(item.status === "watched"
                ? {watched_at: new Date().toISOString()}
                : {}),
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
let plex_connected_for_explore = false;

async function load_plex_connection_status() {
    if (!plex_connect_button) return;

    const plex_connection_label =
        document.getElementById("plex_connection_label");

    try {
        const result = await httpsCallable(functions, "getPlexConnectionStatus")();

        if (result.data.connected) {
            plex_connected_for_explore = true;
            recent_plex_loaded = false;
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
            load_recent_plex_sidebar()
                .catch(() => {});
            return;
        }

        plex_connected_for_explore = false;
        recent_plex_panel?.setAttribute(
            "hidden",
            ""
        );
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
    // tmdb_id is the reliable signal when both sides have one (matches the
    // same tmdb-first pattern find_existing_movie_for_tmdb/
    // find_existing_show_for_tmdb already use). Title text can differ
    // between Plex and Stellaz for the same title (accents, punctuation,
    // "and" vs "&", a missing/extra year) without tmdb_id to fall back on,
    // which otherwise creates duplicate rows on import.
    if (a.tmdb_id && b.tmdb_id) {
        return Number(a.tmdb_id) === Number(b.tmdb_id);
    }
    return notification_normalize_title(a.title) === notification_normalize_title(b.title) &&
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
                watched_at: new Date().toISOString(),
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
        // Plex tags anime shows (Animation genre + Japan country) the same
        // way the Seerr routing does. Split those out before dedup so they
        // land in the Anime library instead of TV Shows.
        const anime_shows = (data.shows || []).filter((item) => item.is_anime);
        const tv_shows_only = (data.shows || []).filter((item) => !item.is_anime);
        const new_movies = (data.movies || []).filter((item) =>
            !movie_library.some((existing) => same_library_title(existing, item)));
        const new_shows = tv_shows_only.filter((item) =>
            !show_library.some((existing) => same_library_title(existing, item)));
        const new_anime = anime_shows.filter((item) =>
            !anime_library.some((existing) =>
                notification_normalize_title(existing.title) ===
                    notification_normalize_title(item.title)));
        const movie_rating_updates = (data.movies || []).filter((item) =>
            item.rating != null && movie_library.some((existing) =>
                same_library_title(existing, item) &&
                Number(existing.my_rating) !== Number(item.rating)));
        const show_rating_updates = tv_shows_only.filter((item) =>
            item.rating != null && show_library.some((existing) =>
                same_library_title(existing, item) &&
                Number(existing.my_rating) !== Number(item.rating)));
        const rating_updates = movie_rating_updates.length + show_rating_updates.length;
        const rated_new_titles = [...new_movies, ...new_shows, ...new_anime]
            .filter((item) => item.rating != null && Number(item.rating) > 0);
        const ratings_on_new_titles = rated_new_titles.length;
        plex_import_preview = {
            ...data, new_movies, new_shows, new_anime,
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
        plex_import_summary.textContent = `Found ${data.movies.length} movies, ${tv_shows_only.length} TV shows and ${anime_shows.length} anime on ${data.server}.` + (rated_new_titles.length ? ` Rated missing: ${rated_new_titles.map((item) => item.title).join(", ")}.` : "");
        plex_import_stats.innerHTML = `
            <div><strong>${new_movies.length}</strong><span>new movies</span></div>
            <div><strong>${new_shows.length}</strong><span>new TV shows</span></div>
            <div><strong>${new_anime.length}</strong><span>new anime</span></div>
            <div><strong>${rating_updates}</strong><span>ratings to update</span></div>
            <div><strong>${ratings_on_new_titles}</strong><span>ratings on new titles</span></div>
            <div><strong>${Number(data.watched_episode_count || 0)}</strong><span>watched episodes</span></div>`;
        plex_import_confirm.disabled =
            new_movies.length + new_shows.length + new_anime.length + rating_updates === 0;
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
            ...(item.watched
                ? {watched_at: new Date().toISOString()}
                : {}),
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
        const anime_rows = [];
        for (const item of plex_import_preview.new_anime) {
            const total = Number(item.total_episodes || 0);
            const watched = Number(item.watched_episodes || 0);
            anime_rows.push({
                title: item.title,
                media_type: "tv",
                status: total > 0 && watched >= total ? "completed" : "watching",
                episodes_watched: watched,
                activity_at: new Date().toISOString(),
                ...(total ? {total_episodes: total} : {}),
                poster_url: await get_plex_poster_data_url(item.plex_thumb),
                ...(item.genres?.length ? {genres: item.genres} : {}),
                ...(item.rating != null ? {my_rating: Number(item.rating)} : {})
            });
        }

        if (movie_rows.length) {
            const {error} = await supabase.from("movies").insert(movie_rows);
            if (error) throw error;
        }
        if (show_rows.length) {
            const {error} = await supabase.from("tv_shows").insert(show_rows);
            if (error) throw error;
        }
        if (anime_rows.length) {
            const {error} = await supabase.from("anime").insert(anime_rows);
            if (error) throw error;
            await load_anime_library();
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
        const added = movie_rows.length + show_rows.length + anime_rows.length;
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


const friend_activity_panel =
    document.getElementById("friend_activity_panel");
const friend_activity_count =
    document.getElementById("friend_activity_count");
const friend_activity_grids = {
    movie:
        document.getElementById(
            "friend_activity_movie_grid"
        ),
    show:
        document.getElementById(
            "friend_activity_show_grid"
        ),
    anime:
        document.getElementById(
            "friend_activity_anime_grid"
        ),
    manga:
        document.getElementById(
            "friend_activity_manga_grid"
        )
};
const friends_overview_grid =
    document.getElementById(
        "friends_overview_grid"
    );
const friends_overview_count =
    document.getElementById(
        "friends_overview_count"
    );

let friend_activity_data = {
    friend_count: 0,
    items: []
};
let active_entertainment_category =
    "Movies";

function friend_activity_time_label(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return "";

    const seconds = Math.max(
        0,
        Math.floor((Date.now() - time) / 1000)
    );

    if (seconds < 60) return "just now";
    if (seconds < 3600) {
        const minutes =
            Math.floor(seconds / 60);
        return minutes + "m ago";
    }
    if (seconds < 86400) {
        const hours =
            Math.floor(seconds / 3600);
        return hours + "h ago";
    }

    const days =
        Math.floor(seconds / 86400);
    if (days < 30) return days + "d ago";

    return new Date(time)
        .toLocaleDateString(
            undefined,
            {
                month: "short",
                day: "numeric"
            }
        );
}

function friend_activity_type_label(type) {
    return ({
        movie: "MOVIE",
        show: "TV",
        anime: "ANIME",
        manga: "MANGA"
    })[type] || String(type || "")
        .toUpperCase();
}

function render_friend_activity_cards(
    grid,
    items
) {
    if (!grid) return;

    grid.replaceChildren();

    const limit =
        window.matchMedia(
            "(max-width: 700px)"
        ).matches
            ? 6
            : 7;
    const visible =
        items.slice(0, limit);

    if (!visible.length) {
        const empty =
            document.createElement("p");
        empty.className =
            "recommendation-loading";
        empty.textContent =
            "No recent activity in this category yet.";
        grid.appendChild(empty);
        return;
    }

    visible.forEach((item) => {
        const card =
            document.createElement("article");
        card.className =
            "recommendation-card friend-activity-card";

        const poster_wrap =
            document.createElement("div");
        poster_wrap.className =
            "friend-activity-poster-wrap";

        if (item.poster_url) {
            const poster =
                document.createElement("img");
            poster.className =
                "recommendation-poster";
            poster.src =
                item.poster_url;
            poster.alt =
                (item.title || "Title") +
                " poster";
            poster.loading = "lazy";
            poster_wrap.appendChild(
                poster
            );
        } else {
            const placeholder =
                document.createElement("div");
            placeholder.className =
                "poster-placeholder";
            placeholder.textContent =
                String(
                    item.title || "?"
                ).slice(0, 1);
            poster_wrap.appendChild(
                placeholder
            );
        }

        const type_badge =
            document.createElement("span");
        type_badge.className =
            "friend-activity-type";
        type_badge.textContent =
            friend_activity_type_label(
                item.media_type
            );
        poster_wrap.appendChild(
            type_badge
        );

        const title =
            document.createElement("h3");
        title.textContent =
            item.title || "Untitled";

        const meta =
            document.createElement("p");
        meta.className =
            "friend-activity-meta";

        const friend_name =
            document.createElement("strong");
        friend_name.textContent =
            item.friend?.username ||
            "Friend";

        const detail =
            document.createElement("span");
        const parts = [
            item.detail ||
                (
                    item.media_type ===
                    "manga"
                        ? "Updated reading progress"
                        : "Watched"
                ),
            friend_activity_time_label(
                item.activity_at
            )
        ].filter(Boolean);

        detail.textContent =
            " · " +
            parts.join(" · ");

        meta.append(
            friend_name,
            detail
        );

        card.append(
            poster_wrap,
            title,
            meta
        );
        grid.appendChild(card);
    });
}

function render_friend_recent_activity(
    data = friend_activity_data
) {
    if (!friend_activity_panel ||
        !friend_activity_count) {
        return;
    }

    friend_activity_data = {
        friend_count:
            Number(
                data?.friend_count || 0
            ),
        items:
            Array.isArray(data?.items)
                ? data.items
                : []
    };

    const friend_count =
        friend_activity_data
            .friend_count;

    if (friend_count <= 0) {
        friend_activity_panel.hidden =
            true;
        return;
    }

    friend_activity_panel.hidden =
        false;
    friend_activity_count.textContent =
        friend_count +
        (
            friend_count === 1
                ? " FRIEND"
                : " FRIENDS"
        );

    for (const type of [
        "movie",
        "show",
        "anime",
        "manga"
    ]) {
        render_friend_activity_cards(
            friend_activity_grids[type],
            friend_activity_data.items
                .filter(
                    (item) =>
                        item.media_type ===
                        type
                )
        );
    }
}

async function load_friend_recent_activity() {
    if (!friend_activity_panel) return;

    try {
        const get_activity =
            httpsCallable(
                functions,
                "getFriendRecentActivity"
            );
        const result =
            await get_activity();

        render_friend_recent_activity(
            result.data || {}
        );
    } catch (error) {
        console.error(
            "Unable to load recent friend activity:",
            error
        );
        friend_activity_panel.hidden =
            true;
    }
}

function render_entertainment_friends(
    friends
) {
    if (!friends_overview_grid ||
        !friends_overview_count) {
        return;
    }

    friends_overview_grid
        .replaceChildren();

    friends_overview_count.textContent =
        friends.length +
        (
            friends.length === 1
                ? " FRIEND"
                : " FRIENDS"
        );

    if (!friends.length) {
        const empty =
            document.createElement("p");
        empty.className =
            "recommendation-loading";
        empty.textContent =
            "No friends yet. You can add friends from your profile menu.";
        friends_overview_grid
            .appendChild(empty);
        return;
    }

    friends.forEach((profile) => {
        const card =
            document.createElement("article");
        card.className =
            "entertainment-friend-card";

        const avatar_wrap =
            document.createElement("div");
        avatar_wrap.className =
            "entertainment-friend-avatar";

        if (profile.profile_avatar) {
            const image =
                document.createElement("img");
            image.src =
                profile.profile_avatar;
            image.alt = "";
            avatar_wrap.appendChild(
                image
            );
        } else {
            avatar_wrap.textContent =
                String(
                    profile.username ||
                    "?"
                ).slice(0, 1)
                    .toUpperCase();
        }

        const copy =
            document.createElement("div");
        const name =
            document.createElement("strong");
        name.textContent =
            profile.username ||
            "Stellaz user";

        const status =
            document.createElement("span");
        status.textContent =
            "Friend";

        copy.append(
            name,
            status
        );
        card.append(
            avatar_wrap,
            copy
        );
        friends_overview_grid
            .appendChild(card);
    });
}

async function load_entertainment_friends() {
    if (!friends_overview_grid) return;

    try {
        const get_overview =
            httpsCallable(
                functions,
                "getFriendOverview"
            );
        const result =
            await get_overview();
        render_entertainment_friends(
            result.data?.friends || []
        );
    } catch (error) {
        console.error(
            "Unable to load Entertainment friends:",
            error
        );
        friends_overview_count.textContent =
            "ERROR";
        friends_overview_grid.innerHTML =
            '<p class="recommendation-loading">Unable to load friends right now.</p>';
    }
}


//? ----------------------------------
//* ----- Explore Hub ---------------
//? ----------------------------------
//#region
const explore_view =
    document.getElementById(
        "explore_view"
    );
const recent_library_stack =
    document.getElementById(
        "recent_library_stack"
    );
const recent_plex_panel =
    document.getElementById(
        "recent_plex_panel"
    );
const recent_plex_stack =
    document.getElementById(
        "recent_plex_stack"
    );

function recent_sidebar_escape(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function recent_sidebar_time(value) {
    const time =
        new Date(value || 0).getTime();
    if (!Number.isFinite(time) ||
        time <= 0) {
        return "";
    }

    const diff =
        Math.max(
            0,
            Date.now() - time
        );
    const hours =
        Math.floor(
            diff / 3600000
        );

    if (hours < 1) return "Just added";
    if (hours < 24) {
        return hours + "h ago";
    }

    const days =
        Math.floor(hours / 24);
    if (days < 30) {
        return days + "d ago";
    }

    return new Date(time)
        .toLocaleDateString(
            undefined,
            {
                month: "short",
                day: "numeric"
            }
        );
}

function recent_library_items() {
    const items = [
        ...movie_library.map(
            (item) => ({
                ...item,
                recent_type: "movie",
                recent_label: "Movie",
                recent_added_at:
                    item.added_at
            })
        ),
        ...show_library.map(
            (item) => ({
                ...item,
                recent_type: "show",
                recent_label: "TV Show",
                recent_added_at:
                    item.added_at
            })
        ),
        ...anime_library.map(
            (item) => ({
                ...item,
                recent_type: "anime",
                recent_label: "Anime",
                recent_added_at:
                    item.added_at
            })
        ),
        ...manga_library.map(
            (item) => ({
                ...item,
                recent_type: "manga",
                recent_label:
                    item.media_kind ||
                    "Manga",
                recent_added_at:
                    item.added_at
            })
        )
    ];

    return items
        .filter(
            (item) =>
                item.recent_added_at
        )
        .sort(
            (a, b) =>
                new Date(
                    b.recent_added_at
                ).getTime() -
                new Date(
                    a.recent_added_at
                ).getTime()
        )
        .slice(0, 8);
}

function recent_sidebar_card(
    item,
    {
        library = false,
        index = 0
    } = {}
) {
    const title =
        recent_sidebar_escape(
            item.title ||
            "Untitled"
        );
    const poster =
        item.poster_url
            ? '<img class="recent-media-poster" src="' +
                recent_sidebar_escape(
                    item.poster_url
                ) +
                '" alt="' + title +
                '" loading="lazy" decoding="async">'
            : '<span class="recent-media-poster-placeholder" aria-hidden="true">◇</span>';
    const library_data =
        library
            ? ' data-recent-library-type="' +
                recent_sidebar_escape(
                    item.recent_type
                ) +
                '" data-recent-library-id="' +
                recent_sidebar_escape(
                    item.id
                ) + '"'
            : "";

    return (
        '<button class="recent-deck-card" type="button"' +
            library_data +
            ' data-recent-carousel-index="' +
            index +
            '" aria-label="' + title + '">' +
            poster +
        '</button>'
    );
}

function set_recent_carousel_index(
    stack,
    next_index
) {
    const cards =
        Array.from(
            stack.querySelectorAll(
                ".recent-deck-card"
            )
        );
    if (!cards.length) return;

    const index =
        Math.max(
            0,
            Math.min(
                cards.length - 1,
                next_index
            )
        );
    stack.dataset.recentCarouselIndex =
        String(index);

    cards.forEach((card, card_index) => {
        const offset =
            card_index - index;
        card.dataset.carouselOffset =
            String(offset);
        card.classList.toggle(
            "is-active",
            offset === 0
        );
        card.tabIndex =
            Math.abs(offset) <= 2
                ? 0
                : -1;
        card.setAttribute(
            "aria-hidden",
            Math.abs(offset) > 2
                ? "true"
                : "false"
        );
    });
}

function initialize_recent_carousel(stack) {
    if (!stack) return;

    set_recent_carousel_index(
        stack,
        Number(
            stack.dataset
                .recentCarouselIndex ||
            0
        )
    );

    if (stack.dataset.carouselReady ===
        "true") {
        return;
    }
    stack.dataset.carouselReady = "true";

    let wheel_locked = false;
    stack.addEventListener(
        "wheel",
        (event) => {
            if (Math.abs(event.deltaY) <
                Math.abs(event.deltaX) ||
                Math.abs(event.deltaY) < 8) {
                return;
            }
            event.preventDefault();

            if (wheel_locked) return;
            wheel_locked = true;
            window.setTimeout(
                () => {
                    wheel_locked = false;
                },
                240
            );

            const current =
                Number(
                    stack.dataset
                        .recentCarouselIndex ||
                    0
                );
            set_recent_carousel_index(
                stack,
                current +
                    (event.deltaY > 0
                        ? 1
                        : -1)
            );
        },
        {passive: false}
    );

    stack.addEventListener(
        "click",
        (event) => {
            const card =
                event.target.closest(
                    "[data-recent-carousel-index]"
                );
            if (!card ||
                card.classList.contains(
                    "is-active"
                )) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            set_recent_carousel_index(
                stack,
                Number(
                    card.dataset
                        .recentCarouselIndex
                )
            );
        }
    );
}

function render_recent_library_sidebar() {
    if (!recent_library_stack) {
        return;
    }

    const items =
        recent_library_items();

    recent_library_stack.innerHTML =
        items.length
            ? items.map(
                (item, index) =>
                    recent_sidebar_card(
                        item,
                        {
                            library: true,
                            index
                        }
                    )
            ).join("")
            : '<p class="recent-media-empty">Your recent library additions will appear here.</p>';

    initialize_recent_carousel(
        recent_library_stack
    );
}

recent_library_stack?.addEventListener(
    "click",
    (event) => {
        const button =
            event.target.closest(
                "[data-recent-library-type]"
            );
        if (!button) return;

        if (!button.classList.contains(
            "is-active"
        )) {
            set_recent_carousel_index(
                recent_library_stack,
                Number(
                    button.dataset
                        .recentCarouselIndex
                )
            );
            return;
        }

        const type =
            button.dataset
                .recentLibraryType;
        const id =
            String(
                button.dataset
                    .recentLibraryId ||
                ""
            );

        if (type === "movie") {
            const item =
                movie_library.find(
                    (entry) =>
                        String(entry.id) ===
                        id
                );
            if (item) {
                open_library_detail(
                    "movie",
                    item
                );
            }
            return;
        }

        if (type === "show") {
            const item =
                show_library.find(
                    (entry) =>
                        String(entry.id) ===
                        id
                );
            if (item) {
                open_library_detail(
                    "show",
                    item
                );
            }
            return;
        }

        if (type === "anime") {
            open_anime_editor(
                Number(id)
            );
            return;
        }

        if (type === "manga") {
            open_manga_editor(
                Number(id)
            );
        }
    }
);

let recent_plex_loading = null;
let recent_plex_loaded = false;

async function load_recent_plex_sidebar(
    force = false
) {
    if (!recent_plex_panel ||
        !recent_plex_stack) {
        return;
    }

    if (!plex_connected_for_explore) {
        recent_plex_panel.hidden =
            true;
        return;
    }

    recent_plex_panel.hidden =
        false;

    if (recent_plex_loaded &&
        !force) {
        return;
    }

    if (recent_plex_loading) {
        return recent_plex_loading;
    }

    recent_plex_stack.innerHTML =
        '<p class="recent-media-empty">Loading Plex additions...</p>';

    recent_plex_loading =
        (async () => {
            const result =
                await httpsCallable(
                    functions,
                    "getPlexRecentlyAdded"
                )();
            const raw =
                result.data?.items || [];

            const items =
                await Promise.all(
                    raw.slice(0, 8)
                        .map(
                            async (item) => ({
                                ...item,
                                recent_label:
                                    item.type ===
                                    "movie"
                                        ? "Movie"
                                        : "TV Show",
                                recent_added_at:
                                    item.added_at,
                                poster_url:
                                    await get_plex_poster_data_url(
                                        item.plex_thumb
                                    )
                            })
                        )
                );

            recent_plex_stack.innerHTML =
                items.length
                    ? items.map(
                        (item, index) =>
                            recent_sidebar_card(
                                item,
                                {index}
                            )
                    ).join("")
                    : '<p class="recent-media-empty">Nothing has been added to Plex recently.</p>';

            initialize_recent_carousel(
                recent_plex_stack
            );

            recent_plex_loaded =
                true;
        })();

    try {
        await recent_plex_loading;
    } catch (error) {
        console.error(
            "Unable to load recent Plex additions:",
            error
        );
        recent_plex_stack.innerHTML =
            '<p class="recent-media-empty">Unable to load recent Plex additions.</p>';
    } finally {
        recent_plex_loading =
            null;
    }
}


const explore_state = {
    movie: {
        pool: [],
        recommendations: [],
        releases: [],
        ignored: new Set()
    },
    show: {
        pool: [],
        recommendations: [],
        releases: [],
        ignored: new Set()
    },
    anime: {
        pool: [],
        recommendations: [],
        releases: [],
        ignored: new Set()
    },
    manga: {
        pool: [],
        recommendations: [],
        releases: [],
        ignored: new Set()
    }
};

let explore_loaded = false;
let explore_loading = null;
let entertainment_data_ready =
    false;

function recommendation_id_for_type(
    item,
    type
) {
    if (type === "anime") {
        return Number(
            item.mal_id ||
            item.anilist_id
        );
    }

    if (type === "manga") {
        return Number(
            item.anilist_id
        );
    }

    return Number(
        item.tmdb_id
    );
}

function explore_recommendation_grid(
    type
) {
    return document.getElementById(
        "explore_" +
        type +
        "_recommendation_grid"
    );
}

function explore_new_grid(type) {
    return document.getElementById(
        "explore_" +
        type +
        "_new_grid"
    );
}

function explore_upcoming_grid(type) {
    return document.getElementById(
        "explore_" +
        type +
        "_upcoming_grid"
    );
}

async function load_explore_media(type) {
    const rec_grid =
        explore_recommendation_grid(
            type
        );
    const new_grid =
        explore_new_grid(type);
    const upcoming_grid =
        explore_upcoming_grid(type);
    const count =
        document.querySelector(
            '[data-explore-recommendation-count="' +
            type +
            '"]'
        );

    if (!rec_grid ||
        !new_grid ||
        !upcoming_grid) {
        return;
    }

    rec_grid.innerHTML =
        '<p class="recommendation-loading">Finding recommendations...</p>';
    new_grid.innerHTML =
        '<p class="recommendation-loading">Loading new releases...</p>';
    upcoming_grid.innerHTML =
        '<p class="recommendation-loading">Loading upcoming releases...</p>';

    if (type === "movie") {
        await load_movie_recommendations(
            movie_library
        );
    } else if (type === "show") {
        await load_show_recommendations(
            show_library
        );
    } else if (type === "anime") {
        await load_anime_recommendations(
            anime_library
        );
    } else {
        await load_manga_recommendations(
            manga_library
        );
    }

    explore_state[type].pool =
        [...recommendation_pool];
    explore_state[type].recommendations =
        [...visible_recommendations];
    explore_state[type].ignored =
        new Set(
            ignored_recommendation_ids
        );

    rec_grid.innerHTML =
        recommendation_grid.innerHTML;
    if (count) {
        count.textContent =
            visible_recommendations.length +
            " PICKS";
    }

    await load_release_rows(type);

    explore_state[type].releases =
        [...release_items];
    new_grid.innerHTML =
        new_release_grid.innerHTML;
    upcoming_grid.innerHTML =
        upcoming_release_grid.innerHTML;

    requestAnimationFrame(() => {
        [
            rec_grid,
            new_grid,
            upcoming_grid
        ].forEach(
            setup_explore_loop
        );
        refresh_explore_scroll_controls();
    });
}

async function load_explore_view(
    force = false
) {
    if (!entertainment_data_ready) {
        return;
    }

    if (explore_loaded &&
        !force) {
        return;
    }

    if (explore_loading) {
        return explore_loading;
    }

    explore_loading =
        (async () => {
            for (const type of [
                "movie",
                "show",
                "anime",
                "manga"
            ]) {
                await load_explore_media(
                    type
                );
            }

            active_recommendation_type =
                "movie";
            release_rows_type =
                "movie";
            explore_loaded = true;
        })();

    try {
        await explore_loading;
    } finally {
        explore_loading = null;
    }
}

function activate_explore_recommendation_state(
    type
) {
    active_recommendation_type =
        type;
    recommendation_pool =
        explore_state[type].pool;
    visible_recommendations =
        explore_state[type]
            .recommendations;
    ignored_recommendation_ids =
        explore_state[type].ignored;
}

function clone_explore_loop_card(card) {
    const clone =
        card.cloneNode(true);
    clone.dataset.exploreClone =
        "true";
    clone.setAttribute(
        "aria-hidden",
        "true"
    );

    clone
        .querySelectorAll(
            "button, a, input, select, textarea, [tabindex]"
        )
        .forEach((control) => {
            control.setAttribute(
                "tabindex",
                "-1"
            );
        });

    clone
        .querySelectorAll("img")
        .forEach((image) => {
            image.loading = "lazy";
            image.decoding = "async";
            image.fetchPriority = "low";
        });

    return clone;
}

function update_recommendation_focus_deck(track) {
    if (!track?.classList.contains(
        "recommendation-focus-deck"
    )) return;

    const cards = Array.from(
        track.querySelectorAll(
            ":scope > .recommendation-card"
        )
    );
    if (!cards.length) return;

    const track_rect =
        track.getBoundingClientRect();
    const center =
        track_rect.left +
        track_rect.width / 2;

    const ordered = cards
        .map((card) => {
            const rect =
                card.getBoundingClientRect();
            return {
                card,
                distance: Math.abs(
                    rect.left +
                    rect.width / 2 -
                    center
                )
            };
        })
        .sort(
            (a, b) =>
                a.distance -
                b.distance
        );

    cards.forEach((card) => {
        card.dataset.focusDeck =
            "far";
    });

    ordered.slice(0, 5)
        .forEach(({card}) => {
            card.dataset.focusDeck =
                "sharp";
        });

    ordered.slice(5, 7)
        .forEach(({card}) => {
            card.dataset.focusDeck =
                "soft";
        });
}

function setup_explore_loop(track) {
    if (!track) return;

    // Keep only the real cards. Clone-based infinite scrolling caused
    // unstable hover/click hit testing once Explore became narrower.
    track
        .querySelectorAll(
            ":scope > [data-explore-clone]"
        )
        .forEach(
            (clone) => clone.remove()
        );

    track.dataset.exploreLoop =
        "false";
    track.dataset.exploreLoopReady =
        "true";
    track.dataset.exploreLoopAdjusting =
        "false";
    track.removeAttribute(
        "data-explore-loop-start"
    );
    track.removeAttribute(
        "data-explore-loop-width"
    );
    track.removeAttribute(
        "data-explore-loop-buffer"
    );

    update_explore_scroll_controls(
        track.closest(
            ".explore-row"
        )
    );
    update_recommendation_focus_deck(
        track
    );
    enable_explore_focus_deck_drag(
        track
    );
}

function normalize_explore_loop_position(
    track
) {
    if (!track ||
        track.dataset.exploreLoop !==
            "true" ||
        track.dataset
            .exploreLoopReady !==
            "true" ||
        track.dataset
            .exploreLoopAdjusting ===
            "true") {
        return;
    }

    const start =
        Number(
            track.dataset
                .exploreLoopStart
        );
    const width =
        Number(
            track.dataset
                .exploreLoopWidth
        );

    if (!Number.isFinite(start) ||
        !Number.isFinite(width) ||
        width <= 0) {
        return;
    }

    let next =
        track.scrollLeft;

    if (next < start) {
        next += width;
    } else if (
        next >= start + width
    ) {
        next -= width;
    } else {
        return;
    }

    track.dataset
        .exploreLoopAdjusting =
        "true";
    track.style.scrollBehavior =
        "auto";
    track.scrollLeft = next;

    requestAnimationFrame(() => {
        track.style.removeProperty(
            "scroll-behavior"
        );
        track.dataset
            .exploreLoopAdjusting =
            "false";
    });
}

function update_explore_scroll_controls(row) {
    const track =
        row?.querySelector(
            ".explore-scroll-track"
        );
    if (!track) return;

    const left_button =
        row.querySelector(
            '[data-explore-scroll="left"]'
        );
    const right_button =
        row.querySelector(
            '[data-explore-scroll="right"]'
        );
    const is_looping =
        track.dataset.exploreLoop ===
            "true";
    const has_overflow =
        is_looping ||
        track.scrollWidth >
            track.clientWidth + 4;

    if (!has_overflow) {
        left_button?.classList.add(
            "is-hidden"
        );
        right_button?.classList.add(
            "is-hidden"
        );
        return;
    }

    right_button?.classList.remove(
        "is-hidden"
    );

    left_button?.classList.toggle(
        "is-hidden",
        is_looping &&
            row.dataset.exploreMoved !==
                "true"
    );

    if (!is_looping) {
        const at_start =
            track.scrollLeft <= 2;
        left_button?.classList.toggle(
            "is-hidden",
            at_start
        );
    }
}

function handle_explore_track_scroll(
    track
) {
    if (!track) return;

    if (track.dataset
        .exploreLoopReady ===
        "true" &&
        track.dataset
            .exploreLoopAdjusting !==
            "true") {
        track.closest(
            ".explore-row"
        )?.setAttribute(
            "data-explore-moved",
            "true"
        );
    }

    normalize_explore_loop_position(
        track
    );
    update_explore_scroll_controls(
        track.closest(
            ".explore-row"
        )
    );
    update_recommendation_focus_deck(
        track
    );
}

function enable_explore_focus_deck_drag(track) {
    if (!track?.classList.contains(
        "recommendation-focus-deck"
    ) ||
        track.dataset.focusDragReady ===
            "true") {
        return;
    }

    track.dataset.focusDragReady = "true";

    let dragging = false;
    let moved = false;
    let start_x = 0;
    let start_scroll = 0;

    track.addEventListener(
        "pointerdown",
        (event) => {
            if (event.button !== 0) return;
            dragging = true;
            moved = false;
            start_x = event.clientX;
            start_scroll = track.scrollLeft;
            track.classList.add(
                "is-dragging"
            );
            track.setPointerCapture?.(
                event.pointerId
            );
        }
    );

    track.addEventListener(
        "pointermove",
        (event) => {
            if (!dragging) return;
            const delta =
                event.clientX - start_x;
            if (Math.abs(delta) > 5) {
                moved = true;
            }
            if (!moved) return;
            event.preventDefault();
            track.scrollLeft =
                start_scroll - delta;
        }
    );

    const finish_drag = (event) => {
        if (!dragging) return;
        dragging = false;
        track.classList.remove(
            "is-dragging"
        );
        try {
            track.releasePointerCapture?.(
                event.pointerId
            );
        } catch (_) {}
    };

    track.addEventListener(
        "pointerup",
        finish_drag
    );
    track.addEventListener(
        "pointercancel",
        finish_drag
    );

    track.addEventListener(
        "click",
        (event) => {
            if (!moved) return;
            event.preventDefault();
            event.stopPropagation();
            moved = false;
        },
        true
    );

    track.addEventListener(
        "wheel",
        (event) => {
            if (Math.abs(event.deltaY) <=
                Math.abs(event.deltaX)) {
                return;
            }
            if (track.scrollWidth <=
                track.clientWidth + 4) {
                return;
            }
            event.preventDefault();
            track.scrollLeft +=
                event.deltaY;
        },
        { passive: false }
    );
}

const explore_scroll_frames =
    new WeakSet();

function schedule_explore_track_scroll(
    track
) {
    if (!track ||
        explore_scroll_frames.has(
            track
        )) {
        return;
    }

    explore_scroll_frames.add(
        track
    );

    requestAnimationFrame(() => {
        explore_scroll_frames.delete(
            track
        );
        handle_explore_track_scroll(
            track
        );
    });
}

function refresh_explore_scroll_controls() {
    explore_view
        ?.querySelectorAll(
            ".explore-row"
        )
        .forEach(
            update_explore_scroll_controls
        );
}

function setup_explore_loops(
    root = explore_view
) {
    root
        ?.querySelectorAll(
            ".explore-scroll-track"
        )
        .forEach(
            setup_explore_loop
        );
}

explore_view
    ?.querySelectorAll(
        ".explore-scroll-track"
    )
    .forEach((track) => {
        track.addEventListener(
            "scroll",
            () =>
                schedule_explore_track_scroll(
                    track
                ),
            {passive: true}
        );
    });

let explore_resize_timeout = null;
window.addEventListener(
    "resize",
    () => {
        clearTimeout(
            explore_resize_timeout
        );
        explore_resize_timeout =
            setTimeout(
                () => {
                    setup_explore_loops();
                    refresh_explore_scroll_controls();
                },
                120
            );
    }
);

explore_view?.addEventListener(
    "click",
    async (event) => {
        const scroll_button =
            event.target.closest(
                "[data-explore-scroll]"
            );

        if (scroll_button) {
            const row =
                scroll_button.closest(
                    ".explore-row"
                );
            const track =
                row?.querySelector(
                    ".explore-scroll-track"
                );

            if (!track) return;

            row.dataset.exploreMoved =
                "true";

            const direction =
                scroll_button.dataset
                    .exploreScroll ===
                "left"
                    ? -1
                    : 1;
            const distance =
                Math.max(
                    track.clientWidth * 0.86,
                    260
                );

            const max_scroll =
                Math.max(
                    0,
                    track.scrollWidth -
                        track.clientWidth
                );
            const near_start =
                track.scrollLeft <= 4;
            const near_end =
                track.scrollLeft >=
                    max_scroll - 4;

            if (direction > 0 &&
                near_end) {
                track.scrollTo({
                    left: 0,
                    behavior: "smooth"
                });
            } else if (
                direction < 0 &&
                near_start
            ) {
                track.scrollTo({
                    left: max_scroll,
                    behavior: "smooth"
                });
            } else {
                track.scrollBy({
                    left:
                        direction *
                        distance,
                    behavior: "smooth"
                });
            }
            return;
        }

        const block =
            event.target.closest(
                "[data-explore-media]"
            );
        if (!block) return;

        const type =
            block.dataset.exploreMedia;
        const state =
            explore_state[type];
        if (!state) return;

        const release_card =
            event.target.closest(
                ".release-card"
            );

        if (release_card) {
            const item =
                state.releases.find(
                    (entry) =>
                        release_item_id(
                            entry
                        ) ===
                        Number(
                            release_card
                                .dataset
                                .releaseId
                        )
                );
            if (!item) return;

            release_rows_type =
                type;

            const action =
                event.target.closest(
                    "[data-release-action]"
                );

            if (action) {
                await run_release_action(
                    item,
                    action.dataset
                        .releaseAction,
                    action
                );
                return;
            }

            if (event.target.closest(
                "[data-release-next]"
            )) {
                release_card.remove();
                return;
            }

            if (event.target.closest(
                "[data-release-open]"
            )) {
                await open_release_details(
                    item
                );
            }
            return;
        }

        const card =
            event.target.closest(
                ".recommendation-card"
            );
        if (!card) return;

        activate_explore_recommendation_state(
            type
        );

        const item =
            state.pool.find(
                (entry) =>
                    recommendation_id_for_type(
                        entry,
                        type
                    ) ===
                    Number(
                        card.dataset
                            .recommendationId
                    )
            );
        if (!item) return;

        const action =
            event.target.closest(
                "[data-rec-action]"
            );

        if (action) {
            await run_recommendation_action(
                item,
                action.dataset
                    .recAction,
                action
            );

            if (action.dataset
                .recAction !==
                "request_seerr") {
                card.remove();
            }
            return;
        }

        const refresh =
            event.target.closest(
                ".recommendation-refresh"
            );

        if (refresh) {
            const current_id =
                recommendation_id_for_type(
                    item,
                    type
                );

            state.ignored.add(
                current_id
            );

            const visible_ids =
                new Set(
                    [...block.querySelectorAll(
                        "[data-recommendation-id]"
                    )]
                        .map(
                            (entry) =>
                                Number(
                                    entry.dataset
                                        .recommendationId
                                )
                        )
                );

            const next =
                state.pool.find(
                    (entry) => {
                        const id =
                            recommendation_id_for_type(
                                entry,
                                type
                            );
                        return !state.ignored
                            .has(id) &&
                            !visible_ids
                                .has(id);
                    }
                );

            if (!next) {
                card.remove();
                return;
            }

            active_recommendation_type =
                type;
            const holder =
                document.createElement(
                    "div"
                );
            holder.innerHTML =
                create_recommendation_card(
                    next
                );
            card.replaceWith(
                holder.firstElementChild
            );
            return;
        }

        if (event.target.closest(
            "[data-rec-open]"
        )) {
            await open_recommendation_details(
                item
            );
        }
    }
);
//#endregion


//? ----------------------------------
//* ----- Entertainment Navigation --
//? ----------------------------------
//#region
const entertainment_nav_links =
    [...document.querySelectorAll(
        "[data-entertainment-view]"
    )];
const entertainment_view_panels =
    [...document.querySelectorAll(
        "[data-entertainment-view-panel]"
    )];
let active_entertainment_view =
    "explore";

function show_entertainment_view(
    view,
    {
        update_hash = true
    } = {}
) {
    const allowed =
        new Set([
            "explore",
            "friends",
            "collection"
        ]);
    const next =
        allowed.has(view)
            ? view
            : "explore";

    active_entertainment_view =
        next;

    entertainment_view_panels
        .forEach((panel) => {
            panel.hidden =
                panel.dataset
                    .entertainmentViewPanel !==
                next;
        });

    entertainment_nav_links
        .forEach((link) => {
            link.classList.toggle(
                "active",
                link.dataset
                    .entertainmentView ===
                    next
            );
        });

    if (next !== "collection") {
        document.documentElement
            .classList.remove(
                "anime-category-active"
            );
    } else {
        show_entertainment_category(
            active_entertainment_category
        );
    }

    if (update_hash) {
        history.replaceState(
            null,
            "",
            "#" + next
        );
    }

    if (next === "friends") {
        load_entertainment_friends()
            .catch(() => {});
        load_friend_recent_activity()
            .catch(() => {});
    }

    if (next === "explore") {
        render_recent_library_sidebar();
        load_recent_plex_sidebar()
            .catch(() => {});
        load_explore_view()
            .catch((error) =>
                console.error(
                    "Unable to load Explore:",
                    error
                )
            );
    }
}

entertainment_nav_links
    .forEach((link) => {
        link.addEventListener(
            "click",
            (event) => {
                event.preventDefault();
                show_entertainment_view(
                    link.dataset
                        .entertainmentView
                );
            }
        );
    });
//#endregion


onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href =
            "../index.html";
        return;
    }

    try {
        await prepare_supabase_access(
            user
        );

        await finish_plex_connection();
        await load_plex_connection_status();

        await Promise.all([
            load_movie_library({
                refresh_recommendations:
                    false
            }),
            load_show_library()
        ]);

        load_friend_recent_activity()
            .catch((error) =>
                console.error(
                    "Unable to load friend activity:",
                    error
                )
            );
        load_entertainment_friends()
            .catch((error) =>
                console.error(
                    "Unable to load friends:",
                    error
                )
            );

        auto_sync_plex_activity()
            .catch((error) =>
                console.error(
                    "Unable to auto-sync Plex ratings:",
                    error
                )
            );
        sync_plex_episode_progress()
            .catch((error) =>
                console.error(
                    "Unable to auto-sync Plex episode progress:",
                    error
                )
            );

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

        entertainment_data_ready =
            true;
        render_recent_library_sidebar();

        const params =
            new URLSearchParams(
                window.location.search
            );
        const requested_library =
            params.get("library");
        const allowed_libraries = [
            "Movies",
            "TV Shows",
            "Anime",
            "Manga / Manhwa"
        ];

        if (allowed_libraries.includes(
            requested_library
        )) {
            show_entertainment_category(
                requested_library
            );
            show_entertainment_view(
                "collection"
            );
            return;
        }

        const hash_view =
            String(
                window.location.hash || ""
            ).replace("#", "");

        show_entertainment_view(
            [
                "explore",
                "friends",
                "collection"
            ].includes(hash_view)
                ? hash_view
                : "explore",
            {update_hash: false}
        );
    } catch (error) {
        console.error(
            "Unable to prepare Supabase access:",
            error
        );
        movie_count.textContent =
            "Error";
    }
});
//#endregion


//? ------------------------------
//* ----- Collection Navigation --
//? ------------------------------
//#region
const library_cards =
    document.querySelectorAll(
        "[data-library]"
    );
const toast =
    document.getElementById(
        "toast"
    );
const movie_library_panel =
    document.getElementById(
        "movie_library"
    );
const show_library_panel =
    document.getElementById(
        "show_library"
    );
const anime_library_panel =
    document.getElementById(
        "anime_library"
    );
const manga_library_panel =
    document.getElementById(
        "manga_library"
    );

function show_entertainment_category(
    category
) {
    active_entertainment_category =
        category;

    const showing_movies =
        category === "Movies";
    const showing_shows =
        category === "TV Shows";
    const showing_anime =
        category === "Anime";
    const showing_manga =
        category ===
        "Manga / Manhwa";

    document.documentElement
        .classList.toggle(
            "anime-category-active",
            showing_anime &&
            active_entertainment_view ===
                "collection"
        );

    movie_library_panel
        .classList.toggle(
            "category-panel-hidden",
            !showing_movies
        );
    show_library_panel
        .classList.toggle(
            "category-panel-hidden",
            !showing_shows
        );
    anime_library_panel
        .classList.toggle(
            "category-panel-hidden",
            !showing_anime
        );
    manga_library_panel
        .classList.toggle(
            "category-panel-hidden",
            !showing_manga
        );
}

library_cards.forEach((card) => {
    card.addEventListener(
        "click",
        (event) => {
            const library =
                card.dataset.library;

            if ([
                "Movies",
                "TV Shows",
                "Anime",
                "Manga / Manhwa"
            ].includes(library)) {
                event.preventDefault();
                show_entertainment_category(
                    library
                );
                return;
            }

            event.preventDefault();
            toast.textContent =
                library +
                " library is the next page to build.";
            toast.classList.add(
                "show"
            );

            clearTimeout(
                window
                    .entertainment_toast_timeout
            );
            window
                .entertainment_toast_timeout =
                setTimeout(() => {
                    toast.classList.remove(
                        "show"
                    );
                }, 1800);
        }
    );
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

//? -------------------------------------
//* ----- Global Entertainment Search ---
//? -------------------------------------
//#region
const global_search_form =
    document.getElementById("global_search_form");
const global_search_input =
    document.getElementById("global_search_input");
const global_search_dialog =
    document.getElementById("global_search_dialog");
const global_search_close =
    document.getElementById("global_search_close");
const global_search_dialog_form =
    document.getElementById("global_search_dialog_form");
const global_search_dialog_input =
    document.getElementById("global_search_dialog_input");
const global_search_filters =
    document.getElementById("global_search_filters");
const global_search_results =
    document.getElementById("global_search_results");
const global_search_summary =
    document.getElementById("global_search_summary");

let global_search_items = [];
let global_search_filter = "all";
let global_search_request = 0;

function global_search_type_label(type) {
    if (type === "show") return "TV";
    if (type === "anime") return "ANIME";
    if (type === "manga") return "MANGA";
    return "MOVIE";
}

function global_search_item_year(item) {
    if (item.year) return Number(item.year) || null;

    const date =
        item.start_date ||
        item.release_date ||
        item.first_air_date ||
        "";

    return /^\d{4}/.test(String(date))
        ? Number(String(date).slice(0, 4))
        : null;
}

function global_search_item_meta(item) {
    const parts = [];
    const year = global_search_item_year(item);
    if (year) parts.push(String(year));

    if (item.search_type === "anime") {
        if (item.media_type) {
            parts.push(
                String(item.media_type)
                    .replaceAll("_", " ")
                    .toUpperCase()
            );
        }
        if (item.anilist_score != null) {
            parts.push(
                "★ " +
                Number(item.anilist_score) +
                "%"
            );
        }
    } else if (item.search_type === "manga") {
        if (item.media_kind) {
            parts.push(
                String(item.media_kind)
                    .toUpperCase()
            );
        }
        if (item.anilist_score != null) {
            parts.push(
                "★ " +
                Number(item.anilist_score) +
                "%"
            );
        }
    }

    return parts.join(" · ");
}

function global_search_make_button(
    label,
    action,
    primary = false
) {
    const button =
        document.createElement("button");
    button.type = "button";
    button.dataset.globalSearchAction =
        action;
    button.textContent = label;
    if (primary) {
        button.classList.add("primary");
    }
    return button;
}

function render_global_search_results() {
    if (!global_search_results) return;

    const visible =
        global_search_filter === "all"
            ? global_search_items
            : global_search_items.filter(
                (item) =>
                    item.search_type ===
                    global_search_filter
            );

    global_search_results.replaceChildren();

    if (!visible.length) {
        const empty =
            document.createElement("p");
        empty.className =
            "global-search-empty";
        empty.textContent =
            global_search_items.length
                ? "No results in this category."
                : "No titles found.";
        global_search_results.appendChild(
            empty
        );
        return;
    }

    visible.forEach((item, index) => {
        const card =
            document.createElement("article");
        card.className =
            "global-search-result";
        card.dataset.globalSearchIndex =
            String(
                global_search_items.indexOf(
                    item
                )
            );

        const poster_wrap =
            document.createElement("div");
        poster_wrap.className =
            "global-search-poster-wrap";

        if (item.poster_url) {
            const image =
                document.createElement("img");
            image.className =
                "global-search-poster";
            image.src = item.poster_url;
            image.alt =
                (item.title || "Title") +
                " poster";
            image.loading = "lazy";
            poster_wrap.appendChild(image);
        } else {
            const placeholder =
                document.createElement("div");
            placeholder.className =
                "global-search-poster-placeholder";
            placeholder.textContent =
                String(
                    item.title || "?"
                ).slice(0, 1);
            poster_wrap.appendChild(
                placeholder
            );
        }

        const kind =
            document.createElement("span");
        kind.className =
            "global-search-kind";
        kind.textContent =
            global_search_type_label(
                item.search_type
            );
        poster_wrap.appendChild(kind);

        const title =
            document.createElement("h3");
        title.textContent =
            item.title || "Untitled";
        title.title =
            item.title || "";

        const meta =
            document.createElement("p");
        meta.className =
            "global-search-meta";
        meta.textContent =
            global_search_item_meta(item);

        const actions =
            document.createElement("div");
        actions.className =
            "global-search-card-actions";

        if (item.search_type === "movie" ||
            item.search_type === "show") {
            actions.append(
                global_search_make_button(
                    "View details",
                    "details",
                    true
                ),
                global_search_make_button(
                    "＋ Watch later",
                    "watch_later"
                )
            );
        } else if (
            item.search_type === "anime"
        ) {
            actions.append(
                global_search_make_button(
                    "✓ Add watched",
                    "anime_watched",
                    true
                )
            );
        } else {
            actions.append(
                global_search_make_button(
                    "＋ Start reading",
                    "manga_reading",
                    true
                )
            );
        }

        card.append(
            poster_wrap,
            title,
            meta,
            actions
        );
        global_search_results.appendChild(
            card
        );
    });
}

function global_search_set_filter(type) {
    global_search_filter = type;

    global_search_filters
        ?.querySelectorAll(
            "[data-search-filter]"
        )
        .forEach((button) => {
            const active =
                button.dataset
                    .searchFilter === type;
            button.classList.toggle(
                "active",
                active
            );
            button.setAttribute(
                "aria-selected",
                String(active)
            );
        });

    render_global_search_results();
}

async function run_global_search(query) {
    const search =
        String(query || "").trim();

    if (search.length < 2) return;

    const request_id =
        ++global_search_request;
    global_search_dialog_input.value =
        search;
    global_search_input.value =
        search;
    global_search_summary.textContent =
        'Searching for "' +
        search +
        '"...';
    global_search_results.innerHTML =
        '<p class="global-search-loading">Searching movies, TV, anime and manga...</p>';

    if (!global_search_dialog.open) {
        global_search_dialog.showModal();
    }

    const movie_search =
        httpsCallable(
            functions,
            "searchEntertainmentTitles"
        );
    const anime_search_function =
        httpsCallable(
            functions,
            "searchAnimeCatalog"
        );
    const manga_search_function =
        httpsCallable(
            functions,
            "searchAniListManga"
        );

    const settled =
        await Promise.allSettled([
            movie_search({
                query: search,
                type: "movie"
            }),
            movie_search({
                query: search,
                type: "show"
            }),
            anime_search_function({
                query: search
            }),
            manga_search_function({
                query: search
            })
        ]);

    if (request_id !==
        global_search_request) {
        return;
    }

    const movie_results =
        settled[0].status ===
            "fulfilled"
            ? settled[0].value.data
                ?.results || []
            : [];
    const show_results =
        settled[1].status ===
            "fulfilled"
            ? settled[1].value.data
                ?.results || []
            : [];
    const anime_results =
        settled[2].status ===
            "fulfilled"
            ? settled[2].value.data
                ?.results || []
            : [];
    const manga_results =
        settled[3].status ===
            "fulfilled"
            ? settled[3].value.data
                ?.results || []
            : [];

    global_search_items = [
        ...movie_results.map(
            (item) => ({
                ...item,
                search_type: "movie"
            })
        ),
        ...show_results.map(
            (item) => ({
                ...item,
                search_type: "show"
            })
        ),
        ...anime_results.map(
            (item) => ({
                ...item,
                search_type: "anime",
                year:
                    global_search_item_year(
                        item
                    )
            })
        ),
        ...manga_results.map(
            (item) => ({
                ...item,
                search_type: "manga",
                year:
                    global_search_item_year(
                        item
                    )
            })
        )
    ];

    const failures =
        settled.filter(
            (entry) =>
                entry.status ===
                    "rejected"
        );

    if (!global_search_items.length &&
        failures.length === settled.length) {
        global_search_summary.textContent =
            "Search is temporarily unavailable.";
        global_search_results.innerHTML =
            '<p class="global-search-error">Unable to search right now. Please try again.</p>';
        return;
    }

    global_search_summary.textContent =
        global_search_items.length +
        " result" +
        (global_search_items.length === 1
            ? ""
            : "s") +
        ' for "' +
        search +
        '"' +
        (failures.length
            ? " · some sources were unavailable"
            : "");

    global_search_set_filter("all");
}

function anime_catalog_watched_row(item) {
    const total_episodes =
        Number(item.total_episodes || 0);

    return {
        mal_id:
            item.mal_id || null,
        anilist_id:
            item.anilist_id || null,
        kitsu_id:
            item.kitsu_id || null,
        title: item.title,
        title_romaji:
            item.title_romaji,
        title_native:
            item.title_native,
        synonyms:
            item.synonyms || [],
        status: "completed",
        episodes_watched:
            total_episodes,
        total_episodes:
            total_episodes || null,
        my_rating: null,
        poster_url:
            item.poster_url,
        media_type:
            item.media_type,
        start_date:
            item.start_date,
        finish_date:
            item.finish_date,
        average_episode_duration_ms:
            Number(
                item.average_episode_duration_seconds ||
                0
            ) || null,
        mal_score:
            item.mal_score ?? null,
        anilist_score:
            item.anilist_score ?? null,
        kitsu_score:
            item.kitsu_score ?? null,
        description:
            item.description,
        genres:
            item.genres || [],
        site_url:
            item.site_url,
        activity_at:
            new Date().toISOString(),
        synced_at:
            new Date().toISOString()
    };
}

async function add_anime_catalog_item_as_watched(
    item
) {
    return await merge_anime_import_rows([
        anime_catalog_watched_row(item)
    ]);
}

async function add_global_anime_watched(
    item,
    button
) {
    button.disabled = true;
    const original =
        button.textContent;
    button.textContent = "Adding...";

    try {
        const merged =
            await add_anime_catalog_item_as_watched(
                item
            );

        button.textContent = "✓ Added";
        show_toast(
            item.title +
            (merged.added
                ? " added as watched."
                : " updated in your anime library.")
        );
    } catch (error) {
        console.error(
            "Unable to add searched anime:",
            error
        );
        button.disabled = false;
        button.textContent = original;
        alert(
            "Unable to add this anime to Stellaz."
        );
    }
}

async function add_manga_catalog_item(
    item
) {
    const {data: existing,
        error: existing_error} =
        await supabase
            .from("manga_library")
            .select("id")
            .or(
                [
                    item.anilist_id
                        ? "anilist_id.eq." + Number(item.anilist_id)
                        : null,
                    item.kitsu_id
                        ? "kitsu_id.eq." + Number(item.kitsu_id)
                        : null
                ].filter(Boolean).join(",")
            )
            .limit(1);

    if (existing_error) {
        throw existing_error;
    }

    if (existing?.length) {
        return {added: false};
    }

    const {error} =
        await supabase
            .from("manga_library")
            .insert({
                anilist_id:
                    item.anilist_id || null,
                kitsu_id:
                    item.kitsu_id || null,
                title:
                    item.title,
                title_romaji:
                    item.title_romaji,
                title_native:
                    item.title_native,
                synonyms:
                    item.synonyms || [],
                country_of_origin:
                    item.country_of_origin,
                media_kind:
                    item.media_kind,
                format:
                    item.format,
                publication_status:
                    item.publication_status,
                user_status:
                    "reading",
                chapters_read: 0,
                total_chapters:
                    item.total_chapters,
                volumes_read: 0,
                total_volumes:
                    item.total_volumes,
                anilist_score:
                    item.anilist_score,
                kitsu_score:
                    item.kitsu_score || null,
                poster_url:
                    item.poster_url,
                banner_url:
                    item.banner_url,
                description:
                    item.description,
                genres:
                    item.genres || [],
                site_url:
                    item.site_url,
                start_date:
                    item.start_date,
                end_date:
                    item.end_date
            });

    if (error) throw error;

    await load_manga_library();
    return {added: true};
}

async function add_global_manga_reading(
    item,
    button
) {
    button.disabled = true;
    const original =
        button.textContent;
    button.textContent = "Adding...";

    try {
        const result =
            await add_manga_catalog_item(
                item
            );

        if (!result.added) {
            button.textContent =
                "✓ In library";
            show_toast(
                item.title +
                " is already in your library."
            );
            return;
        }

        button.textContent = "✓ Added";
        show_toast(
            item.title +
            " added to your reading library."
        );
    } catch (error) {
        console.error(
            "Unable to add searched manga:",
            error
        );
        button.disabled = false;
        button.textContent = original;
        alert(
            "Unable to add this title. Please try again."
        );
    }
}


global_search_form?.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();
        await run_global_search(
            global_search_input.value
        );
    }
);

global_search_dialog_form?.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();
        await run_global_search(
            global_search_dialog_input.value
        );
    }
);

global_search_close?.addEventListener(
    "click",
    () => global_search_dialog.close()
);

global_search_filters?.addEventListener(
    "click",
    (event) => {
        const button =
            event.target.closest(
                "[data-search-filter]"
            );
        if (!button) return;
        global_search_set_filter(
            button.dataset.searchFilter
        );
    }
);

global_search_results?.addEventListener(
    "click",
    async (event) => {
        const action_button =
            event.target.closest(
                "[data-global-search-action]"
            );
        if (!action_button) return;

        const card =
            action_button.closest(
                "[data-global-search-index]"
            );
        if (!card) return;

        const item =
            global_search_items[
                Number(
                    card.dataset
                        .globalSearchIndex
                )
            ];
        if (!item) return;

        const action =
            action_button.dataset
                .globalSearchAction;

        if (action === "details") {
            active_recommendation_type =
                item.search_type;
            global_search_dialog.close();
            await open_recommendation_details(
                item
            );
            return;
        }

        if (action === "watch_later") {
            action_button.disabled = true;
            const original =
                action_button.textContent;
            action_button.textContent =
                "Adding...";

            try {
                active_recommendation_type =
                    item.search_type;
                await save_recommendation_to_library(
                    item,
                    "watch_later"
                );
                action_button.textContent =
                    "✓ Watch later";
                show_toast(
                    item.title +
                    " added to Watch Later."
                );
            } catch (error) {
                console.error(
                    "Unable to add search result:",
                    error
                );
                action_button.disabled = false;
                action_button.textContent =
                    original;
                alert(
                    "Unable to add that title. Please try again."
                );
            }
            return;
        }

        if (action === "anime_watched") {
            await add_global_anime_watched(
                item,
                action_button
            );
            return;
        }

        if (action === "manga_reading") {
            await add_global_manga_reading(
                item,
                action_button
            );
        }
    }
);
//#endregion


// Close modal dialogs by clicking the backdrop, while preserving clicks
// anywhere inside the dialog itself.
function enable_dialog_backdrop_close(dialog) {
    if (!dialog ||
        dialog.dataset.backdropCloseReady ===
            "true") {
        return;
    }
    dialog.dataset.backdropCloseReady =
        "true";

    dialog.addEventListener("click", (event) => {
        if (!dialog.open) return;

        // Backdrop clicks target the dialog itself. Keyboard-activated
        // buttons can emit a synthetic click at 0,0; ignoring bubbled
        // child clicks prevents Enter from being mistaken for a click
        // outside the modal.
        if (event.target !== dialog) return;

        const bounds =
            dialog.getBoundingClientRect();
        const clicked_outside =
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom;

        if (clicked_outside) {
            dialog.close();
        }
    });
}

document.querySelectorAll("dialog").forEach(enable_dialog_backdrop_close);
